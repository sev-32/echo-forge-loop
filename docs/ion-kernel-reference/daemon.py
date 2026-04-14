"""First-pass daemon arbitration helper for the active ION kernel stack.

This module does not claim the full autonomous daemon loop already exists. It provides
smaller truthful steps the current stack can support today: inspect persisted kernel
state, surface the next bounded lawful daemon action, and now include bounded generated-
state maintenance for reviewer queues and planner-manifest sweeps.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .graph import KernelGraph
from .index import KernelIndex
from .model import (
    CommitDelta,
    CommitDeltaStatus,
    KernelRecord,
    OpenQuestion,
    PlannerIntentType,
    PlannerManifest,
    PlannerManifestStatus,
    ReviewerAnswerQueueProjectionRecord,
    StrEnum,
    WorkPriority,
    WorkUnit,
    WorkUnitStatus,
)
from .planner_gate import KernelPlannerChildIssuanceGate
from .question_answers import KernelQuestionAnswerProjectionBuilder
from .reviews import REVIEW_DOMAIN, has_review_escalation
from .scheduler import KernelScheduler
from .signal_followups import SIGNAL_FOLLOWUP_DOMAIN
from .runtime_state_views import KernelRuntimeStateView
from .signals import KernelSignalConsumer


class DaemonActionType(StrEnum):
    CONSUME_ACTIVE_SIGNAL = "CONSUME_ACTIVE_SIGNAL"
    ESCALATE_REVIEW = "ESCALATE_REVIEW"
    ROUTE_OPEN_QUESTIONS = "ROUTE_OPEN_QUESTIONS"
    COMPILE_PLANNER_MANIFEST = "COMPILE_PLANNER_MANIFEST"
    SWEEP_PLANNER_MANIFESTS = "SWEEP_PLANNER_MANIFESTS"
    MAINTAIN_PLANNER_MANIFEST = "MAINTAIN_PLANNER_MANIFEST"
    AGGREGATE_PLANNER_SWEEP_RECEIPTS = "AGGREGATE_PLANNER_SWEEP_RECEIPTS"
    SWEEP_REVIEWER_QUEUES = "SWEEP_REVIEWER_QUEUES"
    REFRESH_REVIEWER_QUEUE = "REFRESH_REVIEWER_QUEUE"
    ISSUE_CHILD_WORK = "ISSUE_CHILD_WORK"
    DISPATCH_WORK = "DISPATCH_WORK"
    IDLE = "IDLE"


_ACTION_RANK = {
    DaemonActionType.CONSUME_ACTIVE_SIGNAL: 0,
    DaemonActionType.ESCALATE_REVIEW: 1,
    DaemonActionType.ROUTE_OPEN_QUESTIONS: 2,
    DaemonActionType.COMPILE_PLANNER_MANIFEST: 3,
    DaemonActionType.SWEEP_PLANNER_MANIFESTS: 4,
    DaemonActionType.MAINTAIN_PLANNER_MANIFEST: 5,
    DaemonActionType.AGGREGATE_PLANNER_SWEEP_RECEIPTS: 6,
    DaemonActionType.SWEEP_REVIEWER_QUEUES: 7,
    DaemonActionType.REFRESH_REVIEWER_QUEUE: 8,
    DaemonActionType.ISSUE_CHILD_WORK: 9,
    DaemonActionType.DISPATCH_WORK: 10,
    DaemonActionType.IDLE: 99,
}

_WORK_PRIORITY_RANK = {
    WorkPriority.P0_CRITICAL: 0,
    WorkPriority.P1_HIGH: 1,
    WorkPriority.P2_NORMAL: 2,
    WorkPriority.P3_LOW: 3,
}


@dataclass(frozen=True)
class DaemonActionCandidate(KernelRecord):
    """One bounded daemon action candidate derived from current runtime state."""

    action_type: DaemonActionType
    reason: str
    source_created_at: str
    work_priority: WorkPriority
    work_unit_id: str | None = None
    delta_id: str | None = None
    question_id: str | None = None
    signal_id: str | None = None
    signal_path: str | None = None
    manifest_id: str | None = None
    projection_id: str | None = None
    detail_count: int = 0

    def sort_key(self) -> tuple[int, int, str, str]:
        return (
            _ACTION_RANK[self.action_type],
            _WORK_PRIORITY_RANK[self.work_priority],
            self.source_created_at,
            self.projection_id
            or self.manifest_id
            or self.work_unit_id
            or self.delta_id
            or self.question_id
            or self.signal_id
            or "",
        )


@dataclass(frozen=True)
class DaemonArbitrationResult:
    """Chosen next action plus the ordered candidate set considered."""

    chosen_action: DaemonActionCandidate
    candidates: tuple[DaemonActionCandidate, ...]


class KernelDaemonArbiter:
    """Choose the next highest-priority lawful daemon action from current state."""

    _ROUTABLE_DELTA_STATUSES = (
        CommitDeltaStatus.ACCEPTED,
        CommitDeltaStatus.ACCEPTED_AS_WITNESS,
    )

    def __init__(
        self,
        *,
        scheduler: KernelScheduler | None = None,
        signal_consumer: KernelSignalConsumer | None = None,
        planner_gate: KernelPlannerChildIssuanceGate | None = None,
        question_answer_projection_builder: KernelQuestionAnswerProjectionBuilder | None = None,
        runtime_state_view: KernelRuntimeStateView | None = None,
    ) -> None:
        self._scheduler = scheduler or KernelScheduler()
        self._signal_consumer = signal_consumer or KernelSignalConsumer()
        self._planner_gate = planner_gate or KernelPlannerChildIssuanceGate()
        self._question_answer_projection_builder = (
            question_answer_projection_builder or KernelQuestionAnswerProjectionBuilder()
        )
        self._runtime_state_view = runtime_state_view or KernelRuntimeStateView()

    def gather_candidates(
        self,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        workspace_root: str | Path | None = None,
        signals_dir: str = "ION/05_context/signals",
        signal_target: str | None = "DAEMON",
        planner_as_of: str | None = None,
    ) -> tuple[DaemonActionCandidate, ...]:
        candidates: list[DaemonActionCandidate] = []
        candidates.extend(
            self._signal_candidates(
                workspace_root=workspace_root,
                signals_dir=signals_dir,
                signal_target=signal_target,
            )
        )
        candidates.extend(self._review_candidates(index))
        candidates.extend(self._question_candidates(index))
        candidates.extend(self._planner_compile_candidates(index))
        candidates.extend(self._planner_maintenance_candidates(index, planner_as_of=planner_as_of))
        candidates.extend(self._planner_sweep_aggregate_candidates(index))
        candidates.extend(self._reviewer_queue_candidates(index))
        candidates.extend(self._child_candidates(index))
        candidates.extend(self._dispatch_candidates(index, graph))
        return tuple(sorted(candidates, key=lambda item: item.sort_key()))

    def choose_next_action(
        self,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        workspace_root: str | Path | None = None,
        signals_dir: str = "ION/05_context/signals",
        signal_target: str | None = "DAEMON",
        planner_as_of: str | None = None,
    ) -> DaemonArbitrationResult:
        candidates = self.gather_candidates(
            index,
            graph,
            workspace_root=workspace_root,
            signals_dir=signals_dir,
            signal_target=signal_target,
            planner_as_of=planner_as_of,
        )
        if not candidates:
            idle = DaemonActionCandidate(
                action_type=DaemonActionType.IDLE,
                reason="NO_LAWFUL_ACTIONS_AVAILABLE",
                source_created_at="",
                work_priority=WorkPriority.P3_LOW,
            )
            return DaemonArbitrationResult(chosen_action=idle, candidates=(idle,))
        return DaemonArbitrationResult(chosen_action=candidates[0], candidates=candidates)

    def _signal_candidates(
        self,
        *,
        workspace_root: str | Path | None,
        signals_dir: str,
        signal_target: str | None,
    ) -> tuple[DaemonActionCandidate, ...]:
        if workspace_root is None:
            return ()
        discovered = self._signal_consumer.discover_active_signals(
            workspace_root,
            signals_dir=signals_dir,
            target=signal_target,
        )
        return tuple(
            DaemonActionCandidate(
                action_type=DaemonActionType.CONSUME_ACTIVE_SIGNAL,
                reason=f"ACTIVE_SIGNAL:{_signal_type_text(signal_ref.signal.signal_type)}",
                source_created_at=signal_ref.signal.created_at,
                work_priority=signal_ref.signal.priority,
                signal_id=signal_ref.signal.signal_id,
                signal_path=str(signal_ref.path),
                work_unit_id=signal_ref.signal.source_work_unit,
                detail_count=len(signal_ref.signal.related_artifacts),
            )
            for signal_ref in discovered
        )

    def _review_candidates(self, index: KernelIndex) -> tuple[DaemonActionCandidate, ...]:
        candidates: list[DaemonActionCandidate] = []
        for delta in index.commit_deltas_by_status(CommitDeltaStatus.REQUIRES_REVIEW):
            if has_review_escalation(index, delta.delta_id):
                continue
            work_unit = index.get("work_unit", delta.work_unit_id)
            review_pressure = self._runtime_state_view.review_pressure_for_delta(index, delta)
            if isinstance(work_unit, WorkUnit):
                priority = work_unit.priority
                work_unit_id = work_unit.work_unit_id
            else:
                priority = WorkPriority.P2_NORMAL
                work_unit_id = delta.work_unit_id
            source_created_at = review_pressure.source_created_at or getattr(work_unit, "created_at", delta.created_at)
            reason = (review_pressure.reason if review_pressure.requires_review else "VALIDATION_REQUIRES_REVIEW")
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.ESCALATE_REVIEW,
                    reason=reason,
                    source_created_at=source_created_at,
                    work_priority=priority,
                    work_unit_id=work_unit_id,
                    delta_id=delta.delta_id,
                    detail_count=len(review_pressure.detail_refs),
                )
            )
        return tuple(candidates)

    def _question_candidates(self, index: KernelIndex) -> tuple[DaemonActionCandidate, ...]:
        candidates: list[DaemonActionCandidate] = []
        for delta in self._accepted_deltas(index):
            if not delta.proposed_open_questions:
                continue
            if self._has_routed_questions(index, delta):
                continue
            work_unit = index.get("work_unit", delta.work_unit_id)
            if not isinstance(work_unit, WorkUnit):
                continue
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.ROUTE_OPEN_QUESTIONS,
                    reason="ACCEPTED_DELTA_HAS_UNROUTED_OPEN_QUESTIONS",
                    source_created_at=work_unit.created_at,
                    work_priority=work_unit.priority,
                    work_unit_id=work_unit.work_unit_id,
                    delta_id=delta.delta_id,
                    detail_count=len(delta.proposed_open_questions),
                )
            )
        return tuple(candidates)

    def _planner_compile_candidates(self, index: KernelIndex) -> tuple[DaemonActionCandidate, ...]:
        candidates: list[DaemonActionCandidate] = []
        for compile_candidate in self._planner_gate.discover_compile_candidates(index):
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.COMPILE_PLANNER_MANIFEST,
                    reason="RESOLVED_PRESSURE_HAS_COMPILABLE_PLANNER_DELTA",
                    source_created_at=compile_candidate.planner_commit_delta.created_at,
                    work_priority=compile_candidate.parent_work_unit.priority,
                    work_unit_id=compile_candidate.parent_work_unit.work_unit_id,
                    delta_id=compile_candidate.planner_commit_delta.delta_id,
                    question_id=compile_candidate.resolved_question.question_id,
                    detail_count=len(compile_candidate.planner_commit_delta.proposed_child_work_units),
                )
            )
        return tuple(candidates)

    def _planner_maintenance_candidates(
        self,
        index: KernelIndex,
        *,
        planner_as_of: str | None,
    ) -> tuple[DaemonActionCandidate, ...]:
        as_of = planner_as_of or _iso_now()
        discovered = self._planner_gate.discover_maintenance_candidates(index, as_of=as_of)
        if len(discovered) > 1:
            priority = min(
                (_manifest_priority(index, item.planner_manifest) for item in discovered),
                key=lambda value: _WORK_PRIORITY_RANK[value],
            )
            return (
                DaemonActionCandidate(
                    action_type=DaemonActionType.SWEEP_PLANNER_MANIFESTS,
                    reason="BROAD_MANIFEST_HOUSEKEEPING_SWEEP",
                    source_created_at=discovered[0].planner_manifest.created_at,
                    work_priority=priority,
                    manifest_id=discovered[0].planner_manifest.manifest_id,
                    detail_count=len(discovered),
                ),
            )

        candidates: list[DaemonActionCandidate] = []
        for maintenance in discovered:
            manifest = maintenance.planner_manifest
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.MAINTAIN_PLANNER_MANIFEST,
                    reason=maintenance.reason,
                    source_created_at=manifest.created_at,
                    work_priority=_manifest_priority(index, manifest),
                    work_unit_id=manifest.parent_work_unit_id,
                    delta_id=manifest.planner_delta_id,
                    question_id=manifest.source_question_id,
                    manifest_id=manifest.manifest_id,
                    detail_count=manifest.child_spec_count,
                )
            )
        return tuple(candidates)

    def _planner_sweep_aggregate_candidates(self, index: KernelIndex) -> tuple[DaemonActionCandidate, ...]:
        if not self._planner_gate.needs_sweep_aggregate(index):
            return ()
        receipts = self._planner_gate.retained_sweep_receipts(index)
        if not receipts:
            return ()
        return (
            DaemonActionCandidate(
                action_type=DaemonActionType.AGGREGATE_PLANNER_SWEEP_RECEIPTS,
                reason="RETAINED_SWEEP_RECEIPTS_REQUIRE_AGGREGATION",
                source_created_at=receipts[0].generated_at,
                work_priority=WorkPriority.P2_NORMAL,
                detail_count=len(receipts),
            ),
        )

    def _reviewer_queue_candidates(self, index: KernelIndex) -> tuple[DaemonActionCandidate, ...]:
        discovered = self._question_answer_projection_builder.discover_refresh_candidates(index)
        if len(discovered) > 1:
            priority = min(
                (_reviewer_queue_priority(index, item.projection) for item in discovered),
                key=lambda value: _WORK_PRIORITY_RANK[value],
            )
            return (
                DaemonActionCandidate(
                    action_type=DaemonActionType.SWEEP_REVIEWER_QUEUES,
                    reason="BROAD_REVIEWER_QUEUE_REFRESH_SWEEP",
                    source_created_at=discovered[0].projection.generated_at,
                    work_priority=priority,
                    projection_id=discovered[0].projection.projection_id,
                    detail_count=len(discovered),
                ),
            )
        candidates: list[DaemonActionCandidate] = []
        for refresh in discovered:
            projection = refresh.projection
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.REFRESH_REVIEWER_QUEUE,
                    reason=refresh.reason,
                    source_created_at=projection.generated_at,
                    work_priority=_reviewer_queue_priority(index, projection),
                    projection_id=projection.projection_id,
                    detail_count=projection.pending_total_count + projection.recent_answer_total_count,
                )
            )
        return tuple(candidates)

    def _child_candidates(self, index: KernelIndex) -> tuple[DaemonActionCandidate, ...]:
        candidates: list[DaemonActionCandidate] = []
        for manifest in index.planner_manifests_by_status(PlannerManifestStatus.READY):
            if manifest.intent is not PlannerIntentType.ISSUE_CHILD_WORK:
                continue
            if self._has_issued_children(index, manifest.parent_work_unit_id):
                continue
            work_unit = index.get("work_unit", manifest.parent_work_unit_id)
            if not isinstance(work_unit, WorkUnit):
                continue
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.ISSUE_CHILD_WORK,
                    reason="READY_PLANNER_MANIFEST_HAS_UNISSUED_CHILD_WORK",
                    source_created_at=manifest.created_at,
                    work_priority=work_unit.priority,
                    work_unit_id=work_unit.work_unit_id,
                    delta_id=manifest.planner_delta_id,
                    question_id=manifest.source_question_id,
                    manifest_id=manifest.manifest_id,
                    detail_count=manifest.child_spec_count,
                )
            )

        for delta in self._accepted_deltas(index):
            if not delta.proposed_child_work_units:
                continue
            if self._ready_manifest_exists_for_delta(index, delta.delta_id):
                continue
            if self._delta_requires_planner_manifest(index, delta):
                continue
            if self._has_issued_children(index, delta.work_unit_id):
                continue
            work_unit = index.get("work_unit", delta.work_unit_id)
            if not isinstance(work_unit, WorkUnit):
                continue
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.ISSUE_CHILD_WORK,
                    reason="ACCEPTED_DELTA_HAS_UNISSUED_CHILD_WORK",
                    source_created_at=work_unit.created_at,
                    work_priority=work_unit.priority,
                    work_unit_id=work_unit.work_unit_id,
                    delta_id=delta.delta_id,
                    detail_count=len(delta.proposed_child_work_units),
                )
            )
        return tuple(candidates)

    def _dispatch_candidates(
        self,
        index: KernelIndex,
        graph: KernelGraph,
    ) -> tuple[DaemonActionCandidate, ...]:
        candidates: list[DaemonActionCandidate] = []
        for assessment in self._scheduler.dispatchable_queue(index, graph):
            posture = self._runtime_state_view.dispatch_posture_for_work_unit(index, assessment.work_unit.work_unit_id)
            if not posture.dispatch_permitted:
                continue
            candidates.append(
                DaemonActionCandidate(
                    action_type=DaemonActionType.DISPATCH_WORK,
                    reason=assessment.reason.value,
                    source_created_at=posture.source_created_at or assessment.work_unit.created_at,
                    work_priority=assessment.work_unit.priority,
                    work_unit_id=assessment.work_unit.work_unit_id,
                )
            )
        return tuple(candidates)

    def _accepted_deltas(self, index: KernelIndex) -> tuple[CommitDelta, ...]:
        deltas: list[CommitDelta] = []
        for status in self._ROUTABLE_DELTA_STATUSES:
            deltas.extend(index.commit_deltas_by_status(status))
        return tuple(deltas)

    def _has_routed_questions(self, index: KernelIndex, delta: CommitDelta) -> bool:
        for record in index.records_for_work_unit(delta.work_unit_id):
            if isinstance(record, OpenQuestion) and record.origin_work_unit == delta.work_unit_id:
                return True
        return False

    def _has_issued_children(self, index: KernelIndex, parent_work_unit_id: str) -> bool:
        for record in index.records_by_type("work_unit"):
            if isinstance(record, WorkUnit) and record.parent_work_unit_id == parent_work_unit_id:
                return True
        return False

    def _ready_manifest_exists_for_delta(self, index: KernelIndex, delta_id: str) -> bool:
        return any(
            isinstance(record, PlannerManifest)
            and record.planner_delta_id == delta_id
            and record.intent is PlannerIntentType.ISSUE_CHILD_WORK
            and record.status is PlannerManifestStatus.READY
            for record in index.records_by_type("planner_manifest")
        )

    def _delta_requires_planner_manifest(self, index: KernelIndex, delta: CommitDelta) -> bool:
        for question_id in delta.resolved_question_ids:
            question = index.get("open_question", question_id)
            if isinstance(question, OpenQuestion) and question.domain in {REVIEW_DOMAIN, SIGNAL_FOLLOWUP_DOMAIN}:
                return True
        return False


IonDaemonArbiter = KernelDaemonArbiter


def _signal_type_text(value: object) -> str:
    return getattr(value, "value", str(value))


def _reviewer_queue_priority(
    index: KernelIndex,
    projection: ReviewerAnswerQueueProjectionRecord,
) -> WorkPriority:
    best: WorkPriority | None = None
    for question_id in projection.pending_question_ids:
        question = index.get("open_question", question_id)
        if not isinstance(question, OpenQuestion):
            continue
        priority = _question_priority(question)
        if best is None or _WORK_PRIORITY_RANK[priority] < _WORK_PRIORITY_RANK[best]:
            best = priority
    return best or WorkPriority.P3_LOW


def _question_priority(question: OpenQuestion) -> WorkPriority:
    if question.priority.value.startswith("P0"):
        return WorkPriority.P0_CRITICAL
    if question.priority.value.startswith("P1"):
        return WorkPriority.P1_HIGH
    if question.priority.value.startswith("P2"):
        return WorkPriority.P2_NORMAL
    return WorkPriority.P3_LOW


def _manifest_priority(index: KernelIndex, manifest: PlannerManifest) -> WorkPriority:
    work_unit = index.get("work_unit", manifest.parent_work_unit_id)
    if isinstance(work_unit, WorkUnit):
        return work_unit.priority
    return WorkPriority.P2_NORMAL


def _iso_now() -> str:
    from datetime import datetime

    return datetime.now().astimezone().replace(microsecond=0).isoformat()
