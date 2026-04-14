"""First-pass in-memory index for persisted ION kernel records.

The store provides durability. This index provides fast lookups over the current
record families without reopening filesystem scans or pretending the later graph
layer already exists.
"""

from __future__ import annotations

from collections import defaultdict
from typing import DefaultDict

from .model import (
    AuthorityClass,
    AutomationStateRecord,
    BranchClaimReceipt,
    BranchControlReceipt,
    BranchClaimStatus,
    BranchHorizonSyncReceipt,
    BranchMergeProposal,
    BranchRescheduleReceipt,
    BranchSettlementOutcome,
    BranchSettlementReceipt,
    CommitDelta,
    CommitDeltaStatus,
    ContextPerfectContinuationReceipt,
    ContextPackage,
    ExecutorAvailability,
    ExecutorCapability,
    ExecutorTrustClass,
    HorizonEnactmentReceipt,
    HorizonRecord,
    KernelRecord,
    ManualAutomationEquivalenceReceipt,
    ManifestRouteStateRecord,
    OpenQuestion,
    OpenQuestionPriority,
    OpenQuestionStatus,
    PlannerIntentType,
    PlannerManifest,
    PlannerManifestStatus,
    PlannerManifestSweepAggregateRecord,
    PlannerManifestSweepReceipt,
    QuestionAnswerRecord,
    ScheduleCarrier,
    ReviewerAnswerQueueProjectionRecord,
    ReviewerQueueRefreshReceipt,
    ScheduleCommitment,
    ScheduleCompletionReleaseReceipt,
    ScheduleSettlementReceipt,
    ScheduleControlReceipt,
    ScheduleDispatchReconciliationReceipt,
    ScheduleExecutorStartPacketMaterializationReceipt,
    ScheduleLineageArchiveReceipt,
    ScheduleLineageReplayReceipt,
    ScheduleResumeProjectionReceipt,
    ScheduleResumeBundleMaterializationReceipt,
    ScheduleTakeoverEntryActivationReceipt,
    ScheduleActivationHandoffCapsuleReceipt,
    ScheduleHandoffEntryRehearsalReceipt,
    ScheduleReceipt,
    ScheduleState,
    TakeoverAssessmentReceipt,
    WorkUnit,
    WorkUnitStatus,
)
from .store import KernelStore


RecordKey = tuple[str, str]


class KernelIndex:
    """In-memory query index built from the persisted kernel store."""

    def __init__(self) -> None:
        self.clear()

    def clear(self) -> None:
        self._records: dict[RecordKey, KernelRecord] = {}
        self._by_type: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._by_protocol: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._by_transition: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._by_context_version: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._by_work_unit: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._by_scope: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._work_units_by_status: DefaultDict[WorkUnitStatus, set[RecordKey]] = defaultdict(set)
        self._child_work_units_by_parent: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._work_units_by_role: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._context_packages_by_role: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._commit_deltas_by_status: DefaultDict[CommitDeltaStatus, set[RecordKey]] = defaultdict(set)
        self._commit_deltas_by_agent: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._commit_deltas_by_authority: DefaultDict[AuthorityClass, set[RecordKey]] = defaultdict(set)
        self._commit_deltas_by_artifact_path: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._open_questions_by_status: DefaultDict[OpenQuestionStatus, set[RecordKey]] = defaultdict(set)
        self._open_questions_by_priority: DefaultDict[OpenQuestionPriority, set[RecordKey]] = defaultdict(set)
        self._open_questions_by_domain: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._open_questions_by_needed_from: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._question_answers_by_question: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._question_answers_by_domain: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._question_answers_by_actor: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._reviewer_queues_by_reviewer: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._reviewer_queues_by_domain: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._reviewer_queue_refreshs_by_projection: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._planner_manifests_by_status: DefaultDict[PlannerManifestStatus, set[RecordKey]] = defaultdict(set)
        self._planner_manifests_by_intent: DefaultDict[PlannerIntentType, set[RecordKey]] = defaultdict(set)
        self._planner_manifests_by_question: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._planner_manifests_by_delta: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._planner_sweeps_by_manifest: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._planner_sweep_aggregates_by_receipt: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._manifest_route_states_by_owner: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._manifest_route_states_by_loop_position: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._manifest_route_states_by_automation: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._automation_states_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._automation_states_by_stage: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._automation_states_by_manifest: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._horizon_states_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._horizon_states_by_layer: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._horizon_enactment_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._horizon_enactment_receipts_by_horizon: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._schedule_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_receipts_by_state: DefaultDict[ScheduleState, set[RecordKey]] = defaultdict(set)
        self._schedule_receipts_by_commitment: DefaultDict[ScheduleCommitment, set[RecordKey]] = defaultdict(set)
        self._schedule_control_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_dispatch_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_completion_release_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_settlement_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_lineage_archive_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_lineage_replay_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_resume_projection_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_resume_bundle_materialization_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_takeover_entry_activation_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_activation_handoff_capsule_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_handoff_entry_rehearsal_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._schedule_executor_start_packet_materialization_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._executor_capabilities_by_executor: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._executor_capabilities_by_carrier: DefaultDict[ScheduleCarrier, set[RecordKey]] = defaultdict(set)
        self._executor_capabilities_by_availability: DefaultDict[ExecutorAvailability, set[RecordKey]] = defaultdict(set)
        self._executor_capabilities_by_trust: DefaultDict[ExecutorTrustClass, set[RecordKey]] = defaultdict(set)
        self._takeover_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._takeover_receipts_by_packet_type: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._manual_automation_equivalence_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._context_perfect_continuation_receipts_by_scope: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._branch_claim_receipts_by_parent: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._branch_claim_receipts_by_capability: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._branch_claim_receipts_by_work_unit: DefaultDict[str, set[RecordKey]] = defaultdict(set)
        self._branch_claim_receipts_by_status: DefaultDict[BranchClaimStatus, set[RecordKey]] = defaultdict(set)
        self._branch_control_receipts_by_parent: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._branch_merge_proposals_by_parent: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._branch_settlement_receipts_by_parent: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._branch_settlement_receipts_by_outcome: DefaultDict[BranchSettlementOutcome, set[RecordKey]] = defaultdict(set)
        self._branch_horizon_sync_receipts_by_parent: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)
        self._branch_reschedule_receipts_by_parent: DefaultDict[tuple[str, str], set[RecordKey]] = defaultdict(set)

    def build_from_store(self, store: KernelStore) -> int:
        """Rebuild the entire index from the current persisted record store."""

        self.clear()
        count = 0
        for record_type in store.supported_record_types():
            for record in store.list_records(record_type):
                self.record_added(record)
                count += 1
        return count

    def record_added(self, record: KernelRecord) -> None:
        """Add one newly persisted record to the index."""

        self._index_record(record)

    def record_changed(self, record: KernelRecord) -> None:
        """Re-index one changed record."""

        key = self._record_key(record)
        previous = self._records.get(key)
        if previous is not None:
            self._deindex_record(previous)
        self._index_record(record)

    def record_removed(self, record_type: str, record_id: str) -> None:
        """Remove one record from the index after deletion from the store."""

        key = (record_type, record_id)
        previous = self._records.get(key)
        if previous is None:
            return
        self._deindex_record(previous)

    def get(self, record_type: str, record_id: str) -> KernelRecord | None:
        return self._records.get((record_type, record_id))

    def exists(self, record_type: str, record_id: str) -> bool:
        return (record_type, record_id) in self._records

    def all_keys(self) -> list[RecordKey]:
        return sorted(self._records)

    def records_by_type(self, record_type: str) -> list[KernelRecord]:
        return self._records_for_keys(self._by_type.get(record_type, set()))

    def records_for_protocol(self, protocol_id: str) -> list[KernelRecord]:
        return self._records_for_keys(self._by_protocol.get(protocol_id, set()))

    def records_for_transition(self, transition_id: str) -> list[KernelRecord]:
        return self._records_for_keys(self._by_transition.get(transition_id, set()))

    def records_for_context_version(self, context_version: str) -> list[KernelRecord]:
        return self._records_for_keys(self._by_context_version.get(context_version, set()))

    def records_for_work_unit(self, work_unit_id: str) -> list[KernelRecord]:
        return self._records_for_keys(self._by_work_unit.get(work_unit_id, set()))

    def records_for_scope(self, scope_ref: str) -> list[KernelRecord]:
        return self._records_for_keys(self._by_scope.get(scope_ref, set()))

    def work_units_by_status(self, status: WorkUnitStatus) -> list[WorkUnit]:
        return self._typed_records(self._work_units_by_status.get(status, set()), WorkUnit)

    def work_units_by_role(self, agent_role: str) -> list[WorkUnit]:
        return self._typed_records(self._work_units_by_role.get(agent_role, set()), WorkUnit)

    def child_work_units_for_parent(self, parent_work_unit_id: str) -> list[WorkUnit]:
        return self._typed_records(self._child_work_units_by_parent.get(parent_work_unit_id, set()), WorkUnit)

    def context_packages_for_role(self, role: str) -> list[ContextPackage]:
        return self._typed_records(self._context_packages_by_role.get(role, set()), ContextPackage)

    def context_packages_for_work_unit(self, work_unit_id: str) -> list[ContextPackage]:
        return [
            record
            for record in self.records_for_work_unit(work_unit_id)
            if isinstance(record, ContextPackage)
        ]

    def commit_deltas_by_status(self, status: CommitDeltaStatus) -> list[CommitDelta]:
        return self._typed_records(self._commit_deltas_by_status.get(status, set()), CommitDelta)

    def commit_deltas_for_agent(self, agent_structural_id: str) -> list[CommitDelta]:
        return self._typed_records(self._commit_deltas_by_agent.get(agent_structural_id, set()), CommitDelta)

    def commit_deltas_for_authority(self, authority: AuthorityClass) -> list[CommitDelta]:
        return self._typed_records(self._commit_deltas_by_authority.get(authority, set()), CommitDelta)

    def commit_deltas_for_artifact(self, artifact_path: str) -> list[CommitDelta]:
        return self._typed_records(self._commit_deltas_by_artifact_path.get(artifact_path, set()), CommitDelta)

    def open_questions_by_status(self, status: OpenQuestionStatus) -> list[OpenQuestion]:
        return self._typed_records(self._open_questions_by_status.get(status, set()), OpenQuestion)

    def open_questions_by_priority(self, priority: OpenQuestionPriority) -> list[OpenQuestion]:
        return self._typed_records(self._open_questions_by_priority.get(priority, set()), OpenQuestion)

    def open_questions_by_domain(self, domain: str) -> list[OpenQuestion]:
        return self._typed_records(self._open_questions_by_domain.get(domain, set()), OpenQuestion)

    def open_questions_needed_from(self, needed_from: str) -> list[OpenQuestion]:
        return self._typed_records(self._open_questions_by_needed_from.get(needed_from, set()), OpenQuestion)

    def question_answers_for_question(self, question_id: str) -> list[QuestionAnswerRecord]:
        return self._typed_records(self._question_answers_by_question.get(question_id, set()), QuestionAnswerRecord)

    def question_answers_for_domain(self, domain: str) -> list[QuestionAnswerRecord]:
        return self._typed_records(self._question_answers_by_domain.get(domain, set()), QuestionAnswerRecord)

    def question_answers_by_actor(self, actor: str) -> list[QuestionAnswerRecord]:
        return self._typed_records(self._question_answers_by_actor.get(actor, set()), QuestionAnswerRecord)

    def reviewer_queue_projections(self, reviewer: str | None = None) -> list[ReviewerAnswerQueueProjectionRecord]:
        key = reviewer if reviewer is not None else "__ALL__"
        return self._typed_records(
            self._reviewer_queues_by_reviewer.get(key, set()),
            ReviewerAnswerQueueProjectionRecord,
        )

    def reviewer_queue_projections_for_domain(self, domain: str) -> list[ReviewerAnswerQueueProjectionRecord]:
        return self._typed_records(
            self._reviewer_queues_by_domain.get(domain, set()),
            ReviewerAnswerQueueProjectionRecord,
        )

    def planner_manifests_by_status(self, status: PlannerManifestStatus) -> list[PlannerManifest]:
        return self._typed_records(self._planner_manifests_by_status.get(status, set()), PlannerManifest)

    def planner_manifests_by_intent(self, intent: PlannerIntentType) -> list[PlannerManifest]:
        return self._typed_records(self._planner_manifests_by_intent.get(intent, set()), PlannerManifest)

    def planner_manifests_for_question(self, question_id: str) -> list[PlannerManifest]:
        return self._typed_records(self._planner_manifests_by_question.get(question_id, set()), PlannerManifest)

    def planner_manifests_for_delta(self, delta_id: str) -> list[PlannerManifest]:
        return self._typed_records(self._planner_manifests_by_delta.get(delta_id, set()), PlannerManifest)

    def planner_manifest_sweeps_for_manifest(self, manifest_id: str) -> list[PlannerManifestSweepReceipt]:
        return self._typed_records(
            self._planner_sweeps_by_manifest.get(manifest_id, set()),
            PlannerManifestSweepReceipt,
        )

    def reviewer_queue_refresh_receipts(self) -> list[ReviewerQueueRefreshReceipt]:
        receipts = [
            record
            for record in self.records_by_type("reviewer_queue_refresh")
            if isinstance(record, ReviewerQueueRefreshReceipt)
        ]
        receipts.sort(key=lambda item: (item.generated_at, item.receipt_id), reverse=True)
        return receipts

    def reviewer_queue_refresh_receipts_for_projection(self, projection_id: str) -> list[ReviewerQueueRefreshReceipt]:
        return self._typed_records(
            self._reviewer_queue_refreshs_by_projection.get(projection_id, set()),
            ReviewerQueueRefreshReceipt,
        )

    def planner_manifest_sweep_receipts(self) -> list[PlannerManifestSweepReceipt]:
        receipts = [
            record
            for record in self.records_by_type("planner_manifest_sweep")
            if isinstance(record, PlannerManifestSweepReceipt)
        ]
        receipts.sort(key=lambda item: (item.generated_at, item.receipt_id), reverse=True)
        return receipts

    def planner_manifest_sweep_aggregates(self) -> list[PlannerManifestSweepAggregateRecord]:
        aggregates = [
            record
            for record in self.records_by_type("planner_manifest_sweep_aggregate")
            if isinstance(record, PlannerManifestSweepAggregateRecord)
        ]
        aggregates.sort(key=lambda item: (item.generated_at, item.aggregate_id), reverse=True)
        return aggregates

    def planner_manifest_sweep_aggregates_for_receipt(self, receipt_id: str) -> list[PlannerManifestSweepAggregateRecord]:
        return self._typed_records(
            self._planner_sweep_aggregates_by_receipt.get(receipt_id, set()),
            PlannerManifestSweepAggregateRecord,
        )

    def manifest_route_states_for_owner(self, scope_type: str, scope_id: str) -> list[ManifestRouteStateRecord]:
        return self._typed_records(
            self._manifest_route_states_by_owner.get((scope_type, scope_id), set()),
            ManifestRouteStateRecord,
        )

    def manifest_route_states_by_loop_position(self, loop_position: str) -> list[ManifestRouteStateRecord]:
        return self._typed_records(
            self._manifest_route_states_by_loop_position.get(loop_position, set()),
            ManifestRouteStateRecord,
        )

    def manifest_route_states_for_automation_state(self, automation_state_id: str) -> list[ManifestRouteStateRecord]:
        return self._typed_records(
            self._manifest_route_states_by_automation.get(automation_state_id, set()),
            ManifestRouteStateRecord,
        )

    def automation_states_for_scope(self, scope_type: str, scope_ref: str) -> list[AutomationStateRecord]:
        return self._typed_records(
            self._automation_states_by_scope.get((scope_type, scope_ref), set()),
            AutomationStateRecord,
        )

    def automation_states_by_stage(self, stage: str) -> list[AutomationStateRecord]:
        return self._typed_records(
            self._automation_states_by_stage.get(stage, set()),
            AutomationStateRecord,
        )

    def automation_states_for_manifest(self, manifest_id: str) -> list[AutomationStateRecord]:
        return self._typed_records(
            self._automation_states_by_manifest.get(manifest_id, set()),
            AutomationStateRecord,
        )


    def horizon_states_for_scope(self, scope_type: str, scope_ref: str) -> list[HorizonRecord]:
        return self._typed_records(
            self._horizon_states_by_scope.get((scope_type, scope_ref), set()),
            HorizonRecord,
        )

    def horizon_states_by_layer(self, layer: str) -> list[HorizonRecord]:
        return self._typed_records(
            self._horizon_states_by_layer.get(layer, set()),
            HorizonRecord,
        )

    def horizon_enactment_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[HorizonEnactmentReceipt]:
        return self._typed_records(
            self._horizon_enactment_receipts_by_scope.get((scope_type, scope_ref), set()),
            HorizonEnactmentReceipt,
        )

    def horizon_enactment_receipts_for_horizon(self, horizon_id: str) -> list[HorizonEnactmentReceipt]:
        return self._typed_records(
            self._horizon_enactment_receipts_by_horizon.get(horizon_id, set()),
            HorizonEnactmentReceipt,
        )

    def schedule_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleReceipt]:
        return self._typed_records(
            self._schedule_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleReceipt,
        )

    def schedule_receipts_by_state(self, state: ScheduleState) -> list[ScheduleReceipt]:
        return self._typed_records(
            self._schedule_receipts_by_state.get(state, set()),
            ScheduleReceipt,
        )

    def schedule_receipts_by_commitment(self, commitment: ScheduleCommitment) -> list[ScheduleReceipt]:
        return self._typed_records(
            self._schedule_receipts_by_commitment.get(commitment, set()),
            ScheduleReceipt,
        )


    def schedule_control_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleControlReceipt]:
        return self._typed_records(
            self._schedule_control_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleControlReceipt,
        )

    def schedule_dispatch_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleDispatchReconciliationReceipt]:
        return self._typed_records(
            self._schedule_dispatch_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleDispatchReconciliationReceipt,
        )

    def schedule_completion_release_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleCompletionReleaseReceipt]:
        return self._typed_records(
            self._schedule_completion_release_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleCompletionReleaseReceipt,
        )

    def schedule_settlement_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleSettlementReceipt]:
        return self._typed_records(
            self._schedule_settlement_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleSettlementReceipt,
        )

    def schedule_lineage_archive_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleLineageArchiveReceipt]:
        return self._typed_records(
            self._schedule_lineage_archive_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleLineageArchiveReceipt,
        )

    def schedule_lineage_replay_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleLineageReplayReceipt]:
        return self._typed_records(
            self._schedule_lineage_replay_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleLineageReplayReceipt,
        )

    def schedule_resume_projection_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleResumeProjectionReceipt]:
        return self._typed_records(
            self._schedule_resume_projection_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleResumeProjectionReceipt,
        )

    def schedule_resume_bundle_materialization_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleResumeBundleMaterializationReceipt]:
        return self._typed_records(
            self._schedule_resume_bundle_materialization_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleResumeBundleMaterializationReceipt,
        )

    def schedule_takeover_entry_activation_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleTakeoverEntryActivationReceipt]:
        return self._typed_records(
            self._schedule_takeover_entry_activation_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleTakeoverEntryActivationReceipt,
        )

    def schedule_activation_handoff_capsule_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleActivationHandoffCapsuleReceipt]:
        return self._typed_records(
            self._schedule_activation_handoff_capsule_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleActivationHandoffCapsuleReceipt,
        )

    def schedule_handoff_entry_rehearsal_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleHandoffEntryRehearsalReceipt]:
        return self._typed_records(
            self._schedule_handoff_entry_rehearsal_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleHandoffEntryRehearsalReceipt,
        )

    def schedule_executor_start_packet_materialization_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[ScheduleExecutorStartPacketMaterializationReceipt]:
        return self._typed_records(
            self._schedule_executor_start_packet_materialization_receipts_by_scope.get((scope_type, scope_ref), set()),
            ScheduleExecutorStartPacketMaterializationReceipt,
        )

    def executor_capabilities(self) -> list[ExecutorCapability]:
        return [
            record
            for record in self.records_by_type("executor_capability")
            if isinstance(record, ExecutorCapability)
        ]

    def executor_capabilities_for_executor(self, executor_id: str) -> list[ExecutorCapability]:
        return self._typed_records(
            self._executor_capabilities_by_executor.get(executor_id, set()),
            ExecutorCapability,
        )

    def executor_capabilities_by_carrier(self, carrier: ScheduleCarrier) -> list[ExecutorCapability]:
        return self._typed_records(
            self._executor_capabilities_by_carrier.get(carrier, set()),
            ExecutorCapability,
        )

    def executor_capabilities_by_availability(self, availability: ExecutorAvailability) -> list[ExecutorCapability]:
        return self._typed_records(
            self._executor_capabilities_by_availability.get(availability, set()),
            ExecutorCapability,
        )

    def executor_capabilities_by_trust(self, trust_class: ExecutorTrustClass) -> list[ExecutorCapability]:
        return self._typed_records(
            self._executor_capabilities_by_trust.get(trust_class, set()),
            ExecutorCapability,
        )

    def takeover_assessment_receipts_for_scope(self, scope_type: str, scope_ref: str) -> list[TakeoverAssessmentReceipt]:
        return self._typed_records(
            self._takeover_receipts_by_scope.get((scope_type, scope_ref), set()),
            TakeoverAssessmentReceipt,
        )

    def takeover_assessment_receipts_by_packet_type(self, packet_type: str) -> list[TakeoverAssessmentReceipt]:
        return self._typed_records(
            self._takeover_receipts_by_packet_type.get(packet_type, set()),
            TakeoverAssessmentReceipt,
        )

    def manual_automation_equivalence_receipts_for_scope(
        self,
        scope_type: str,
        scope_ref: str,
    ) -> list[ManualAutomationEquivalenceReceipt]:
        return self._typed_records(
            self._manual_automation_equivalence_receipts_by_scope.get((scope_type, scope_ref), set()),
            ManualAutomationEquivalenceReceipt,
        )

    def context_perfect_continuation_receipts_for_scope(
        self,
        scope_type: str,
        scope_ref: str,
    ) -> list[ContextPerfectContinuationReceipt]:
        return self._typed_records(
            self._context_perfect_continuation_receipts_by_scope.get((scope_type, scope_ref), set()),
            ContextPerfectContinuationReceipt,
        )

    def branch_claim_receipts_for_parent(
        self,
        parent_scope_type: str,
        parent_scope_ref: str,
    ) -> list[BranchClaimReceipt]:
        return self._typed_records(
            self._branch_claim_receipts_by_parent.get((parent_scope_type, parent_scope_ref), set()),
            BranchClaimReceipt,
        )

    def branch_claim_receipts_for_capability(self, capability_id: str) -> list[BranchClaimReceipt]:
        return self._typed_records(
            self._branch_claim_receipts_by_capability.get(capability_id, set()),
            BranchClaimReceipt,
        )

    def branch_claim_receipts_for_work_unit(self, work_unit_id: str) -> list[BranchClaimReceipt]:
        return self._typed_records(
            self._branch_claim_receipts_by_work_unit.get(work_unit_id, set()),
            BranchClaimReceipt,
        )

    def branch_claim_receipts_by_status(self, status: BranchClaimStatus) -> list[BranchClaimReceipt]:
        return self._typed_records(
            self._branch_claim_receipts_by_status.get(status, set()),
            BranchClaimReceipt,
        )

    def branch_control_receipts_for_parent(
        self,
        parent_scope_type: str,
        parent_scope_ref: str,
    ) -> list[BranchControlReceipt]:
        return self._typed_records(
            self._branch_control_receipts_by_parent.get((parent_scope_type, parent_scope_ref), set()),
            BranchControlReceipt,
        )

    def branch_merge_proposals_for_parent(
        self,
        parent_scope_type: str,
        parent_scope_ref: str,
    ) -> list[BranchMergeProposal]:
        return self._typed_records(
            self._branch_merge_proposals_by_parent.get((parent_scope_type, parent_scope_ref), set()),
            BranchMergeProposal,
        )

    def branch_settlement_receipts_for_parent(
        self,
        parent_scope_type: str,
        parent_scope_ref: str,
    ) -> list[BranchSettlementReceipt]:
        return self._typed_records(
            self._branch_settlement_receipts_by_parent.get((parent_scope_type, parent_scope_ref), set()),
            BranchSettlementReceipt,
        )

    def branch_settlement_receipts_by_outcome(
        self,
        outcome: BranchSettlementOutcome,
    ) -> list[BranchSettlementReceipt]:
        return self._typed_records(
            self._branch_settlement_receipts_by_outcome.get(outcome, set()),
            BranchSettlementReceipt,
        )

    def branch_horizon_sync_receipts_for_parent(
        self,
        parent_scope_type: str,
        parent_scope_ref: str,
    ) -> list[BranchHorizonSyncReceipt]:
        return self._typed_records(
            self._branch_horizon_sync_receipts_by_parent.get((parent_scope_type, parent_scope_ref), set()),
            BranchHorizonSyncReceipt,
        )

    def branch_reschedule_receipts_for_parent(
        self,
        parent_scope_type: str,
        parent_scope_ref: str,
    ) -> list[BranchRescheduleReceipt]:
        return self._typed_records(
            self._branch_reschedule_receipts_by_parent.get((parent_scope_type, parent_scope_ref), set()),
            BranchRescheduleReceipt,
        )

    def count(self) -> int:
        return len(self._records)

    def count_by_type(self) -> dict[str, int]:
        return {
            record_type: len(keys)
            for record_type, keys in sorted(self._by_type.items())
            if keys
        }

    def stats(self) -> dict[str, object]:
        return {
            "total_records": self.count(),
            "by_type": self.count_by_type(),
            "protocols": sorted(protocol for protocol, keys in self._by_protocol.items() if keys),
            "transitions": sorted(
                transition for transition, keys in self._by_transition.items() if keys
            ),
            "open_work_units": len(self._work_units_by_status.get(WorkUnitStatus.PENDING, set())),
            "open_questions": len(self._open_questions_by_status.get(OpenQuestionStatus.OPEN, set())),
        }

    def summary(self) -> str:
        stats = self.stats()
        lines = [
            f"KernelIndex: {stats['total_records']} records",
            f"  Open work units: {stats['open_work_units']}",
            f"  Open questions: {stats['open_questions']}",
        ]
        by_type = stats["by_type"]
        if by_type:
            rendered = ", ".join(f"{record_type}={count}" for record_type, count in by_type.items())
            lines.append(f"  By type: {rendered}")
        return "\n".join(lines)

    def _index_record(self, record: KernelRecord) -> None:
        key = self._record_key(record)
        record_type, record_id = key

        self._records[key] = record
        self._by_type[record_type].add(key)

        protocol_id = getattr(record, "protocol_id", None)
        if protocol_id:
            self._by_protocol[protocol_id].add(key)

        transition_id = getattr(record, "transition_id", None)
        if transition_id:
            self._by_transition[transition_id].add(key)

        context_version = getattr(record, "context_version", None)
        if context_version:
            self._by_context_version[context_version].add(key)

        if isinstance(record, WorkUnit):
            self._by_work_unit[record.work_unit_id].add(key)
            self._by_scope[record.scope_ref].add(key)
            self._work_units_by_status[record.status].add(key)
            self._work_units_by_role[record.agent_role].add(key)
            if record.parent_work_unit_id is not None:
                self._child_work_units_by_parent[record.parent_work_unit_id].add(key)
        elif isinstance(record, ContextPackage):
            self._by_work_unit[record.work_unit_id].add(key)
            self._context_packages_by_role[record.agent_identity.role].add(key)
        elif isinstance(record, CommitDelta):
            self._by_work_unit[record.work_unit_id].add(key)
            self._commit_deltas_by_status[record.status].add(key)
            self._commit_deltas_by_agent[record.agent_structural_id].add(key)
            for authority in record.authorities_touched():
                self._commit_deltas_by_authority[authority].add(key)
            for artifact in record.produced_artifacts:
                self._commit_deltas_by_artifact_path[artifact.path].add(key)
        elif isinstance(record, OpenQuestion):
            self._by_work_unit[record.origin_work_unit].add(key)
            self._by_scope[record.scope_ref].add(key)
            self._open_questions_by_status[record.status].add(key)
            self._open_questions_by_priority[record.priority].add(key)
            self._open_questions_by_domain[record.domain].add(key)
            self._open_questions_by_needed_from[record.needed_from].add(key)
        elif isinstance(record, QuestionAnswerRecord):
            self._by_work_unit[record.work_unit_id].add(key)
            self._question_answers_by_question[record.question_id].add(key)
            self._question_answers_by_domain[record.question_domain].add(key)
            self._question_answers_by_actor[record.answered_by].add(key)
        elif isinstance(record, ReviewerAnswerQueueProjectionRecord):
            reviewer_key = record.reviewer if record.reviewer is not None else "__ALL__"
            self._reviewer_queues_by_reviewer[reviewer_key].add(key)
            for domain in record.domains:
                self._reviewer_queues_by_domain[domain].add(key)
        elif isinstance(record, ReviewerQueueRefreshReceipt):
            for projection_id in record.refreshed_projection_ids:
                self._reviewer_queue_refreshs_by_projection[projection_id].add(key)
        elif isinstance(record, PlannerManifest):
            self._by_work_unit[record.parent_work_unit_id].add(key)
            self._planner_manifests_by_status[record.status].add(key)
            self._planner_manifests_by_intent[record.intent].add(key)
            self._planner_manifests_by_question[record.source_question_id].add(key)
            self._planner_manifests_by_delta[record.planner_delta_id].add(key)
        elif isinstance(record, PlannerManifestSweepReceipt):
            for manifest_id in record.maintained_manifest_ids:
                self._planner_sweeps_by_manifest[manifest_id].add(key)
        elif isinstance(record, PlannerManifestSweepAggregateRecord):
            for receipt_id in record.retained_receipt_ids:
                self._planner_sweep_aggregates_by_receipt[receipt_id].add(key)
        elif isinstance(record, ManifestRouteStateRecord):
            owner_key = (record.owner_scope.scope_type, record.owner_scope.scope_id)
            self._manifest_route_states_by_owner[owner_key].add(key)
            self._manifest_route_states_by_loop_position[record.route_frame.loop_position].add(key)
            if record.linked_automation_state_id:
                self._manifest_route_states_by_automation[record.linked_automation_state_id].add(key)
            if record.owner_scope.scope_type == "WORK_UNIT":
                self._by_work_unit[record.owner_scope.scope_id].add(key)
            for branch in record.branches:
                for target_ref in branch.target_refs:
                    self._by_scope[target_ref].add(key)
        elif isinstance(record, AutomationStateRecord):
            scope_key = (record.scope_type, record.scope_ref)
            self._automation_states_by_scope[scope_key].add(key)
            self._automation_states_by_stage[record.current_stage].add(key)
            if record.linked_manifest_id:
                self._automation_states_by_manifest[record.linked_manifest_id].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, HorizonRecord):
            scope_key = (record.scope_type, record.scope_ref)
            self._horizon_states_by_scope[scope_key].add(key)
            self._horizon_states_by_layer[record.horizon_layer.value].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            for item in record.work_items:
                for target_ref in item.target_refs:
                    self._by_scope[target_ref].add(key)
        elif isinstance(record, HorizonEnactmentReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._horizon_enactment_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            for horizon_id in record.source_horizon_ids:
                self._horizon_enactment_receipts_by_horizon[horizon_id].add(key)
        elif isinstance(record, ScheduleReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_receipts_by_scope[scope_key].add(key)
            self._schedule_receipts_by_state[record.scheduler_state].add(key)
            self._schedule_receipts_by_commitment[record.commitment].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, ScheduleControlReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_control_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, ScheduleDispatchReconciliationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_dispatch_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleCompletionReleaseReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_completion_release_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleSettlementReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_settlement_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleLineageArchiveReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_lineage_archive_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, ScheduleLineageReplayReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_lineage_replay_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, ScheduleResumeProjectionReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_resume_projection_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleResumeBundleMaterializationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_resume_bundle_materialization_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleTakeoverEntryActivationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_takeover_entry_activation_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleActivationHandoffCapsuleReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_activation_handoff_capsule_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleHandoffEntryRehearsalReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_handoff_entry_rehearsal_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ScheduleExecutorStartPacketMaterializationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_executor_start_packet_materialization_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
            if record.work_unit_id:
                self._by_work_unit[record.work_unit_id].add(key)
        elif isinstance(record, ExecutorCapability):
            self._executor_capabilities_by_executor[record.executor_id].add(key)
            self._executor_capabilities_by_carrier[record.carrier].add(key)
            self._executor_capabilities_by_availability[record.availability].add(key)
            self._executor_capabilities_by_trust[record.trust_class].add(key)
        elif isinstance(record, TakeoverAssessmentReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._takeover_receipts_by_scope[scope_key].add(key)
            self._takeover_receipts_by_packet_type[record.packet_type].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, ManualAutomationEquivalenceReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._manual_automation_equivalence_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, ContextPerfectContinuationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._context_perfect_continuation_receipts_by_scope[scope_key].add(key)
            self._by_scope[record.scope_ref].add(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit[record.scope_ref].add(key)
        elif isinstance(record, BranchClaimReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_claim_receipts_by_parent[parent_key].add(key)
            self._branch_claim_receipts_by_work_unit[record.branch_work_unit_id].add(key)
            self._branch_claim_receipts_by_status[record.claim_status].add(key)
            if record.selected_capability_id:
                self._branch_claim_receipts_by_capability[record.selected_capability_id].add(key)
            self._by_scope[record.parent_scope_ref].add(key)
            self._by_scope[record.branch_scope_ref].add(key)
            self._by_work_unit[record.branch_work_unit_id].add(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit[record.parent_scope_ref].add(key)
        elif isinstance(record, BranchControlReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_control_receipts_by_parent[parent_key].add(key)
            self._by_scope[record.parent_scope_ref].add(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit[record.parent_scope_ref].add(key)
            for work_unit_id in record.active_branch_work_unit_ids:
                self._by_work_unit[work_unit_id].add(key)
            for work_unit_id in record.stale_return_branch_work_unit_ids:
                self._by_work_unit[work_unit_id].add(key)
        elif isinstance(record, BranchMergeProposal):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_merge_proposals_by_parent[parent_key].add(key)
            self._by_scope[record.parent_scope_ref].add(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit[record.parent_scope_ref].add(key)
            for work_unit_id in record.branch_work_unit_ids:
                self._by_work_unit[work_unit_id].add(key)
        elif isinstance(record, BranchSettlementReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_settlement_receipts_by_parent[parent_key].add(key)
            self._branch_settlement_receipts_by_outcome[record.outcome].add(key)
            self._by_scope[record.parent_scope_ref].add(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit[record.parent_scope_ref].add(key)
            for work_unit_id in record.branch_work_unit_ids:
                self._by_work_unit[work_unit_id].add(key)
        elif isinstance(record, BranchHorizonSyncReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_horizon_sync_receipts_by_parent[parent_key].add(key)
            self._by_scope[record.parent_scope_ref].add(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit[record.parent_scope_ref].add(key)
            for work_unit_id in record.active_branch_work_unit_ids:
                self._by_work_unit[work_unit_id].add(key)
        elif isinstance(record, BranchRescheduleReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_reschedule_receipts_by_parent[parent_key].add(key)
            self._by_scope[record.parent_scope_ref].add(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit[record.parent_scope_ref].add(key)
        else:
            raise TypeError(f"Unsupported kernel record for indexing: {type(record).__name__}")

    def _deindex_record(self, record: KernelRecord) -> None:
        key = self._record_key(record)
        record_type, _ = key

        self._by_type.get(record_type, set()).discard(key)

        protocol_id = getattr(record, "protocol_id", None)
        if protocol_id:
            self._by_protocol.get(protocol_id, set()).discard(key)

        transition_id = getattr(record, "transition_id", None)
        if transition_id:
            self._by_transition.get(transition_id, set()).discard(key)

        context_version = getattr(record, "context_version", None)
        if context_version:
            self._by_context_version.get(context_version, set()).discard(key)

        if isinstance(record, WorkUnit):
            self._by_work_unit.get(record.work_unit_id, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            self._work_units_by_status.get(record.status, set()).discard(key)
            self._work_units_by_role.get(record.agent_role, set()).discard(key)
            if record.parent_work_unit_id is not None:
                self._child_work_units_by_parent.get(record.parent_work_unit_id, set()).discard(key)
        elif isinstance(record, ContextPackage):
            self._by_work_unit.get(record.work_unit_id, set()).discard(key)
            self._context_packages_by_role.get(record.agent_identity.role, set()).discard(key)
        elif isinstance(record, CommitDelta):
            self._by_work_unit.get(record.work_unit_id, set()).discard(key)
            self._commit_deltas_by_status.get(record.status, set()).discard(key)
            self._commit_deltas_by_agent.get(record.agent_structural_id, set()).discard(key)
            for authority in record.authorities_touched():
                self._commit_deltas_by_authority.get(authority, set()).discard(key)
            for artifact in record.produced_artifacts:
                self._commit_deltas_by_artifact_path.get(artifact.path, set()).discard(key)
        elif isinstance(record, OpenQuestion):
            self._by_work_unit.get(record.origin_work_unit, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            self._open_questions_by_status.get(record.status, set()).discard(key)
            self._open_questions_by_priority.get(record.priority, set()).discard(key)
            self._open_questions_by_domain.get(record.domain, set()).discard(key)
            self._open_questions_by_needed_from.get(record.needed_from, set()).discard(key)
        elif isinstance(record, QuestionAnswerRecord):
            self._by_work_unit.get(record.work_unit_id, set()).discard(key)
            self._question_answers_by_question.get(record.question_id, set()).discard(key)
            self._question_answers_by_domain.get(record.question_domain, set()).discard(key)
            self._question_answers_by_actor.get(record.answered_by, set()).discard(key)
        elif isinstance(record, ReviewerAnswerQueueProjectionRecord):
            reviewer_key = record.reviewer if record.reviewer is not None else "__ALL__"
            self._reviewer_queues_by_reviewer.get(reviewer_key, set()).discard(key)
            for domain in record.domains:
                self._reviewer_queues_by_domain.get(domain, set()).discard(key)
        elif isinstance(record, ReviewerQueueRefreshReceipt):
            for projection_id in record.refreshed_projection_ids:
                self._reviewer_queue_refreshs_by_projection.get(projection_id, set()).discard(key)
        elif isinstance(record, PlannerManifest):
            self._by_work_unit.get(record.parent_work_unit_id, set()).discard(key)
            self._planner_manifests_by_status.get(record.status, set()).discard(key)
            self._planner_manifests_by_intent.get(record.intent, set()).discard(key)
            self._planner_manifests_by_question.get(record.source_question_id, set()).discard(key)
            self._planner_manifests_by_delta.get(record.planner_delta_id, set()).discard(key)
        elif isinstance(record, PlannerManifestSweepReceipt):
            for manifest_id in record.maintained_manifest_ids:
                self._planner_sweeps_by_manifest.get(manifest_id, set()).discard(key)
        elif isinstance(record, PlannerManifestSweepAggregateRecord):
            for receipt_id in record.retained_receipt_ids:
                self._planner_sweep_aggregates_by_receipt.get(receipt_id, set()).discard(key)
        elif isinstance(record, ManifestRouteStateRecord):
            owner_key = (record.owner_scope.scope_type, record.owner_scope.scope_id)
            self._manifest_route_states_by_owner.get(owner_key, set()).discard(key)
            self._manifest_route_states_by_loop_position.get(record.route_frame.loop_position, set()).discard(key)
            if record.linked_automation_state_id:
                self._manifest_route_states_by_automation.get(record.linked_automation_state_id, set()).discard(key)
            if record.owner_scope.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.owner_scope.scope_id, set()).discard(key)
            for branch in record.branches:
                for target_ref in branch.target_refs:
                    self._by_scope.get(target_ref, set()).discard(key)
        elif isinstance(record, AutomationStateRecord):
            scope_key = (record.scope_type, record.scope_ref)
            self._automation_states_by_scope.get(scope_key, set()).discard(key)
            self._automation_states_by_stage.get(record.current_stage, set()).discard(key)
            if record.linked_manifest_id:
                self._automation_states_by_manifest.get(record.linked_manifest_id, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
        elif isinstance(record, HorizonRecord):
            scope_key = (record.scope_type, record.scope_ref)
            self._horizon_states_by_scope.get(scope_key, set()).discard(key)
            self._horizon_states_by_layer.get(record.horizon_layer.value, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            for item in record.work_items:
                for target_ref in item.target_refs:
                    self._by_scope.get(target_ref, set()).discard(key)
        elif isinstance(record, HorizonEnactmentReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._horizon_enactment_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            for horizon_id in record.source_horizon_ids:
                self._horizon_enactment_receipts_by_horizon.get(horizon_id, set()).discard(key)
        elif isinstance(record, ScheduleReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_receipts_by_scope.get(scope_key, set()).discard(key)
            self._schedule_receipts_by_state.get(record.scheduler_state, set()).discard(key)
            self._schedule_receipts_by_commitment.get(record.commitment, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
        elif isinstance(record, ScheduleControlReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_control_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
        elif isinstance(record, ScheduleDispatchReconciliationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_dispatch_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            if record.work_unit_id:
                self._by_work_unit.get(record.work_unit_id, set()).discard(key)
        elif isinstance(record, ExecutorCapability):
            self._executor_capabilities_by_executor.get(record.executor_id, set()).discard(key)
            self._executor_capabilities_by_carrier.get(record.carrier, set()).discard(key)
            self._executor_capabilities_by_availability.get(record.availability, set()).discard(key)
            self._executor_capabilities_by_trust.get(record.trust_class, set()).discard(key)
        elif isinstance(record, TakeoverAssessmentReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._takeover_receipts_by_scope.get(scope_key, set()).discard(key)
            self._takeover_receipts_by_packet_type.get(record.packet_type, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
        elif isinstance(record, ManualAutomationEquivalenceReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._manual_automation_equivalence_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
        elif isinstance(record, ContextPerfectContinuationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._context_perfect_continuation_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
        elif isinstance(record, ScheduleResumeBundleMaterializationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_resume_bundle_materialization_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            if record.work_unit_id:
                self._by_work_unit.get(record.work_unit_id, set()).discard(key)
        elif isinstance(record, ScheduleTakeoverEntryActivationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_takeover_entry_activation_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            if record.work_unit_id:
                self._by_work_unit.get(record.work_unit_id, set()).discard(key)
        elif isinstance(record, ScheduleActivationHandoffCapsuleReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_activation_handoff_capsule_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            if record.work_unit_id:
                self._by_work_unit.get(record.work_unit_id, set()).discard(key)
        elif isinstance(record, ScheduleHandoffEntryRehearsalReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_handoff_entry_rehearsal_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            if record.work_unit_id:
                self._by_work_unit.get(record.work_unit_id, set()).discard(key)
        elif isinstance(record, ScheduleExecutorStartPacketMaterializationReceipt):
            scope_key = (record.scope_type, record.scope_ref)
            self._schedule_executor_start_packet_materialization_receipts_by_scope.get(scope_key, set()).discard(key)
            self._by_scope.get(record.scope_ref, set()).discard(key)
            if record.scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.scope_ref, set()).discard(key)
            if record.work_unit_id:
                self._by_work_unit.get(record.work_unit_id, set()).discard(key)
        elif isinstance(record, BranchClaimReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_claim_receipts_by_parent.get(parent_key, set()).discard(key)
            self._branch_claim_receipts_by_work_unit.get(record.branch_work_unit_id, set()).discard(key)
            self._branch_claim_receipts_by_status.get(record.claim_status, set()).discard(key)
            if record.selected_capability_id:
                self._branch_claim_receipts_by_capability.get(record.selected_capability_id, set()).discard(key)
            self._by_scope.get(record.parent_scope_ref, set()).discard(key)
            self._by_scope.get(record.branch_scope_ref, set()).discard(key)
            self._by_work_unit.get(record.branch_work_unit_id, set()).discard(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.parent_scope_ref, set()).discard(key)
        elif isinstance(record, BranchControlReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_control_receipts_by_parent.get(parent_key, set()).discard(key)
            self._by_scope.get(record.parent_scope_ref, set()).discard(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.parent_scope_ref, set()).discard(key)
            for work_unit_id in record.active_branch_work_unit_ids:
                self._by_work_unit.get(work_unit_id, set()).discard(key)
            for work_unit_id in record.stale_return_branch_work_unit_ids:
                self._by_work_unit.get(work_unit_id, set()).discard(key)
        elif isinstance(record, BranchMergeProposal):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_merge_proposals_by_parent.get(parent_key, set()).discard(key)
            self._by_scope.get(record.parent_scope_ref, set()).discard(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.parent_scope_ref, set()).discard(key)
            for work_unit_id in record.branch_work_unit_ids:
                self._by_work_unit.get(work_unit_id, set()).discard(key)
        elif isinstance(record, BranchSettlementReceipt):
            parent_key = (record.parent_scope_type, record.parent_scope_ref)
            self._branch_settlement_receipts_by_parent.get(parent_key, set()).discard(key)
            self._branch_settlement_receipts_by_outcome.get(record.outcome, set()).discard(key)
            self._by_scope.get(record.parent_scope_ref, set()).discard(key)
            if record.parent_scope_type == "WORK_UNIT":
                self._by_work_unit.get(record.parent_scope_ref, set()).discard(key)
            for work_unit_id in record.branch_work_unit_ids:
                self._by_work_unit.get(work_unit_id, set()).discard(key)

        self._records.pop(key, None)

    def _records_for_keys(self, keys: set[RecordKey]) -> list[KernelRecord]:
        return [self._records[key] for key in sorted(keys) if key in self._records]

    def _typed_records(self, keys: set[RecordKey], cls: type[KernelRecord]) -> list[KernelRecord]:
        return [record for record in self._records_for_keys(keys) if isinstance(record, cls)]

    def _record_key(self, record: KernelRecord) -> RecordKey:
        if isinstance(record, WorkUnit):
            return ("work_unit", record.work_unit_id)
        if isinstance(record, ContextPackage):
            return ("context_package", record.context_package_id)
        if isinstance(record, CommitDelta):
            return ("commit_delta", record.delta_id)
        if isinstance(record, OpenQuestion):
            return ("open_question", record.question_id)
        if isinstance(record, QuestionAnswerRecord):
            return ("question_answer", record.answer_id)
        if isinstance(record, ReviewerAnswerQueueProjectionRecord):
            return ("reviewer_answer_queue", record.projection_id)
        if isinstance(record, ReviewerQueueRefreshReceipt):
            return ("reviewer_queue_refresh", record.receipt_id)
        if isinstance(record, PlannerManifest):
            return ("planner_manifest", record.manifest_id)
        if isinstance(record, PlannerManifestSweepReceipt):
            return ("planner_manifest_sweep", record.receipt_id)
        if isinstance(record, PlannerManifestSweepAggregateRecord):
            return ("planner_manifest_sweep_aggregate", record.aggregate_id)
        if isinstance(record, ManifestRouteStateRecord):
            return ("manifest_route_state", record.manifest_id)
        if isinstance(record, AutomationStateRecord):
            return ("automation_state", record.automation_state_id)
        if isinstance(record, HorizonRecord):
            return ("horizon_state", record.horizon_id)
        if isinstance(record, HorizonEnactmentReceipt):
            return ("horizon_enactment_receipt", record.receipt_id)
        if isinstance(record, ScheduleReceipt):
            return ("schedule_receipt", record.receipt_id)
        if isinstance(record, ScheduleControlReceipt):
            return ("schedule_control_receipt", record.receipt_id)
        if isinstance(record, ScheduleDispatchReconciliationReceipt):
            return ("schedule_dispatch_reconciliation_receipt", record.receipt_id)
        if isinstance(record, ScheduleCompletionReleaseReceipt):
            return ("schedule_completion_release_receipt", record.receipt_id)
        if isinstance(record, ScheduleSettlementReceipt):
            return ("schedule_settlement_receipt", record.receipt_id)
        if isinstance(record, ScheduleLineageArchiveReceipt):
            return ("schedule_lineage_archive_receipt", record.receipt_id)
        if isinstance(record, ScheduleLineageReplayReceipt):
            return ("schedule_lineage_replay_receipt", record.receipt_id)
        if isinstance(record, ScheduleResumeProjectionReceipt):
            return ("schedule_resume_projection_receipt", record.receipt_id)
        if isinstance(record, ScheduleResumeBundleMaterializationReceipt):
            return ("schedule_resume_bundle_materialization_receipt", record.receipt_id)
        if isinstance(record, ScheduleTakeoverEntryActivationReceipt):
            return ("schedule_takeover_entry_activation_receipt", record.receipt_id)
        if isinstance(record, ScheduleActivationHandoffCapsuleReceipt):
            return ("schedule_activation_handoff_capsule_receipt", record.receipt_id)
        if isinstance(record, ScheduleHandoffEntryRehearsalReceipt):
            return ("schedule_handoff_entry_rehearsal_receipt", record.receipt_id)
        if isinstance(record, ScheduleExecutorStartPacketMaterializationReceipt):
            return ("schedule_executor_start_packet_materialization_receipt", record.receipt_id)
        if isinstance(record, ExecutorCapability):
            return ("executor_capability", record.capability_id)
        if isinstance(record, TakeoverAssessmentReceipt):
            return ("takeover_assessment_receipt", record.receipt_id)
        if isinstance(record, ManualAutomationEquivalenceReceipt):
            return ("manual_automation_equivalence_receipt", record.receipt_id)
        if isinstance(record, ContextPerfectContinuationReceipt):
            return ("context_perfect_continuation_receipt", record.receipt_id)
        if isinstance(record, BranchClaimReceipt):
            return ("branch_claim_receipt", record.receipt_id)
        if isinstance(record, BranchControlReceipt):
            return ("branch_control_receipt", record.receipt_id)
        if isinstance(record, BranchMergeProposal):
            return ("branch_merge_proposal", record.proposal_id)
        if isinstance(record, BranchSettlementReceipt):
            return ("branch_settlement_receipt", record.receipt_id)
        if isinstance(record, BranchHorizonSyncReceipt):
            return ("branch_horizon_sync_receipt", record.receipt_id)
        if isinstance(record, BranchRescheduleReceipt):
            return ("branch_reschedule_receipt", record.receipt_id)
        raise TypeError(f"Unsupported kernel record: {type(record).__name__}")


IonIndex = KernelIndex
