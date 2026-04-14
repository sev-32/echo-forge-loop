"""First-pass held-review escalation helper for the active ION kernel stack.

This module sits one layer above validation hold state. It does not claim a full
review workflow or reviewer daemon already exists. It provides the smaller
truthful path the current stack can support today: turn a persisted
`REQUIRES_REVIEW` commit delta into a durable review-shaped `OpenQuestion` so the
runtime can externalize review pressure without escalating the same held review
indefinitely.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from .graph import KernelGraph
from .index import KernelIndex
from .model import (
    CommitDelta,
    CommitDeltaStatus,
    OpenQuestion,
    OpenQuestionPriority,
    OpenQuestionStatus,
    WorkPriority,
    WorkUnit,
    WorkUnitStatus,
)
from .store import KernelStore
from .runtime_state_views import KernelRuntimeStateView, RuntimeReviewPressure
from .runtime_reporting import KernelRuntimeStateReporter
from .runtime_report_artifacts import KernelRuntimeReportArtifactEmitter, RuntimeReportArtifactResult
from .runtime_report_triggers import (
    KernelRuntimeReportTriggerManager,
    RuntimeReportTriggerReceipt,
    RuntimeReportTriggerRequest,
)


REVIEW_DOMAIN = "validation_review"
_REVIEW_ID_SAFE_RE = re.compile(r"[^0-9a-z]+")


class KernelReviewEscalationError(Exception):
    """Raised when one held-review escalation cannot be completed lawfully."""


@dataclass(frozen=True)
class ReviewEscalationPreparation:
    work_unit: WorkUnit
    commit_delta: CommitDelta
    review_question: OpenQuestion


@dataclass(frozen=True)
class ReviewEscalationResult:
    preparation: ReviewEscalationPreparation
    created_question: OpenQuestion
    triggered_artifacts: tuple[RuntimeReportTriggerReceipt, ...] = ()


class KernelReviewEscalator:
    """Escalate one held review into durable open-question state."""

    def __init__(
        self,
        *,
        runtime_state_view: KernelRuntimeStateView | None = None,
        runtime_reporter: KernelRuntimeStateReporter | None = None,
        runtime_report_emitter: KernelRuntimeReportArtifactEmitter | None = None,
        runtime_report_trigger_manager: KernelRuntimeReportTriggerManager | None = None,
    ) -> None:
        self._runtime_state_view = runtime_state_view or KernelRuntimeStateView()
        self._runtime_reporter = runtime_reporter or KernelRuntimeStateReporter(runtime_state_view=self._runtime_state_view)
        self._runtime_report_emitter = runtime_report_emitter or KernelRuntimeReportArtifactEmitter(runtime_reporter=self._runtime_reporter)
        self._runtime_report_trigger_manager = runtime_report_trigger_manager or KernelRuntimeReportTriggerManager(runtime_report_emitter=self._runtime_report_emitter, runtime_state_view=self._runtime_state_view)

    def prepare_escalation(
        self,
        index: KernelIndex,
        work_unit_id: str,
        delta_id: str,
        *,
        escalated_at: str,
    ) -> ReviewEscalationPreparation:
        work_unit = index.get("work_unit", work_unit_id)
        if not isinstance(work_unit, WorkUnit):
            raise KernelReviewEscalationError(f"Unknown work unit: {work_unit_id}")
        if work_unit.status is not WorkUnitStatus.VALIDATING:
            raise KernelReviewEscalationError(
                f"Work unit is not in VALIDATING: {work_unit_id} ({work_unit.status})"
            )

        commit_delta = index.get("commit_delta", delta_id)
        if not isinstance(commit_delta, CommitDelta):
            raise KernelReviewEscalationError(f"Unknown commit delta: {delta_id}")
        if commit_delta.status is not CommitDeltaStatus.REQUIRES_REVIEW:
            raise KernelReviewEscalationError(
                f"Commit delta is not in REQUIRES_REVIEW: {delta_id} ({commit_delta.status})"
            )

        _validate_binding(work_unit, commit_delta)
        if has_review_escalation(index, delta_id):
            raise KernelReviewEscalationError(
                f"Held review already escalated: {delta_id}"
            )

        reasons = commit_delta.review_reasons or ("REVIEW_REQUIRED",)
        needed_from = _needed_from(reasons)
        review_pressure = self._runtime_state_view.review_pressure_for_delta(index, commit_delta)
        review_question = OpenQuestion(
            question_id=review_question_id(delta_id),
            created_at=escalated_at,
            origin_work_unit=work_unit.work_unit_id,
            origin_agent=work_unit.agent_personal_name,
            origin_transition=work_unit.transition_id,
            domain=REVIEW_DOMAIN,
            scope_ref=work_unit.scope_ref,
            question_text=f"Validation review required for {delta_id}: {', '.join(reasons)}",
            needed_from=needed_from,
            priority=_review_priority(work_unit.priority),
            status=OpenQuestionStatus.OPEN,
            context=_review_context(delta_id, reasons, review_pressure),
            blocking=(delta_id,),
            linked_artifacts=tuple(artifact.path for artifact in commit_delta.produced_artifacts),
            linked_competitions=tuple(
                reason for reason in reasons if reason == "STALE_COMPETITOR_REVIEW"
            ),
        )
        return ReviewEscalationPreparation(
            work_unit=work_unit,
            commit_delta=commit_delta,
            review_question=review_question,
        )

    def escalate_review(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        work_unit_id: str,
        delta_id: str,
        *,
        escalated_at: str,
        artifact_trigger_request: RuntimeReportTriggerRequest | None = None,
    ) -> ReviewEscalationResult:
        preparation = self.prepare_escalation(
            index,
            work_unit_id,
            delta_id,
            escalated_at=escalated_at,
        )
        store.create(preparation.review_question)
        index.record_added(preparation.review_question)
        graph.build_from_index(index)
        triggered = self._runtime_report_trigger_manager.emit_for_review_escalation(
            index,
            preparation.review_question.question_id,
            artifact_trigger_request,
        )
        return ReviewEscalationResult(
            preparation=preparation,
            created_question=preparation.review_question,
            triggered_artifacts=triggered,
        )

    def render_review_packet(self, index: KernelIndex, question_id: str) -> str:
        return self._runtime_reporter.render_review_packet(index, question_id)

    def write_review_packet(
        self,
        index: KernelIndex,
        question_id: str,
        workspace_root: str | Path,
        *,
        output_path: str | Path | None = None,
        generated_at: str | None = None,
    ) -> RuntimeReportArtifactResult:
        return self._runtime_report_emitter.emit_review_packet_artifact(
            index,
            question_id,
            workspace_root,
            output_path=output_path,
            generated_at=generated_at,
        )


IonReviewEscalator = KernelReviewEscalator


def review_question_id(delta_id: str) -> str:
    safe = _REVIEW_ID_SAFE_RE.sub("-", delta_id.lower()).strip("-") or "review"
    return f"review-{safe}"


def has_review_escalation(index: KernelIndex, delta_id: str) -> bool:
    expected_id = review_question_id(delta_id)
    record = index.get("open_question", expected_id)
    if not isinstance(record, OpenQuestion):
        return False
    return record.domain == REVIEW_DOMAIN and record.status is not OpenQuestionStatus.CANCELLED


def _validate_binding(work_unit: WorkUnit, commit_delta: CommitDelta) -> None:
    if commit_delta.work_unit_id != work_unit.work_unit_id:
        raise KernelReviewEscalationError(
            "Commit delta work-unit mismatch: "
            f"expected {work_unit.work_unit_id}, found {commit_delta.work_unit_id}"
        )
    if commit_delta.protocol_id != work_unit.protocol_id:
        raise KernelReviewEscalationError(
            "Commit delta protocol mismatch: "
            f"expected {work_unit.protocol_id}, found {commit_delta.protocol_id}"
        )
    if commit_delta.transition_id != work_unit.transition_id:
        raise KernelReviewEscalationError(
            "Commit delta transition mismatch: "
            f"expected {work_unit.transition_id}, found {commit_delta.transition_id}"
        )
    if commit_delta.agent_personal_name != work_unit.agent_personal_name:
        raise KernelReviewEscalationError(
            "Commit delta personal-name mismatch: "
            f"expected {work_unit.agent_personal_name}, found {commit_delta.agent_personal_name}"
        )
    if commit_delta.agent_structural_id != work_unit.agent_structural_id:
        raise KernelReviewEscalationError(
            "Commit delta structural-identity mismatch: "
            f"expected {work_unit.agent_structural_id}, found {commit_delta.agent_structural_id}"
        )


def _needed_from(reasons: tuple[str, ...]) -> str:
    return "Nemesis" if "STALE_COMPETITOR_REVIEW" in reasons else "Vizier"


def _review_priority(priority: WorkPriority) -> OpenQuestionPriority:
    mapping = {
        WorkPriority.P0_CRITICAL: OpenQuestionPriority.P0_BLOCKING,
        WorkPriority.P1_HIGH: OpenQuestionPriority.P1_HIGH,
        WorkPriority.P2_NORMAL: OpenQuestionPriority.P2_NORMAL,
        WorkPriority.P3_LOW: OpenQuestionPriority.P3_LOW,
    }
    return mapping[priority]


def _review_context(delta_id: str, reasons: tuple[str, ...], pressure: RuntimeReviewPressure | None = None) -> str:
    parts = [f"delta_id={delta_id}", f"reasons={','.join(reasons)}"]
    if pressure is not None and pressure.scope_view.has_runtime_state:
        parts.append(f"runtime_reason={pressure.reason}")
        if pressure.scope_view.manifest is not None:
            parts.append(f"manifest_id={pressure.scope_view.manifest.manifest_id}")
        if pressure.scope_view.automation is not None:
            parts.append(f"automation_state_id={pressure.scope_view.automation.automation_state_id}")
    return ";".join(parts)
