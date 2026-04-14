"""First-pass open-question routing helper for the active ION kernel stack.

This module sits one layer above commit application. It does not claim the full
daemon scheduler or child-work compiler already exists. It provides the smaller
truthful path the current stack can support today: route accepted
`CommitDelta.proposed_open_questions` into persisted `OpenQuestion` records and
resolve them later so the existing scheduler/graph stack can block or release
future work lawfully.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
import re

from .graph import KernelGraph
from .index import KernelIndex
from .model import (
    CommitDelta,
    CommitDeltaStatus,
    OpenQuestion,
    OpenQuestionPriority,
    OpenQuestionStatus,
    WorkUnit,
    WorkUnitStatus,
)
from .store import KernelStore

_ROUTE_DIRECTIVE_RE = re.compile(r"^\[(?P<key>[a-z_]+)=(?P<value>[^\]]+)\]")
_QUESTION_ID_SAFE_RE = re.compile(r"[^0-9a-z]+")


class KernelQuestionRoutingError(Exception):
    """Raised when one open-question routing operation is not lawful."""


@dataclass(frozen=True)
class ParsedQuestionDirective:
    """Bounded parsed representation of one proposed open-question string."""

    question_text: str
    needed_from: str
    priority: OpenQuestionPriority
    domain: str
    scope_ref: str
    context: str | None = None
    blocking: tuple[str, ...] = ()
    parent_question_id: str | None = None


@dataclass(frozen=True)
class QuestionRoutingPreparation:
    """Resolved work-unit/delta binding plus the questions to persist."""

    work_unit: WorkUnit
    commit_delta: CommitDelta
    questions: tuple[OpenQuestion, ...]


@dataclass(frozen=True)
class QuestionRoutingResult:
    """Result of persisting routed open questions."""

    preparation: QuestionRoutingPreparation
    created_questions: tuple[OpenQuestion, ...]


@dataclass(frozen=True)
class QuestionResolutionResult:
    """Result of resolving one persisted open question."""

    question_before: OpenQuestion
    question_after: OpenQuestion


class KernelQuestionRouter:
    """Route accepted proposed questions into persisted kernel question state."""

    _ROUTABLE_DELTA_STATUSES = (
        CommitDeltaStatus.ACCEPTED,
        CommitDeltaStatus.ACCEPTED_AS_WITNESS,
    )
    _RESOLVABLE_STATUSES = (
        OpenQuestionStatus.OPEN,
        OpenQuestionStatus.ASSIGNED,
    )

    def prepare_routing(
        self,
        index: KernelIndex,
        work_unit_id: str,
        delta_id: str,
        *,
        routed_at: str | None = None,
    ) -> QuestionRoutingPreparation:
        work_unit = index.get("work_unit", work_unit_id)
        if not isinstance(work_unit, WorkUnit):
            raise KernelQuestionRoutingError(f"Unknown work unit: {work_unit_id}")
        if work_unit.status is not WorkUnitStatus.COMMITTED:
            raise KernelQuestionRoutingError(
                f"Work unit is not in COMMITTED: {work_unit_id} ({work_unit.status})"
            )

        commit_delta = index.get("commit_delta", delta_id)
        if not isinstance(commit_delta, CommitDelta):
            raise KernelQuestionRoutingError(f"Unknown commit delta: {delta_id}")
        if commit_delta.status not in self._ROUTABLE_DELTA_STATUSES:
            raise KernelQuestionRoutingError(
                f"Commit delta is not in a routable status: {delta_id} ({commit_delta.status})"
            )

        _validate_binding(work_unit, commit_delta)

        timestamp = routed_at or _iso_now()
        questions = tuple(
            self._build_question(
                work_unit=work_unit,
                commit_delta=commit_delta,
                proposal=proposal,
                position=position,
                created_at=timestamp,
            )
            for position, proposal in enumerate(commit_delta.proposed_open_questions, start=1)
        )

        return QuestionRoutingPreparation(
            work_unit=work_unit,
            commit_delta=commit_delta,
            questions=questions,
        )

    def route_commit_delta(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        work_unit_id: str,
        delta_id: str,
        *,
        routed_at: str | None = None,
    ) -> QuestionRoutingResult:
        preparation = self.prepare_routing(
            index,
            work_unit_id,
            delta_id,
            routed_at=routed_at,
        )

        for question in preparation.questions:
            store.create(question)
            index.record_added(question)

        graph.build_from_index(index)
        return QuestionRoutingResult(
            preparation=preparation,
            created_questions=preparation.questions,
        )

    def resolve_question(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        question_id: str,
        *,
        resolved_by: str,
        resolution: str,
        resolution_evidence: tuple[str, ...] = (),
        resolved_at: str | None = None,
    ) -> QuestionResolutionResult:
        record = index.get("open_question", question_id)
        if not isinstance(record, OpenQuestion):
            raise KernelQuestionRoutingError(f"Unknown open question: {question_id}")
        if record.status not in self._RESOLVABLE_STATUSES:
            raise KernelQuestionRoutingError(
                f"Open question is not resolvable from its current status: {question_id} ({record.status})"
            )

        updated = replace(
            record,
            status=OpenQuestionStatus.RESOLVED,
            resolved_by=resolved_by,
            resolved_at=resolved_at or _iso_now(),
            resolution=resolution,
            resolution_evidence=resolution_evidence,
        )
        store.replace(updated)
        index.record_changed(updated)
        graph.build_from_index(index)

        return QuestionResolutionResult(
            question_before=record,
            question_after=updated,
        )

    def _build_question(
        self,
        *,
        work_unit: WorkUnit,
        commit_delta: CommitDelta,
        proposal: str,
        position: int,
        created_at: str,
    ) -> OpenQuestion:
        parsed = _parse_question_directive(proposal, work_unit)
        question_id = _default_question_id(work_unit.work_unit_id, created_at, position)
        return OpenQuestion(
            question_id=question_id,
            created_at=created_at,
            origin_work_unit=work_unit.work_unit_id,
            origin_agent=work_unit.agent_personal_name,
            origin_transition=work_unit.transition_id,
            domain=parsed.domain,
            scope_ref=parsed.scope_ref,
            question_text=parsed.question_text,
            needed_from=parsed.needed_from,
            priority=parsed.priority,
            status=OpenQuestionStatus.OPEN,
            context=parsed.context,
            blocking=parsed.blocking,
            linked_artifacts=tuple(
                artifact.path for artifact in commit_delta.produced_artifacts
            ),
            parent_question_id=parsed.parent_question_id,
        )


IonQuestionRouter = KernelQuestionRouter


def _validate_binding(work_unit: WorkUnit, commit_delta: CommitDelta) -> None:
    if commit_delta.work_unit_id != work_unit.work_unit_id:
        raise KernelQuestionRoutingError(
            "Commit delta work-unit mismatch: "
            f"expected {work_unit.work_unit_id}, found {commit_delta.work_unit_id}"
        )
    if commit_delta.protocol_id != work_unit.protocol_id:
        raise KernelQuestionRoutingError(
            "Commit delta protocol mismatch: "
            f"expected {work_unit.protocol_id}, found {commit_delta.protocol_id}"
        )
    if commit_delta.transition_id != work_unit.transition_id:
        raise KernelQuestionRoutingError(
            "Commit delta transition mismatch: "
            f"expected {work_unit.transition_id}, found {commit_delta.transition_id}"
        )
    if commit_delta.agent_personal_name != work_unit.agent_personal_name:
        raise KernelQuestionRoutingError(
            "Commit delta personal-name mismatch: "
            f"expected {work_unit.agent_personal_name}, found {commit_delta.agent_personal_name}"
        )
    if commit_delta.agent_structural_id != work_unit.agent_structural_id:
        raise KernelQuestionRoutingError(
            "Commit delta structural-identity mismatch: "
            f"expected {work_unit.agent_structural_id}, found {commit_delta.agent_structural_id}"
        )


def _parse_question_directive(proposal: str, work_unit: WorkUnit) -> ParsedQuestionDirective:
    remaining = proposal.strip()
    directives: dict[str, str] = {}

    while True:
        match = _ROUTE_DIRECTIVE_RE.match(remaining)
        if not match:
            break
        directives[match.group("key").strip().lower()] = match.group("value").strip()
        remaining = remaining[match.end() :].lstrip()

    if not remaining:
        raise KernelQuestionRoutingError("Proposed open question is missing question text.")

    return ParsedQuestionDirective(
        question_text=remaining,
        needed_from=directives.get("needed_from", "UNSPECIFIED"),
        priority=_parse_priority(directives.get("priority")),
        domain=directives.get("domain", work_unit.agent_domain),
        scope_ref=directives.get("scope", work_unit.scope_ref),
        context=directives.get("context"),
        blocking=_parse_csv(directives.get("blocking")),
        parent_question_id=directives.get("parent"),
    )


def _parse_priority(value: str | None) -> OpenQuestionPriority:
    if value is None:
        return OpenQuestionPriority.P2_NORMAL
    try:
        return OpenQuestionPriority(value)
    except ValueError as exc:
        raise KernelQuestionRoutingError(f"Unknown open-question priority: {value}") from exc


def _parse_csv(value: str | None) -> tuple[str, ...]:
    if value is None or not value.strip():
        return ()
    return tuple(part.strip() for part in value.split(",") if part.strip())


def _default_question_id(work_unit_id: str, created_at: str, position: int) -> str:
    suffix = _QUESTION_ID_SAFE_RE.sub("", created_at.lower())
    return f"oq-{work_unit_id}-{suffix}-{position:02d}"


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
