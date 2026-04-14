"""L1 lawful orchestration scheduler surfaces for the active ION kernel stack.

This module keeps the scheduler explicitly subordinate to kernel law. It does not try
to become a second planner. Instead, it exposes one bounded L1 layer:

- assess work-unit dispatchability,
- bridge horizon pressure into schedule candidates,
- project state + commitment gradients explicitly,
- bind carriers through an explicit executor capability registry where possible,
- and persist scheduling receipts without bypassing packet law.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re

from .graph import GraphEdgeType, KernelGraph
from .horizon_state import KernelHorizonStateManager
from .index import KernelIndex
from .executor_registry import KernelExecutorCapabilityRegistry
from .model import (
    CarrierBindingSource,
    HorizonLayer,
    HorizonRecord,
    OpenQuestion,
    OpenQuestionStatus,
    ScheduleCarrier,
    ScheduleCommitment,
    ScheduleReceipt,
    ScheduleSourceKind,
    ScheduleState,
    StrEnum,
    WorkPriority,
    WorkUnit,
    WorkUnitStatus,
)
from .store import KernelStore


class KernelSchedulerError(Exception):
    """Raised when one scheduler operation cannot be completed."""


class ScheduleReason(StrEnum):
    DISPATCHABLE = "DISPATCHABLE"
    STATUS_NOT_PENDING = "STATUS_NOT_PENDING"
    WAITING_ON_DEPENDENCIES = "WAITING_ON_DEPENDENCIES"
    BLOCKED_BY_OPEN_QUESTION = "BLOCKED_BY_OPEN_QUESTION"
    WAITING_ON_DEPENDENCIES_AND_QUESTIONS = "WAITING_ON_DEPENDENCIES_AND_QUESTIONS"


_PRIORITY_RANK = {
    WorkPriority.P0_CRITICAL: 0,
    WorkPriority.P1_HIGH: 1,
    WorkPriority.P2_NORMAL: 2,
    WorkPriority.P3_LOW: 3,
    "P0_CRITICAL": 0,
    "P1_HIGH": 1,
    "P2_NORMAL": 2,
    "P3_LOW": 3,
}

_DEFAULT_DEPENDENCY_READY_STATUSES = (WorkUnitStatus.COMMITTED,)
_DEFAULT_BLOCKING_QUESTION_STATUSES = (
    OpenQuestionStatus.OPEN,
    OpenQuestionStatus.ASSIGNED,
)

_ACTIONABLE_STATES = frozenset(
    {
        ScheduleState.READY,
        ScheduleState.CLAIMED,
        ScheduleState.RETRY,
    }
)

_STATE_ORDER = {
    ScheduleState.READY: 0,
    ScheduleState.CLAIMED: 1,
    ScheduleState.RETRY: 2,
    ScheduleState.DEFERRED: 3,
    ScheduleState.FUTURE_CANDIDATE: 4,
    ScheduleState.BLOCKED: 5,
    ScheduleState.IN_FLIGHT: 6,
    ScheduleState.ENACTED_UNLANDED: 7,
    ScheduleState.STALE: 8,
}

_COMMITMENT_ORDER = {
    ScheduleCommitment.ENACTED: 0,
    ScheduleCommitment.COMMITTED: 1,
    ScheduleCommitment.PRECOMMITTED: 2,
    ScheduleCommitment.LIKELY: 3,
    ScheduleCommitment.EMERGING: 4,
    ScheduleCommitment.SPECULATIVE: 5,
    ScheduleCommitment.COMPLETED: 6,
}

_CARRIER_COST = {
    ScheduleCarrier.IDE_MANUAL: 0,
    ScheduleCarrier.SUPERVISED_RUNTIME: 1,
    ScheduleCarrier.EXTERNAL_API: 2,
    ScheduleCarrier.SWARM_CHILD: 3,
}

_ARBITRATION_FACTORS = (
    "urgency",
    "dependency_satisfaction",
    "review_pressure",
    "horizon_pressure",
    "executor_fit",
    "continuity_cost",
)

_SAFE_ID_RE = re.compile(r"[^0-9a-z]+")


@dataclass(frozen=True)
class WorkUnitDispatchAssessment:
    work_unit: WorkUnit
    dispatchable: bool
    reason: ScheduleReason
    unresolved_dependencies: tuple[str, ...] = ()
    blocking_questions: tuple[str, ...] = ()

    def sort_key(self) -> tuple[int, str, str]:
        return (
            _priority_rank(self.work_unit.priority),
            self.work_unit.created_at,
            self.work_unit.work_unit_id,
        )


@dataclass(frozen=True)
class ArbitrationPolicySurface:
    policy_id: str
    ranking_factors: tuple[str, ...]
    notes: tuple[str, ...]


@dataclass(frozen=True)
class ScheduleCandidate:
    source_kind: ScheduleSourceKind
    source_record_id: str
    source_layer: HorizonLayer | None
    created_at: str
    scope_type: str
    scope_ref: str
    candidate_id: str
    candidate_title: str
    candidate_summary: str
    scheduler_state: ScheduleState
    commitment: ScheduleCommitment
    selected_carrier: ScheduleCarrier
    carrier_binding_source: CarrierBindingSource
    selected_executor_id: str | None
    selected_capability_id: str | None
    reason: str
    priority: str
    capability_basis: tuple[str, ...] = ()
    requested_reads: tuple[str, ...] = ()
    blocking_refs: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    @property
    def actionable(self) -> bool:
        return self.scheduler_state in _ACTIONABLE_STATES

    def sort_key(self) -> tuple[int, int, int, int, int, str]:
        return (
            0 if self.actionable else 1,
            _STATE_ORDER[self.scheduler_state],
            _COMMITMENT_ORDER[self.commitment],
            _priority_rank(self.priority),
            _CARRIER_COST[self.selected_carrier],
            self.created_at,
            self.candidate_id,
        )


@dataclass(frozen=True)
class ScheduleProjection:
    generated_at: str
    policy: ArbitrationPolicySurface
    candidates: tuple[ScheduleCandidate, ...]
    selected_candidate: ScheduleCandidate | None
    scope_type: str | None = None
    scope_ref: str | None = None


class KernelScheduler:
    """Compute L0 schedule projections from the current kernel state."""

    def __init__(
        self,
        *,
        dependency_ready_statuses: tuple[WorkUnitStatus, ...] = _DEFAULT_DEPENDENCY_READY_STATUSES,
        blocking_question_statuses: tuple[OpenQuestionStatus, ...] = _DEFAULT_BLOCKING_QUESTION_STATUSES,
    ) -> None:
        self._dependency_ready_statuses = tuple(dependency_ready_statuses)
        self._blocking_question_statuses = tuple(blocking_question_statuses)
        self._horizon_manager = KernelHorizonStateManager()
        self._executor_registry = KernelExecutorCapabilityRegistry()

    def policy_surface(self) -> ArbitrationPolicySurface:
        return ArbitrationPolicySurface(
            policy_id="L1_SCHEDULER_V1",
            ranking_factors=_ARBITRATION_FACTORS,
            notes=(
                "The scheduler remains a kernel subsystem rather than a second planner.",
                "State and commitment remain separate so blocked work can still be highly committed.",
                "Carrier binding is a proposal surface and must not bypass packet law.",
                "Explicit executor capability records now outrank hidden carrier heuristics when an eligible match exists.",
            ),
        )

    def assess_work_unit(
        self,
        index: KernelIndex,
        graph: KernelGraph,
        work_unit_id: str,
    ) -> WorkUnitDispatchAssessment:
        record = index.get("work_unit", work_unit_id)
        if not isinstance(record, WorkUnit):
            raise KernelSchedulerError(f"Unknown work unit: {work_unit_id}")

        unresolved_dependencies = self._unresolved_dependencies(index, record)
        blocking_questions = self._blocking_questions(index, graph, record)

        if record.status is not WorkUnitStatus.PENDING:
            reason = ScheduleReason.STATUS_NOT_PENDING
            dispatchable = False
        elif unresolved_dependencies and blocking_questions:
            reason = ScheduleReason.WAITING_ON_DEPENDENCIES_AND_QUESTIONS
            dispatchable = False
        elif unresolved_dependencies:
            reason = ScheduleReason.WAITING_ON_DEPENDENCIES
            dispatchable = False
        elif blocking_questions:
            reason = ScheduleReason.BLOCKED_BY_OPEN_QUESTION
            dispatchable = False
        else:
            reason = ScheduleReason.DISPATCHABLE
            dispatchable = True

        return WorkUnitDispatchAssessment(
            work_unit=record,
            dispatchable=dispatchable,
            reason=reason,
            unresolved_dependencies=unresolved_dependencies,
            blocking_questions=blocking_questions,
        )

    def assess_all(self, index: KernelIndex, graph: KernelGraph) -> list[WorkUnitDispatchAssessment]:
        assessments = [
            self.assess_work_unit(index, graph, record.work_unit_id)
            for record in index.records_by_type("work_unit")
            if isinstance(record, WorkUnit)
        ]
        return sorted(assessments, key=lambda item: item.sort_key())

    def dispatchable_queue(
        self,
        index: KernelIndex,
        graph: KernelGraph,
    ) -> list[WorkUnitDispatchAssessment]:
        return [
            assessment
            for assessment in self.assess_all(index, graph)
            if assessment.dispatchable
        ]

    def next_dispatchable(
        self,
        index: KernelIndex,
        graph: KernelGraph,
    ) -> WorkUnitDispatchAssessment | None:
        queue = self.dispatchable_queue(index, graph)
        return queue[0] if queue else None

    def build_schedule_projection(
        self,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        scope_type: str | None = None,
        scope_ref: str | None = None,
        generated_at: str | None = None,
    ) -> ScheduleProjection:
        normalized_scope = _normalize_scope_filter(scope_type, scope_ref)
        candidates = [
            *self._work_unit_candidates(index, graph, normalized_scope),
            *self._horizon_candidates(index, normalized_scope),
        ]
        candidates.sort(key=lambda item: item.sort_key())
        selected = next((candidate for candidate in candidates if candidate.actionable), None)
        return ScheduleProjection(
            generated_at=generated_at or _iso_now(),
            policy=self.policy_surface(),
            candidates=tuple(candidates),
            selected_candidate=selected,
            scope_type=(None if normalized_scope is None else normalized_scope[0]),
            scope_ref=(None if normalized_scope is None else normalized_scope[1]),
        )

    def render_schedule_projection(self, projection: ScheduleProjection) -> dict[str, object]:
        return {
            "generated_at": projection.generated_at,
            "policy_id": projection.policy.policy_id,
            "ranking_factors": list(projection.policy.ranking_factors),
            "policy_notes": list(projection.policy.notes),
            "scope_type": projection.scope_type,
            "scope_ref": projection.scope_ref,
            "selected_candidate": (
                None
                if projection.selected_candidate is None
                else _candidate_projection(projection.selected_candidate)
            ),
            "candidates": [_candidate_projection(candidate) for candidate in projection.candidates],
        }

    def persist_schedule_receipt(
        self,
        store: KernelStore,
        index: KernelIndex,
        candidate: ScheduleCandidate,
        *,
        created_at: str | None = None,
        policy_id: str | None = None,
    ) -> ScheduleReceipt:
        timestamp = created_at or _iso_now()
        receipt = ScheduleReceipt(
            receipt_id=schedule_receipt_id(
                candidate.scope_type,
                candidate.scope_ref,
                candidate.source_kind.value,
                candidate.candidate_id,
                timestamp,
            ),
            created_at=timestamp,
            policy_id=policy_id or self.policy_surface().policy_id,
            scope_type=candidate.scope_type,
            scope_ref=candidate.scope_ref,
            source_kind=candidate.source_kind,
            source_record_id=candidate.source_record_id,
            source_layer=candidate.source_layer,
            candidate_id=candidate.candidate_id,
            candidate_title=candidate.candidate_title,
            scheduler_state=candidate.scheduler_state,
            commitment=candidate.commitment,
            selected_carrier=candidate.selected_carrier,
            carrier_binding_source=candidate.carrier_binding_source,
            selected_executor_id=candidate.selected_executor_id,
            selected_capability_id=candidate.selected_capability_id,
            reason=candidate.reason,
            ranking_factors=self.policy_surface().ranking_factors,
            capability_basis=candidate.capability_basis,
            requested_reads=candidate.requested_reads,
            blocking_refs=candidate.blocking_refs,
            warnings=candidate.warnings,
        )
        if index.exists("schedule_receipt", receipt.receipt_id):
            store.replace(receipt)
            index.record_changed(receipt)
        else:
            store.create(receipt)
            index.record_added(receipt)
        return receipt

    def record_selected_candidate(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        scope_type: str | None = None,
        scope_ref: str | None = None,
        created_at: str | None = None,
    ) -> ScheduleReceipt:
        projection = self.build_schedule_projection(
            index,
            graph,
            scope_type=scope_type,
            scope_ref=scope_ref,
            generated_at=created_at,
        )
        candidate = projection.selected_candidate
        if candidate is None:
            raise KernelSchedulerError("No actionable schedule candidate is available to record.")
        return self.persist_schedule_receipt(
            store,
            index,
            candidate,
            created_at=created_at,
            policy_id=projection.policy.policy_id,
        )

    def latest_schedule_receipt(
        self,
        index: KernelIndex,
        scope_type: str | None = None,
        scope_ref: str | None = None,
    ) -> ScheduleReceipt | None:
        normalized_scope = _normalize_scope_filter(scope_type, scope_ref, allow_empty=True)
        if normalized_scope is None:
            receipts = [
                record
                for record in index.records_by_type("schedule_receipt")
                if isinstance(record, ScheduleReceipt)
            ]
        else:
            receipts = index.schedule_receipts_for_scope(normalized_scope[0], normalized_scope[1])
        if not receipts:
            return None
        receipts.sort(key=lambda item: (item.created_at, item.receipt_id))
        return receipts[-1]

    def render_schedule_receipt_projection(self, receipt: ScheduleReceipt | None) -> dict[str, object] | None:
        if receipt is None:
            return None
        return {
            "receipt_id": receipt.receipt_id,
            "created_at": receipt.created_at,
            "policy_id": receipt.policy_id,
            "scope_type": receipt.scope_type,
            "scope_ref": receipt.scope_ref,
            "source_kind": receipt.source_kind.value,
            "source_record_id": receipt.source_record_id,
            "source_layer": (None if receipt.source_layer is None else receipt.source_layer.value),
            "candidate_id": receipt.candidate_id,
            "candidate_title": receipt.candidate_title,
            "scheduler_state": receipt.scheduler_state.value,
            "commitment": receipt.commitment.value,
            "selected_carrier": receipt.selected_carrier.value,
            "carrier_binding_source": receipt.carrier_binding_source.value,
            "selected_executor_id": receipt.selected_executor_id,
            "selected_capability_id": receipt.selected_capability_id,
            "reason": receipt.reason,
            "ranking_factors": list(receipt.ranking_factors),
            "capability_basis": list(receipt.capability_basis),
            "requested_reads": list(receipt.requested_reads),
            "blocking_refs": list(receipt.blocking_refs),
            "warnings": list(receipt.warnings),
        }

    def _work_unit_candidates(
        self,
        index: KernelIndex,
        graph: KernelGraph,
        scope_filter: tuple[str, str] | None,
    ) -> list[ScheduleCandidate]:
        candidates: list[ScheduleCandidate] = []
        for assessment in self.assess_all(index, graph):
            record = assessment.work_unit
            if record.status is WorkUnitStatus.COMMITTED:
                continue
            if scope_filter is not None and not _work_unit_matches_scope(record, scope_filter):
                continue

            state, commitment = _work_unit_schedule_posture(record, assessment)
            preferred_carrier = _infer_carrier(record.chassis, fallback=ScheduleCarrier.IDE_MANUAL)
            (
                carrier,
                binding_source,
                selected_executor_id,
                selected_capability_id,
                capability_basis,
                binding_warnings,
            ) = self._carrier_binding(
                index,
                preferred_carrier=preferred_carrier,
                scope_type=record.scope_type.value,
                scope_ref=record.scope_ref,
                domain=record.agent_domain,
                executor_hint=" ".join(
                    item
                    for item in (record.agent_personal_name, record.agent_role, record.chassis)
                    if item
                ),
            )
            blocking_refs = assessment.unresolved_dependencies + assessment.blocking_questions
            warnings = _work_unit_warnings(record, assessment) + binding_warnings
            candidates.append(
                ScheduleCandidate(
                    source_kind=ScheduleSourceKind.WORK_UNIT,
                    source_record_id=record.work_unit_id,
                    source_layer=None,
                    created_at=record.created_at,
                    scope_type=record.scope_type.value,
                    scope_ref=record.scope_ref,
                    candidate_id=record.work_unit_id,
                    candidate_title=f"Execute {record.scope_ref}",
                    candidate_summary=f"Work unit {record.work_unit_id} is currently {record.status.value}.",
                    scheduler_state=state,
                    commitment=commitment,
                    selected_carrier=carrier,
                    carrier_binding_source=binding_source,
                    selected_executor_id=selected_executor_id,
                    selected_capability_id=selected_capability_id,
                    reason=assessment.reason.value,
                    priority=record.priority.value,
                    capability_basis=capability_basis,
                    requested_reads=(record.scope_ref,),
                    blocking_refs=blocking_refs,
                    warnings=warnings,
                )
            )
        return candidates

    def _horizon_candidates(
        self,
        index: KernelIndex,
        scope_filter: tuple[str, str] | None,
    ) -> list[ScheduleCandidate]:
        scope_keys = {
            (record.scope_type, record.scope_ref)
            for record in index.records_by_type("horizon_state")
            if isinstance(record, HorizonRecord)
        }
        if scope_filter is not None:
            scope_keys = {scope_key for scope_key in scope_keys if scope_key == scope_filter}

        candidates: list[ScheduleCandidate] = []
        for scope_type, scope_ref in sorted(scope_keys):
            tightening = self._horizon_manager.tighten_for_scope(index, scope_type, scope_ref)
            candidate = tightening.candidate_item
            if candidate is None:
                continue
            summary = self._horizon_manager.scope_summary(index, scope_type, scope_ref)
            source_record = _source_record_from_summary(summary, tightening.source_layer)
            receipt = self._horizon_manager.latest_enactment_receipt(index, scope_type, scope_ref)
            state, commitment = _horizon_schedule_posture(
                tightening,
                candidate_dependency_refs=candidate.dependency_refs,
                candidate_item_id=candidate.item_id,
                latest_receipt=receipt,
            )
            preferred_carrier = _infer_carrier(candidate.executor_hint, fallback=ScheduleCarrier.IDE_MANUAL)
            (
                carrier,
                binding_source,
                selected_executor_id,
                selected_capability_id,
                capability_basis,
                binding_warnings,
            ) = self._carrier_binding(
                index,
                preferred_carrier=preferred_carrier,
                scope_type=scope_type,
                scope_ref=scope_ref,
                executor_hint=candidate.executor_hint,
            )
            candidates.append(
                ScheduleCandidate(
                    source_kind=ScheduleSourceKind.HORIZON,
                    source_record_id=(source_record.horizon_id if source_record is not None else f"{scope_type}:{scope_ref}"),
                    source_layer=tightening.source_layer,
                    created_at=(source_record.updated_at if source_record is not None else _iso_now()),
                    scope_type=scope_type,
                    scope_ref=scope_ref,
                    candidate_id=candidate.item_id,
                    candidate_title=candidate.title,
                    candidate_summary=candidate.summary,
                    scheduler_state=state,
                    commitment=commitment,
                    selected_carrier=carrier,
                    carrier_binding_source=binding_source,
                    selected_executor_id=selected_executor_id,
                    selected_capability_id=selected_capability_id,
                    reason=tightening.status,
                    priority=candidate.priority,
                    capability_basis=capability_basis,
                    requested_reads=tightening.requested_reads,
                    blocking_refs=candidate.dependency_refs,
                    warnings=tightening.warnings + binding_warnings,
                )
            )
        return candidates

    def _carrier_binding(
        self,
        index: KernelIndex,
        *,
        preferred_carrier: ScheduleCarrier,
        scope_type: str,
        scope_ref: str,
        domain: str | None = None,
        executor_hint: str | None = None,
    ) -> tuple[
        ScheduleCarrier,
        CarrierBindingSource,
        str | None,
        str | None,
        tuple[str, ...],
        tuple[str, ...],
    ]:
        selection = self._executor_registry.select_capability(
            index,
            preferred_carrier=preferred_carrier,
            scope_type=scope_type,
            scope_ref=scope_ref,
            domain=domain,
            executor_hint=executor_hint,
        )
        if selection.selected_capability is None:
            if selection.registry_count == 0:
                basis = (
                    "No executor capability records are registered; carrier remains heuristic.",
                )
            else:
                basis = (
                    "No eligible executor capability matched this candidate; carrier remains heuristic.",
                )
            return (
                preferred_carrier,
                CarrierBindingSource.HEURISTIC_FALLBACK,
                None,
                None,
                basis,
                selection.warnings,
            )

        capability = selection.selected_capability
        return (
            capability.carrier,
            CarrierBindingSource.EXECUTOR_CAPABILITY_REGISTRY,
            capability.executor_id,
            capability.capability_id,
            selection.capability_basis,
            selection.warnings,
        )

    def _unresolved_dependencies(
        self,
        index: KernelIndex,
        work_unit: WorkUnit,
    ) -> tuple[str, ...]:
        unresolved: list[str] = []
        for dependency_id in work_unit.dependencies:
            dependency = index.get("work_unit", dependency_id)
            if not isinstance(dependency, WorkUnit):
                unresolved.append(dependency_id)
                continue
            if dependency.status not in self._dependency_ready_statuses:
                unresolved.append(dependency_id)
        return tuple(unresolved)

    def _blocking_questions(
        self,
        index: KernelIndex,
        graph: KernelGraph,
        work_unit: WorkUnit,
    ) -> tuple[str, ...]:
        question_ids: list[str] = []
        work_node = graph.node_id("work_unit", work_unit.work_unit_id)

        if graph.has_node(work_node):
            for question_node in graph.predecessors(work_node, GraphEdgeType.BLOCKS_WORK):
                if question_node.startswith("open_question:"):
                    question_ids.append(question_node.split(":", 1)[1])

        if not question_ids:
            for record in index.records_by_type("open_question"):
                if isinstance(record, OpenQuestion) and work_unit.work_unit_id in record.blocking:
                    question_ids.append(record.question_id)

        unique_ids = list(dict.fromkeys(question_ids))
        blocking_ids = [
            question_id
            for question_id in unique_ids
            if self._question_is_blocking(index, question_id)
        ]
        return tuple(blocking_ids)

    def _question_is_blocking(self, index: KernelIndex, question_id: str) -> bool:
        record = index.get("open_question", question_id)
        return isinstance(record, OpenQuestion) and record.status in self._blocking_question_statuses


IonScheduler = KernelScheduler


def schedule_receipt_id(scope_type: str, scope_ref: str, source_kind: str, candidate_id: str, created_at: str) -> str:
    clean_scope_type = _slug(scope_type)
    clean_scope_ref = _slug(scope_ref)
    clean_source_kind = _slug(source_kind)
    clean_candidate = _slug(candidate_id)
    clean_created_at = _slug(created_at)
    return f"schedule-receipt-{clean_scope_type}-{clean_scope_ref}-{clean_source_kind}-{clean_candidate}-{clean_created_at}"


def _candidate_projection(candidate: ScheduleCandidate) -> dict[str, object]:
    return {
        "source_kind": candidate.source_kind.value,
        "source_record_id": candidate.source_record_id,
        "source_layer": (None if candidate.source_layer is None else candidate.source_layer.value),
        "created_at": candidate.created_at,
        "scope_type": candidate.scope_type,
        "scope_ref": candidate.scope_ref,
        "candidate_id": candidate.candidate_id,
        "candidate_title": candidate.candidate_title,
        "candidate_summary": candidate.candidate_summary,
        "scheduler_state": candidate.scheduler_state.value,
        "commitment": candidate.commitment.value,
        "selected_carrier": candidate.selected_carrier.value,
        "carrier_binding_source": candidate.carrier_binding_source.value,
        "selected_executor_id": candidate.selected_executor_id,
        "selected_capability_id": candidate.selected_capability_id,
        "reason": candidate.reason,
        "priority": candidate.priority,
        "actionable": candidate.actionable,
        "capability_basis": list(candidate.capability_basis),
        "requested_reads": list(candidate.requested_reads),
        "blocking_refs": list(candidate.blocking_refs),
        "warnings": list(candidate.warnings),
    }


def _priority_rank(value: WorkPriority | str) -> int:
    return _PRIORITY_RANK.get(value, _PRIORITY_RANK[WorkPriority.P3_LOW])


def _normalize_scope_filter(
    scope_type: str | None,
    scope_ref: str | None,
    *,
    allow_empty: bool = False,
) -> tuple[str, str] | None:
    if scope_type is None and scope_ref is None:
        return None
    if scope_type is None or scope_ref is None:
        if allow_empty:
            return None
        raise KernelSchedulerError("scope_type and scope_ref must be supplied together")
    normalized_scope_type = scope_type.strip().upper()
    normalized_scope_ref = scope_ref.strip()
    if not normalized_scope_type or not normalized_scope_ref:
        raise KernelSchedulerError("scope_type and scope_ref must be non-empty when supplied")
    return normalized_scope_type, normalized_scope_ref


def _work_unit_matches_scope(work_unit: WorkUnit, scope_filter: tuple[str, str]) -> bool:
    scope_type, scope_ref = scope_filter
    return (
        (work_unit.scope_type.value == scope_type and work_unit.scope_ref == scope_ref)
        or (scope_type == "WORK_UNIT" and work_unit.work_unit_id == scope_ref)
    )


def _work_unit_schedule_posture(
    work_unit: WorkUnit,
    assessment: WorkUnitDispatchAssessment,
) -> tuple[ScheduleState, ScheduleCommitment]:
    if work_unit.status is WorkUnitStatus.FAILED:
        return ScheduleState.RETRY, ScheduleCommitment.COMMITTED
    if work_unit.status is WorkUnitStatus.BLOCKED:
        return ScheduleState.BLOCKED, ScheduleCommitment.COMMITTED
    if work_unit.status in (WorkUnitStatus.DISPATCHED, WorkUnitStatus.EXECUTING, WorkUnitStatus.VALIDATING):
        return ScheduleState.IN_FLIGHT, ScheduleCommitment.ENACTED
    if work_unit.status is WorkUnitStatus.PENDING and assessment.dispatchable:
        return ScheduleState.READY, ScheduleCommitment.COMMITTED
    if work_unit.status is WorkUnitStatus.PENDING:
        return ScheduleState.BLOCKED, ScheduleCommitment.COMMITTED
    return ScheduleState.DEFERRED, ScheduleCommitment.COMMITTED


def _work_unit_warnings(
    work_unit: WorkUnit,
    assessment: WorkUnitDispatchAssessment,
) -> tuple[str, ...]:
    warnings: list[str] = []
    if work_unit.status is WorkUnitStatus.FAILED:
        warnings.append("Failed work unit remains in canonical state and needs explicit retry or review.")
    if assessment.unresolved_dependencies:
        warnings.append("Dispatch still depends on unresolved work-unit dependencies.")
    if assessment.blocking_questions:
        warnings.append("Dispatch still depends on unresolved review/question pressure.")
    return tuple(warnings)


def _horizon_schedule_posture(
    tightening,
    *,
    candidate_dependency_refs: tuple[str, ...],
    candidate_item_id: str,
    latest_receipt,
) -> tuple[ScheduleState, ScheduleCommitment]:
    if latest_receipt is not None and latest_receipt.candidate_item_id == candidate_item_id:
        return ScheduleState.ENACTED_UNLANDED, ScheduleCommitment.ENACTED

    if tightening.source_layer is HorizonLayer.IMMEDIATE:
        if tightening.packet_ready:
            return ScheduleState.READY, ScheduleCommitment.PRECOMMITTED
        return ScheduleState.BLOCKED, ScheduleCommitment.LIKELY

    if tightening.source_layer is HorizonLayer.NEAR:
        if tightening.packet_ready:
            return ScheduleState.DEFERRED, ScheduleCommitment.PRECOMMITTED
        if candidate_dependency_refs:
            return ScheduleState.BLOCKED, ScheduleCommitment.LIKELY
        return ScheduleState.FUTURE_CANDIDATE, ScheduleCommitment.LIKELY

    if tightening.packet_ready:
        return ScheduleState.FUTURE_CANDIDATE, ScheduleCommitment.EMERGING
    return ScheduleState.FUTURE_CANDIDATE, ScheduleCommitment.SPECULATIVE


def _source_record_from_summary(summary, source_layer: HorizonLayer | None) -> HorizonRecord | None:
    if source_layer is HorizonLayer.IMMEDIATE:
        return summary.immediate
    if source_layer is HorizonLayer.NEAR:
        return summary.near
    if source_layer is HorizonLayer.FAR:
        return summary.far
    return None


def _infer_carrier(text: str | None, *, fallback: ScheduleCarrier) -> ScheduleCarrier:
    if text is None:
        return fallback
    lowered = text.lower()
    if any(token in lowered for token in ("daemon", "runtime", "service")):
        return ScheduleCarrier.SUPERVISED_RUNTIME
    if any(token in lowered for token in ("api", "external", "mcp")):
        return ScheduleCarrier.EXTERNAL_API
    if any(token in lowered for token in ("swarm", "child")):
        return ScheduleCarrier.SWARM_CHILD
    if any(token in lowered for token in ("ide", "cursor", "codex", "executor", "manual")):
        return ScheduleCarrier.IDE_MANUAL
    return fallback


def _slug(value: str) -> str:
    return _SAFE_ID_RE.sub("-", value.lower()).strip("-") or "value"


def _iso_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")
