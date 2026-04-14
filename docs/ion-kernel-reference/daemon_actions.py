"""First-pass daemon act-once helper for the active ION kernel stack."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .children import ChildAgentBinding, ChildWorkIssuanceResult, KernelChildWorkIssuer
from .daemon import (
    DaemonActionCandidate,
    DaemonActionType,
    DaemonArbitrationResult,
    KernelDaemonArbiter,
)
from .dispatch import DispatchResult, KernelDispatcher
from .graph import KernelGraph
from .index import KernelIndex
from .model import PlannerManifest, PlannerManifestSweepAggregateRecord, PlannerManifestSweepReceipt, ReviewerQueueRefreshReceipt, StrEnum, TierOneDoctrine
from .planner_gate import (
    KernelPlannerChildIssuanceGate,
    PlannerChildIssuanceResult,
    PlannerManifestResult,
    PlannerManifestSweepAggregateResult,
    PlannerManifestSweepResult,
)
from .question_answers import (
    KernelQuestionAnswerProjectionBuilder,
    ReviewerQueueRefreshResult,
    ReviewerQueueRefreshSweepResult,
)
from .questions import KernelQuestionRouter, QuestionRoutingResult
from .reviews import KernelReviewEscalator, ReviewEscalationResult
from .signal_followups import KernelSignalFollowUpHandler, SignalFollowUpResult
from .signals import (
    KernelSignalConsumer,
    KernelSignalInterpreter,
    SignalConsumptionResult,
    SignalInterpretationResult,
)
from .store import KernelStore


class DaemonActOnceStatus(StrEnum):
    EXECUTED = "EXECUTED"
    IDLE = "IDLE"
    UNSUPPORTED = "UNSUPPORTED"


@dataclass(frozen=True)
class DaemonActOnceResult:
    """Result of executing one bounded daemon action step."""

    arbitration: DaemonArbitrationResult
    candidate: DaemonActionCandidate
    status: DaemonActOnceStatus
    reason: str
    dispatch_result: DispatchResult | None = None
    question_routing_result: QuestionRoutingResult | None = None
    child_work_result: ChildWorkIssuanceResult | None = None
    planner_manifest_result: PlannerManifestResult | None = None
    maintained_planner_manifest: PlannerManifest | None = None
    planner_manifest_sweep_result: PlannerManifestSweepResult | None = None
    planner_manifest_sweep_aggregate_result: PlannerManifestSweepAggregateResult | None = None
    refreshed_reviewer_queue: ReviewerQueueRefreshResult | None = None
    reviewer_queue_refresh_sweep_result: ReviewerQueueRefreshSweepResult | None = None
    planner_child_issuance_result: PlannerChildIssuanceResult | None = None
    review_escalation_result: ReviewEscalationResult | None = None
    signal_interpretation_result: SignalInterpretationResult | None = None
    signal_consumption_result: SignalConsumptionResult | None = None
    signal_follow_up_result: SignalFollowUpResult | None = None


class KernelDaemonActionError(Exception):
    """Raised when one bounded daemon action cannot be completed lawfully."""


class KernelDaemonActuator:
    """Execute one daemon action only when the current stack already supports it."""

    def __init__(
        self,
        *,
        arbiter: KernelDaemonArbiter | None = None,
        dispatcher: KernelDispatcher | None = None,
        question_router: KernelQuestionRouter | None = None,
        child_issuer: KernelChildWorkIssuer | None = None,
        review_escalator: KernelReviewEscalator | None = None,
        planner_gate: KernelPlannerChildIssuanceGate | None = None,
        question_answer_projection_builder: KernelQuestionAnswerProjectionBuilder | None = None,
        signal_follow_up_handler: KernelSignalFollowUpHandler | None = None,
        signal_consumer: KernelSignalConsumer | None = None,
        signal_interpreter: KernelSignalInterpreter | None = None,
    ) -> None:
        self._arbiter = arbiter or KernelDaemonArbiter()
        self._dispatcher = dispatcher or KernelDispatcher()
        self._question_router = question_router or KernelQuestionRouter()
        self._child_issuer = child_issuer or KernelChildWorkIssuer()
        self._review_escalator = review_escalator or KernelReviewEscalator()
        self._planner_gate = planner_gate or KernelPlannerChildIssuanceGate(child_issuer=self._child_issuer)
        self._question_answer_projection_builder = (
            question_answer_projection_builder or KernelQuestionAnswerProjectionBuilder()
        )
        self._signal_follow_up_handler = signal_follow_up_handler or KernelSignalFollowUpHandler(
            review_escalator=self._review_escalator
        )
        self._signal_consumer = signal_consumer or KernelSignalConsumer()
        self._signal_interpreter = KernelSignalInterpreter(signal_consumer=self._signal_consumer)

    def act_once(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        workspace_root: str | Path | None = None,
        signals_dir: str = "ION/05_context/signals",
        archive_dir: str = "ION/05_context/signals/archive",
        signal_target: str | None = "DAEMON",
        packet_output_root: str | Path | None = None,
        repo_root: str | Path | None = None,
        doctrine: TierOneDoctrine | None = None,
        agent_bindings: dict[str, ChildAgentBinding] | None = None,
        action_timestamp: str | None = None,
    ) -> DaemonActOnceResult:
        arbitration = self._arbiter.choose_next_action(
            index,
            graph,
            workspace_root=workspace_root,
            signals_dir=signals_dir,
            signal_target=signal_target,
            planner_as_of=action_timestamp,
        )
        return self.execute_candidate(
            arbitration,
            store,
            index,
            graph,
            workspace_root=workspace_root,
            signals_dir=signals_dir,
            archive_dir=archive_dir,
            packet_output_root=packet_output_root,
            repo_root=repo_root,
            doctrine=doctrine,
            agent_bindings=agent_bindings,
            action_timestamp=action_timestamp,
        )

    def execute_candidate(
        self,
        arbitration: DaemonArbitrationResult,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        workspace_root: str | Path | None = None,
        signals_dir: str = "ION/05_context/signals",
        archive_dir: str = "ION/05_context/signals/archive",
        packet_output_root: str | Path | None = None,
        repo_root: str | Path | None = None,
        doctrine: TierOneDoctrine | None = None,
        agent_bindings: dict[str, ChildAgentBinding] | None = None,
        action_timestamp: str | None = None,
    ) -> DaemonActOnceResult:
        candidate = arbitration.chosen_action

        if candidate.action_type is DaemonActionType.IDLE:
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.IDLE,
                reason="NO_ACTION_REQUIRED",
            )

        if candidate.action_type is DaemonActionType.ROUTE_OPEN_QUESTIONS:
            work_unit_id = _require_identifier(candidate.work_unit_id, "work_unit_id", candidate.action_type)
            delta_id = _require_identifier(candidate.delta_id, "delta_id", candidate.action_type)
            result = self._question_router.route_commit_delta(
                store,
                index,
                graph,
                work_unit_id,
                delta_id,
                routed_at=action_timestamp,
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason="ROUTED_OPEN_QUESTIONS",
                question_routing_result=result,
            )

        if candidate.action_type is DaemonActionType.COMPILE_PLANNER_MANIFEST:
            question_id = _require_identifier(candidate.question_id, "question_id", candidate.action_type)
            work_unit_id = _require_identifier(candidate.work_unit_id, "work_unit_id", candidate.action_type)
            delta_id = _require_identifier(candidate.delta_id, "delta_id", candidate.action_type)
            result = self._planner_gate.create_manifest(
                store,
                index,
                graph,
                question_id,
                work_unit_id,
                delta_id,
                created_at=action_timestamp,
                created_by="DAEMON",
                notes="Compiled from resolved review/follow-up pressure.",
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason="COMPILED_PLANNER_MANIFEST",
                planner_manifest_result=result,
            )

        if candidate.action_type is DaemonActionType.SWEEP_PLANNER_MANIFESTS:
            result = self._planner_gate.sweep_maintenance_candidates(
                store,
                index,
                graph,
                as_of=action_timestamp or _iso_now(),
                generated_at=action_timestamp,
                generated_by="DAEMON",
            )
            if result is None:
                return DaemonActOnceResult(
                    arbitration=arbitration,
                    candidate=candidate,
                    status=DaemonActOnceStatus.EXECUTED,
                    reason="NO_PLANNER_MANIFEST_SWEEP_REQUIRED",
                )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason=f"SWEPT_PLANNER_MANIFESTS:{result.receipt.maintained_count}",
                planner_manifest_sweep_result=result,
            )

        if candidate.action_type is DaemonActionType.MAINTAIN_PLANNER_MANIFEST:
            manifest_id = _require_identifier(candidate.manifest_id, "manifest_id", candidate.action_type)
            updated_manifest = self._planner_gate.maintain_manifest(
                store,
                index,
                graph,
                manifest_id,
                as_of=action_timestamp or _iso_now(),
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason=f"MAINTAINED_PLANNER_MANIFEST:{updated_manifest.status.value}",
                maintained_planner_manifest=updated_manifest,
            )

        if candidate.action_type is DaemonActionType.AGGREGATE_PLANNER_SWEEP_RECEIPTS:
            result = self._planner_gate.aggregate_sweep_receipts(
                store,
                index,
                graph,
                generated_at=action_timestamp,
                generated_by="DAEMON",
            )
            if result is None:
                return DaemonActOnceResult(
                    arbitration=arbitration,
                    candidate=candidate,
                    status=DaemonActOnceStatus.EXECUTED,
                    reason="NO_SWEEP_AGGREGATION_REQUIRED",
                )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason=f"AGGREGATED_PLANNER_SWEEP_RECEIPTS:{result.aggregate.retained_count}",
                planner_manifest_sweep_aggregate_result=result,
            )

        if candidate.action_type is DaemonActionType.SWEEP_REVIEWER_QUEUES:
            result = self._question_answer_projection_builder.sweep_refresh_candidates(
                store,
                index,
                graph,
                generated_at=action_timestamp,
                generated_by="DAEMON",
            )
            if result is None:
                return DaemonActOnceResult(
                    arbitration=arbitration,
                    candidate=candidate,
                    status=DaemonActOnceStatus.EXECUTED,
                    reason="NO_REVIEWER_QUEUE_SWEEP_REQUIRED",
                )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason=f"SWEPT_REVIEWER_QUEUES:{result.receipt.refreshed_count}",
                reviewer_queue_refresh_sweep_result=result,
            )

        if candidate.action_type is DaemonActionType.REFRESH_REVIEWER_QUEUE:
            projection_id = _require_identifier(candidate.projection_id, "projection_id", candidate.action_type)
            result = self._question_answer_projection_builder.refresh_projection(
                store,
                index,
                graph,
                projection_id,
                generated_at=action_timestamp,
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason=f"REFRESHED_REVIEWER_QUEUE:{result.reason}",
                refreshed_reviewer_queue=result,
            )

        if candidate.action_type is DaemonActionType.ISSUE_CHILD_WORK:
            work_unit_id = _require_identifier(candidate.work_unit_id, "work_unit_id", candidate.action_type)
            delta_id = _require_identifier(candidate.delta_id, "delta_id", candidate.action_type)
            if repo_root is None or doctrine is None:
                raise KernelDaemonActionError("ISSUE_CHILD_WORK requires repo_root and doctrine.")
            if candidate.manifest_id:
                planner_result = self._planner_gate.issue_child_work_from_manifest(
                    store,
                    index,
                    graph,
                    candidate.manifest_id,
                    repo_root=repo_root,
                    doctrine=doctrine,
                    agent_bindings=agent_bindings,
                    created_at=action_timestamp,
                )
                return DaemonActOnceResult(
                    arbitration=arbitration,
                    candidate=candidate,
                    status=DaemonActOnceStatus.EXECUTED,
                    reason="ISSUED_CHILD_WORK_FROM_PLANNER_MANIFEST",
                    child_work_result=planner_result.child_work_result,
                    planner_child_issuance_result=planner_result,
                )
            result = self._child_issuer.issue_child_work_units(
                store,
                index,
                graph,
                work_unit_id,
                delta_id,
                repo_root=repo_root,
                doctrine=doctrine,
                agent_bindings=agent_bindings,
                created_at=action_timestamp,
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason="ISSUED_CHILD_WORK",
                child_work_result=result,
            )

        if candidate.action_type is DaemonActionType.DISPATCH_WORK:
            work_unit_id = _require_identifier(candidate.work_unit_id, "work_unit_id", candidate.action_type)
            packet_path = _packet_path(packet_output_root, work_unit_id) if packet_output_root is not None else None
            result = self._dispatcher.dispatch_work_unit(
                store,
                index,
                graph,
                work_unit_id,
                dispatched_at=action_timestamp,
                packet_output_path=packet_path,
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason="DISPATCHED_WORK",
                dispatch_result=result,
            )

        if candidate.action_type is DaemonActionType.CONSUME_ACTIVE_SIGNAL:
            signal_path = _require_identifier(candidate.signal_path, "signal_path", candidate.action_type)
            if workspace_root is None:
                raise KernelDaemonActionError("CONSUME_ACTIVE_SIGNAL requires workspace_root.")
            interpretation_result = self._signal_interpreter.interpret_signal_path(
                workspace_root,
                signal_path,
                signals_dir=signals_dir,
            )
            consumption_result = self._signal_consumer.consume_signal(
                workspace_root,
                signal_path,
                consumer="DAEMON",
                signals_dir=signals_dir,
                archive_dir=archive_dir,
                consumed_at=action_timestamp,
            )
            follow_up_result = self._signal_follow_up_handler.apply_follow_up(
                store,
                index,
                graph,
                interpretation_result,
                followed_up_at=action_timestamp or _iso_now(),
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason=(
                    "CONSUMED_ACTIVE_SIGNAL:"
                    f"{interpretation_result.interpretation.recommended_action.value}:"
                    f"{follow_up_result.disposition.value}"
                ),
                signal_interpretation_result=interpretation_result,
                signal_consumption_result=consumption_result,
                signal_follow_up_result=follow_up_result,
            )

        if candidate.action_type is DaemonActionType.ESCALATE_REVIEW:
            delta_id = _require_identifier(candidate.delta_id, "delta_id", candidate.action_type)
            result = self._review_escalator.escalate_review(
                store,
                index,
                graph,
                _require_identifier(candidate.work_unit_id, "work_unit_id", candidate.action_type),
                delta_id,
                escalated_at=action_timestamp or "",
            )
            return DaemonActOnceResult(
                arbitration=arbitration,
                candidate=candidate,
                status=DaemonActOnceStatus.EXECUTED,
                reason=f"ESCALATED_REVIEW:{result.created_question.needed_from}",
                review_escalation_result=result,
            )

        return DaemonActOnceResult(
            arbitration=arbitration,
            candidate=candidate,
            status=DaemonActOnceStatus.UNSUPPORTED,
            reason=f"UNSUPPORTED_ACTION:{candidate.action_type.value}",
        )


IonDaemonActuator = KernelDaemonActuator


def _require_identifier(value: str | None, field_name: str, action_type: DaemonActionType) -> str:
    if value is None or not value:
        raise KernelDaemonActionError(f"{action_type.value} requires {field_name}.")
    return value


def _packet_path(packet_output_root: str | Path, work_unit_id: str) -> Path:
    base = Path(packet_output_root)
    return (base / f"{work_unit_id}.dispatch.packet.json").resolve()


def _iso_now() -> str:
    from datetime import datetime

    return datetime.now().astimezone().replace(microsecond=0).isoformat()
