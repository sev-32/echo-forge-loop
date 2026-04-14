"""First-pass ION kernel model types derived from the active schema specs.

This module does not claim the full store/index/graph layer exists yet. It provides
the typed execution-contract objects that the active daemon-facing specs already
describe: authority classes, work units, context packages, commit deltas, and open
questions.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
import hashlib
from typing import Any


class StrEnum(str, Enum):
    """Enum base that behaves cleanly in serialized text surfaces."""

    def __str__(self) -> str:
        return self.value


class AuthorityClass(StrEnum):
    AUTHORITY = "AUTHORITY"
    WITNESS = "WITNESS"
    PLAN = "PLAN"
    AUDIT = "AUDIT"
    GENERATED_STATE = "GENERATED_STATE"
    STALE_COMPETITOR = "STALE_COMPETITOR"
    ARCHIVE_REFERENCE = "ARCHIVE_REFERENCE"


class ScopeType(StrEnum):
    FILE = "FILE"
    DIRECTORY = "DIRECTORY"
    PROJECT = "PROJECT"
    CROSS_PROJECT = "CROSS_PROJECT"


class WorkPriority(StrEnum):
    P0_CRITICAL = "P0_CRITICAL"
    P1_HIGH = "P1_HIGH"
    P2_NORMAL = "P2_NORMAL"
    P3_LOW = "P3_LOW"


class OpenQuestionPriority(StrEnum):
    P0_BLOCKING = "P0_BLOCKING"
    P1_HIGH = "P1_HIGH"
    P2_NORMAL = "P2_NORMAL"
    P3_LOW = "P3_LOW"


class WorkUnitStatus(StrEnum):
    PENDING = "PENDING"
    DISPATCHED = "DISPATCHED"
    EXECUTING = "EXECUTING"
    VALIDATING = "VALIDATING"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"


class CommitDeltaStatus(StrEnum):
    PROPOSED = "PROPOSED"
    ACCEPTED = "ACCEPTED"
    ACCEPTED_AS_WITNESS = "ACCEPTED_AS_WITNESS"
    REJECTED = "REJECTED"
    REQUIRES_REVIEW = "REQUIRES_REVIEW"
    REQUIRES_RECONCILIATION = "REQUIRES_RECONCILIATION"


class InputRefType(StrEnum):
    ARTIFACT = "ARTIFACT"
    EVIDENCE_FINDING = "EVIDENCE_FINDING"
    SIGNAL = "SIGNAL"
    STATE_FILE = "STATE_FILE"
    DOCTRINE = "DOCTRINE"


class InputVisibility(StrEnum):
    FULL = "FULL"
    SIGNATURES_ONLY = "SIGNATURES_ONLY"
    SUMMARY = "SUMMARY"


class ArtifactOperation(StrEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    APPEND = "APPEND"


class StateMutationOperation(StrEnum):
    APPEND = "APPEND"
    UPDATE_SECTION = "UPDATE_SECTION"


class OpenQuestionStatus(StrEnum):
    OPEN = "OPEN"
    ASSIGNED = "ASSIGNED"
    RESOLVED = "RESOLVED"
    DEFERRED = "DEFERRED"
    CANCELLED = "CANCELLED"


class PlannerIntentType(StrEnum):
    ISSUE_CHILD_WORK = "ISSUE_CHILD_WORK"


class PlannerManifestStatus(StrEnum):
    READY = "READY"
    EXECUTED = "EXECUTED"
    CANCELLED = "CANCELLED"
    SUPERSEDED = "SUPERSEDED"
    EXPIRED = "EXPIRED"


class HorizonLayer(StrEnum):
    IMMEDIATE = "IMMEDIATE"
    NEAR = "NEAR"
    FAR = "FAR"


class ScheduleSourceKind(StrEnum):
    WORK_UNIT = "WORK_UNIT"
    HORIZON = "HORIZON"


class ScheduleCommitment(StrEnum):
    SPECULATIVE = "SPECULATIVE"
    EMERGING = "EMERGING"
    LIKELY = "LIKELY"
    PRECOMMITTED = "PRECOMMITTED"
    COMMITTED = "COMMITTED"
    ENACTED = "ENACTED"
    COMPLETED = "COMPLETED"


class ScheduleState(StrEnum):
    READY = "READY"
    BLOCKED = "BLOCKED"
    CLAIMED = "CLAIMED"
    IN_FLIGHT = "IN_FLIGHT"
    RETRY = "RETRY"
    STALE = "STALE"
    DEFERRED = "DEFERRED"
    ENACTED_UNLANDED = "ENACTED_UNLANDED"
    FUTURE_CANDIDATE = "FUTURE_CANDIDATE"


class ScheduleCarrier(StrEnum):
    IDE_MANUAL = "IDE_MANUAL"
    SUPERVISED_RUNTIME = "SUPERVISED_RUNTIME"
    EXTERNAL_API = "EXTERNAL_API"
    SWARM_CHILD = "SWARM_CHILD"


class CarrierBindingSource(StrEnum):
    EXECUTOR_CAPABILITY_REGISTRY = "EXECUTOR_CAPABILITY_REGISTRY"
    HEURISTIC_FALLBACK = "HEURISTIC_FALLBACK"


class ExecutorTrustClass(StrEnum):
    HUMAN_SUPERVISED = "HUMAN_SUPERVISED"
    SUPERVISED_AUTOMATION = "SUPERVISED_AUTOMATION"
    EXTERNAL_VERIFIED = "EXTERNAL_VERIFIED"
    EXPERIMENTAL = "EXPERIMENTAL"


class ExecutorAvailability(StrEnum):
    AVAILABLE = "AVAILABLE"
    DEGRADED = "DEGRADED"
    DRAINED = "DRAINED"
    UNAVAILABLE = "UNAVAILABLE"


class FallbackSuitability(StrEnum):
    PRIMARY = "PRIMARY"
    FALLBACK_ONLY = "FALLBACK_ONLY"
    UNSUITABLE = "UNSUITABLE"


class BranchClaimStatus(StrEnum):
    ACTIVE = "ACTIVE"
    RELEASED = "RELEASED"
    SUPERSEDED = "SUPERSEDED"


class BranchSettlementOutcome(StrEnum):
    ACCEPTED_AS_IS = "ACCEPTED_AS_IS"
    MERGE_PROPOSAL_REQUIRED = "MERGE_PROPOSAL_REQUIRED"
    ESCALATE_REVIEW = "ESCALATE_REVIEW"
    DEFERRED = "DEFERRED"
    ABANDONED = "ABANDONED"


def _content_checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class KernelRecord:
    """Small serialization helper for first-pass kernel records."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class InputRef(KernelRecord):
    ref_id: str
    ref_type: InputRefType
    ref_path: str
    visibility: InputVisibility
    required: bool = True


@dataclass(frozen=True)
class SpawnPolicy(KernelRecord):
    may_spawn: bool
    max_children: int = 0
    spawn_templates: tuple[str, ...] = ()
    spawn_requires_approval: bool = False


@dataclass(frozen=True)
class WorkUnit(KernelRecord):
    work_unit_id: str
    created_at: str
    protocol_id: str
    transition_id: str
    context_version: str
    agent_personal_name: str
    agent_role: str
    agent_structural_id: str
    agent_tier: int
    agent_domain: str
    chassis: str
    scope_type: ScopeType
    scope_ref: str
    bound_template: str
    input_refs: tuple[InputRef, ...]
    context_package_id: str
    allowed_writes: tuple[str, ...]
    allowed_next_actions: tuple[str, ...]
    priority: WorkPriority
    status: WorkUnitStatus
    must_not: tuple[str, ...] = ()
    open_questions_in_scope: tuple[str, ...] = ()
    dependencies: tuple[str, ...] = ()
    spawn_policy: SpawnPolicy = field(default_factory=lambda: SpawnPolicy(may_spawn=False))
    timeout_seconds: int = 300
    expected_output_schema: str | None = None
    parent_work_unit_id: str | None = None

    def is_ready(self) -> bool:
        return self.status is WorkUnitStatus.PENDING and not self.dependencies


@dataclass(frozen=True)
class TargetFile(KernelRecord):
    path: str
    content: str
    line_count: int
    language: str | None = None


@dataclass(frozen=True)
class SemanticOverlay(KernelRecord):
    path: str
    content: str


@dataclass(frozen=True)
class PriorFinding(KernelRecord):
    source: str
    summary: str
    confidence: float


@dataclass(frozen=True)
class DependencyInterface(KernelRecord):
    path: str
    signatures_only: str


@dataclass(frozen=True)
class AgentIdentity(KernelRecord):
    personal_name: str
    role: str
    structural_identity: str
    tier: int
    domain: str
    specialty: str


@dataclass(frozen=True)
class TierOneDoctrine(KernelRecord):
    constitution_excerpt: str
    template_spec: str
    kernel_excerpt: str | None = None


@dataclass(frozen=True)
class TierTwoTarget(KernelRecord):
    target_files: tuple[TargetFile, ...]


@dataclass(frozen=True)
class TierThreeMission(KernelRecord):
    task_payload: str
    objective: str
    output_schema: str | None = None


@dataclass(frozen=True)
class TierFourSemantic(KernelRecord):
    semantic_overlays: tuple[SemanticOverlay, ...] = ()
    prior_findings: tuple[PriorFinding, ...] = ()
    open_questions: tuple[str, ...] = ()


@dataclass(frozen=True)
class TierFiveDependencies(KernelRecord):
    dependency_interfaces: tuple[DependencyInterface, ...] = ()


@dataclass(frozen=True)
class ContextTiers(KernelRecord):
    tier_1_doctrine: TierOneDoctrine
    tier_2_target: TierTwoTarget
    tier_3_mission: TierThreeMission
    tier_4_semantic: TierFourSemantic = field(default_factory=TierFourSemantic)
    tier_5_dependencies: TierFiveDependencies = field(default_factory=TierFiveDependencies)


@dataclass(frozen=True)
class ContextPackage(KernelRecord):
    context_package_id: str
    context_version: str
    compiled_at: str
    work_unit_id: str
    protocol_id: str
    transition_id: str
    agent_identity: AgentIdentity
    tiers: ContextTiers
    token_budget: int
    actual_tokens: int
    tiers_dropped: tuple[str, ...]
    allowed_writes: tuple[str, ...]
    allowed_next_actions: tuple[str, ...]
    must_not: tuple[str, ...] = ()

    def is_stale_against(self, version: str) -> bool:
        return self.context_version != version


@dataclass(frozen=True)
class ProducedArtifact(KernelRecord):
    path: str
    content: str
    operation: ArtifactOperation
    authority_class: AuthorityClass
    checksum: str = ""

    def __post_init__(self) -> None:
        if not self.checksum:
            object.__setattr__(self, "checksum", _content_checksum(self.content))


@dataclass(frozen=True)
class LedgerEntry(KernelRecord):
    ledger: str
    row: dict[str, Any]


@dataclass(frozen=True)
class StateMutation(KernelRecord):
    target: str
    operation: StateMutationOperation
    content: str


@dataclass(frozen=True)
class ProposedSignal(KernelRecord):
    signal_type: str
    target: str
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ChildSpec(KernelRecord):
    suggested_template: str
    scope_ref: str
    rationale: str
    suggested_agent: str | None = None


@dataclass(frozen=True)
class CommitDelta(KernelRecord):
    delta_id: str
    created_at: str
    work_unit_id: str
    context_version: str
    protocol_id: str
    transition_id: str
    agent_personal_name: str
    agent_structural_id: str
    chassis: str
    produced_artifacts: tuple[ProducedArtifact, ...]
    status: CommitDeltaStatus
    confidence: float
    ledger_additions: tuple[LedgerEntry, ...] = ()
    state_mutations: tuple[StateMutation, ...] = ()
    proposed_signals: tuple[ProposedSignal, ...] = ()
    proposed_open_questions: tuple[str, ...] = ()
    proposed_child_work_units: tuple[ChildSpec, ...] = ()
    resolved_question_ids: tuple[str, ...] = ()
    review_reasons: tuple[str, ...] = ()
    contradictions: tuple[str, ...] = ()
    notes: str | None = None

    def authorities_touched(self) -> set[AuthorityClass]:
        return {artifact.authority_class for artifact in self.produced_artifacts}


@dataclass(frozen=True)
class OpenQuestion(KernelRecord):
    question_id: str
    created_at: str
    origin_work_unit: str
    origin_agent: str
    origin_transition: str
    domain: str
    scope_ref: str
    question_text: str
    needed_from: str
    priority: OpenQuestionPriority
    status: OpenQuestionStatus
    context: str | None = None
    blocking: tuple[str, ...] = ()
    resolved_by: str | None = None
    resolved_at: str | None = None
    resolution: str | None = None
    resolution_evidence: tuple[str, ...] = ()
    linked_artifacts: tuple[str, ...] = ()
    linked_competitions: tuple[str, ...] = ()
    parent_question_id: str | None = None

    def is_blocking(self) -> bool:
        return self.priority is OpenQuestionPriority.P0_BLOCKING or bool(self.blocking)



@dataclass(frozen=True)
class QuestionAnswerRecord(KernelRecord):
    answer_id: str
    created_at: str
    question_id: str
    work_unit_id: str
    protocol_id: str
    transition_id: str
    context_version: str
    question_domain: str
    answered_by: str
    resolution: str
    resolution_evidence: tuple[str, ...] = ()
    source: str = "EXPLICIT_ANSWER"
    notes: str | None = None


@dataclass(frozen=True)
class ReviewerAnswerQueueProjectionRecord(KernelRecord):
    projection_id: str
    generated_at: str
    reviewer: str | None
    domains: tuple[str, ...]
    pending_question_ids: tuple[str, ...] = ()
    recent_answer_ids: tuple[str, ...] = ()
    pending_total_count: int = 0
    recent_answer_total_count: int = 0
    pending_limit: int | None = None
    answer_limit: int | None = None
    source: str = "GENERATED_REVIEWER_QUEUE"


@dataclass(frozen=True)
class ReviewerQueueRefreshReceipt(KernelRecord):
    receipt_id: str
    generated_at: str
    refreshed_projection_ids: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    candidate_count: int = 0
    refreshed_count: int = 0
    generated_by: str = "DAEMON"
    source: str = "REVIEWER_QUEUE_REFRESH"


@dataclass(frozen=True)
class PlannerManifest(KernelRecord):
    manifest_id: str
    created_at: str
    parent_work_unit_id: str
    protocol_id: str
    transition_id: str
    context_version: str
    source_question_id: str
    planner_delta_id: str
    intent: PlannerIntentType
    status: PlannerManifestStatus
    created_by: str
    child_spec_count: int = 0
    resolved_question_ids: tuple[str, ...] = ()
    notes: str | None = None
    executed_child_work_unit_ids: tuple[str, ...] = ()
    executed_at: str | None = None
    expires_at: str | None = None
    status_changed_at: str | None = None
    status_reason: str | None = None
    superseded_by_manifest_id: str | None = None


@dataclass(frozen=True)
class PlannerManifestSweepReceipt(KernelRecord):
    receipt_id: str
    generated_at: str
    as_of: str
    maintained_manifest_ids: tuple[str, ...] = ()
    resulting_statuses: tuple[PlannerManifestStatus, ...] = ()
    reasons: tuple[str, ...] = ()
    candidate_count: int = 0
    maintained_count: int = 0
    generated_by: str = "DAEMON"
    source: str = "PLANNER_MANIFEST_SWEEP"


@dataclass(frozen=True)
class PlannerManifestSweepAggregateRecord(KernelRecord):
    aggregate_id: str
    generated_at: str
    retained_receipt_ids: tuple[str, ...] = ()
    retained_count: int = 0
    total_maintained_count: int = 0
    status_counts: dict[str, int] = field(default_factory=dict)
    reason_counts: dict[str, int] = field(default_factory=dict)
    earliest_as_of: str | None = None
    latest_as_of: str | None = None
    generated_by: str = "DAEMON"
    source: str = "PLANNER_MANIFEST_SWEEP_AGGREGATE"


@dataclass(frozen=True)
class RouteOwnerScope(KernelRecord):
    scope_type: str
    scope_id: str
    steward: str


@dataclass(frozen=True)
class ExecutorCapability(KernelRecord):
    capability_id: str
    executor_id: str
    created_at: str
    updated_at: str
    personal_name: str
    role: str
    structural_identity: str
    carrier: ScheduleCarrier
    trust_class: ExecutorTrustClass
    availability: ExecutorAvailability
    max_concurrency: int
    active_assignments: int = 0
    supported_scope_types: tuple[str, ...] = ()
    domain_fitness: tuple[str, ...] = ()
    supported_packet_families: tuple[str, ...] = ()
    fallback_suitability: FallbackSuitability = FallbackSuitability.PRIMARY
    aliases: tuple[str, ...] = ()
    side_effect_constraints: tuple[str, ...] = ()
    notes: str | None = None

    def has_capacity(self) -> bool:
        return self.max_concurrency > 0 and self.active_assignments < self.max_concurrency

    def supports_scope_type(self, scope_type: str) -> bool:
        if not self.supported_scope_types:
            return True
        normalized = scope_type.strip().upper()
        return normalized in {item.strip().upper() for item in self.supported_scope_types}

    def supports_packet_family(self, packet_family: str | None) -> bool:
        if packet_family is None or not self.supported_packet_families:
            return True
        normalized = packet_family.strip().lower()
        return normalized in {item.strip().lower() for item in self.supported_packet_families}


@dataclass(frozen=True)
class ManifestModeBinding(KernelRecord):
    context_mode: str
    automation_stage: str


@dataclass(frozen=True)
class RouteFrame(KernelRecord):
    mission: str
    governing_refs: tuple[str, ...] = ()
    loop_position: str = "CONTEXTUALIZE"
    active_branch_id: str | None = None
    handoff_summary: str | None = None
    next_route_proposal: str | None = None


@dataclass(frozen=True)
class RouteBranch(KernelRecord):
    branch_id: str
    label: str
    status: str
    priority: str
    gate_class: str
    target_refs: tuple[str, ...] = ()
    governing_refs: tuple[str, ...] = ()
    activation_conditions: tuple[str, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    confidence_band: str = "MEDIUM"
    started_at: str | None = None
    completed_at: str | None = None
    abandonment_reason: str | None = None


@dataclass(frozen=True)
class EvidencePressure(KernelRecord):
    recent_evidence_refs: tuple[str, ...] = ()
    unresolved_issue_refs: tuple[str, ...] = ()
    blocker_refs: tuple[str, ...] = ()
    drift_flags: tuple[str, ...] = ()


@dataclass(frozen=True)
class RoutingAssessment(KernelRecord):
    route_confidence: str = "MEDIUM"
    branching_stability: str = "STABLE"
    recommended_action: str = "CONTINUE"
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class ManifestRouteStateRecord(KernelRecord):
    manifest_id: str
    manifest_version: str
    created_at: str
    updated_at: str
    owner_scope: RouteOwnerScope
    mode_binding: ManifestModeBinding
    route_frame: RouteFrame
    branches: tuple[RouteBranch, ...] = ()
    evidence_pressure: EvidencePressure = field(default_factory=EvidencePressure)
    routing_assessment: RoutingAssessment = field(default_factory=RoutingAssessment)
    linked_automation_state_id: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class AutomationGate(KernelRecord):
    gate_id: str
    gate_class: str
    status: str
    satisfied: bool
    detail: str | None = None
    evidence_refs: tuple[str, ...] = ()
    required_for_promotion: bool = True


@dataclass(frozen=True)
class AutomationStateRecord(KernelRecord):
    automation_state_id: str
    created_at: str
    updated_at: str
    scope_type: str
    scope_ref: str
    current_stage: str
    governing_refs: tuple[str, ...] = ()
    active_gates: tuple[AutomationGate, ...] = ()
    blockers: tuple[str, ...] = ()
    promotion_criteria: tuple[str, ...] = ()
    fallback_mode: str = "MANUAL"
    last_transition_reason: str | None = None
    operator_override: str | None = None
    pending_actions: tuple[str, ...] = ()
    linked_manifest_id: str | None = None
    context_mode: str = "IDE_MANUAL"
    calibration_status: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class HorizonWorkItem(KernelRecord):
    item_id: str
    title: str
    summary: str
    executor_hint: str | None = None
    target_refs: tuple[str, ...] = ()
    dependency_refs: tuple[str, ...] = ()
    packet_ready: bool = False
    priority: str = "P2_NORMAL"
    blocking_notes: tuple[str, ...] = ()
    next_window_hint: str | None = None


@dataclass(frozen=True)
class HorizonRecord(KernelRecord):
    horizon_id: str
    created_at: str
    updated_at: str
    scope_type: str
    scope_ref: str
    horizon_layer: HorizonLayer
    summary: str
    work_items: tuple[HorizonWorkItem, ...] = ()
    governing_refs: tuple[str, ...] = ()
    linked_manifest_id: str | None = None
    linked_automation_state_id: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class HorizonEnactmentReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    scope_type: str
    scope_ref: str
    source_horizon_ids: tuple[str, ...]
    source_layer: HorizonLayer | None
    candidate_item_id: str
    candidate_title: str
    packet_type: str
    packet_path: str | None = None
    packet_relative_path: str | None = None
    requested_reads: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_kind: ScheduleSourceKind
    source_record_id: str
    source_layer: HorizonLayer | None
    candidate_id: str
    candidate_title: str
    scheduler_state: ScheduleState
    commitment: ScheduleCommitment
    selected_carrier: ScheduleCarrier
    reason: str
    carrier_binding_source: CarrierBindingSource = CarrierBindingSource.HEURISTIC_FALLBACK
    selected_executor_id: str | None = None
    selected_capability_id: str | None = None
    ranking_factors: tuple[str, ...] = ()
    capability_basis: tuple[str, ...] = ()
    requested_reads: tuple[str, ...] = ()
    blocking_refs: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class TakeoverAssessmentReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    scope_type: str
    scope_ref: str
    packet_path: str
    packet_relative_path: str | None
    packet_checksum: str
    packet_type: str
    packet_title: str | None
    packet_created_at: str | None
    packet_status: str | None
    objective: str
    target_executor: str | None = None
    required_reads: tuple[str, ...] = ()
    next_action: str | None = None
    expected_output: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ManualAutomationEquivalenceReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    scope_type: str
    scope_ref: str
    source_horizon_ids: tuple[str, ...]
    source_layer: HorizonLayer | None
    candidate_item_id: str
    candidate_title: str
    automation_packet_type: str
    automation_packet_path: str | None = None
    automation_packet_relative_path: str | None = None
    automation_horizon_receipt_id: str | None = None
    automation_takeover_receipt_id: str | None = None
    manual_packet_type: str = "manual_automation_fallback"
    manual_packet_path: str | None = None
    manual_packet_relative_path: str | None = None
    manual_horizon_receipt_id: str | None = None
    manual_takeover_receipt_id: str | None = None
    shared_objective: str | None = None
    shared_scope_binding: str | None = None
    shared_required_reads: tuple[str, ...] = ()
    compared_fields: tuple[str, ...] = ()
    equivalent: bool = True
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ContinuationReadWitness:
    source_path: str
    source_relative_path: str | None
    bundle_relative_path: str
    checksum: str
    byte_count: int
    line_count: int


@dataclass(frozen=True)
class ContextPerfectContinuationReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    scope_type: str
    scope_ref: str
    packet_type: str
    packet_path: str
    packet_relative_path: str | None
    packet_checksum: str
    packet_title: str | None
    packet_created_at: str | None
    packet_status: str | None
    objective: str
    next_action: str
    takeover_receipt_id: str
    bundle_root_path: str
    bundle_root_relative_path: str | None
    bundle_packet_relative_path: str | None
    bundle_role_session_relative_path: str | None
    bundle_manifest_relative_path: str | None
    role_session_checksum: str
    required_reads: tuple[str, ...] = ()
    loaded_reads: tuple[ContinuationReadWitness, ...] = ()
    context_perfect: bool = True
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class BranchClaimReceipt(KernelRecord):
    receipt_id: str
    allocation_id: str
    created_at: str
    claim_status: BranchClaimStatus
    parent_scope_type: str
    parent_scope_ref: str
    branch_id: str
    branch_work_unit_id: str
    context_package_id: str
    branch_scope_type: str
    branch_scope_ref: str
    branch_title: str
    branch_objective: str
    selected_carrier: ScheduleCarrier
    carrier_binding_source: CarrierBindingSource
    selected_executor_id: str | None
    selected_capability_id: str | None
    allowed_writes: tuple[str, ...] = ()
    requested_reads: tuple[str, ...] = ()
    expected_output: str | None = None
    settlement_target: str | None = None
    priority: str = "P2_NORMAL"
    capability_basis: tuple[str, ...] = ()
    blocking_refs: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class BranchControlReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    parent_scope_type: str
    parent_scope_ref: str
    parent_depth: int
    branch_budget_limit: int | None
    budget_remaining: int | None
    active_claim_receipt_ids: tuple[str, ...] = ()
    active_branch_work_unit_ids: tuple[str, ...] = ()
    stale_claim_receipt_ids: tuple[str, ...] = ()
    decayed_claim_receipt_ids: tuple[str, ...] = ()
    stale_return_delta_ids: tuple[str, ...] = ()
    stale_return_branch_work_unit_ids: tuple[str, ...] = ()
    recursion_refused: bool = False
    next_action: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class BranchMergeProposal(KernelRecord):
    proposal_id: str
    created_at: str
    parent_scope_type: str
    parent_scope_ref: str
    branch_work_unit_ids: tuple[str, ...]
    delta_ids: tuple[str, ...]
    conflict_paths: tuple[str, ...] = ()
    proposed_strategy: str | None = None
    notes: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class BranchSettlementReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    parent_scope_type: str
    parent_scope_ref: str
    outcome: BranchSettlementOutcome
    considered_claim_receipt_ids: tuple[str, ...]
    branch_work_unit_ids: tuple[str, ...]
    considered_delta_ids: tuple[str, ...] = ()
    accepted_delta_ids: tuple[str, ...] = ()
    deferred_branch_work_unit_ids: tuple[str, ...] = ()
    released_claim_receipt_ids: tuple[str, ...] = ()
    merge_proposal_id: str | None = None
    conflict_paths: tuple[str, ...] = ()
    review_reasons: tuple[str, ...] = ()
    next_action: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class BranchHorizonSyncReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    parent_scope_type: str
    parent_scope_ref: str
    synchronized_horizon_id: str
    synchronized_horizon_layer: HorizonLayer
    synchronized_schedule_receipt_id: str | None = None
    selected_schedule_candidate_id: str | None = None
    selected_schedule_state: ScheduleState | None = None
    selected_schedule_commitment: ScheduleCommitment | None = None
    source_branch_control_receipt_id: str | None = None
    source_branch_settlement_receipt_id: str | None = None
    source_branch_claim_receipt_ids: tuple[str, ...] = ()
    active_branch_work_unit_ids: tuple[str, ...] = ()
    accepted_delta_ids: tuple[str, ...] = ()
    deferred_branch_work_unit_ids: tuple[str, ...] = ()
    review_reasons: tuple[str, ...] = ()
    next_action: str | None = None
    synchronization_reason: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class BranchRescheduleReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    parent_scope_type: str
    parent_scope_ref: str
    source_branch_horizon_sync_receipt_id: str
    prior_schedule_receipt_id: str | None = None
    new_schedule_receipt_id: str | None = None
    prior_candidate_id: str | None = None
    new_candidate_id: str | None = None
    prior_selected_carrier: ScheduleCarrier | None = None
    new_selected_carrier: ScheduleCarrier | None = None
    prior_selected_executor_id: str | None = None
    new_selected_executor_id: str | None = None
    prior_selected_capability_id: str | None = None
    new_selected_capability_id: str | None = None
    prior_scheduler_state: ScheduleState | None = None
    new_scheduler_state: ScheduleState | None = None
    prior_commitment: ScheduleCommitment | None = None
    new_commitment: ScheduleCommitment | None = None
    rebinding_required: bool = False
    rebinding_fields: tuple[str, ...] = ()
    reschedule_reason: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleControlReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    prior_schedule_receipt_id: str
    source_branch_reschedule_receipt_id: str | None = None
    new_schedule_receipt_id: str | None = None
    schedule_age_seconds: int | None = None
    stale_detected: bool = False
    stale_reasons: tuple[str, ...] = ()
    control_action: str = "NO_CHANGE"
    retry_required: bool = False
    reassignment_required: bool = False
    prior_candidate_id: str | None = None
    new_candidate_id: str | None = None
    prior_selected_carrier: ScheduleCarrier | None = None
    new_selected_carrier: ScheduleCarrier | None = None
    prior_selected_executor_id: str | None = None
    new_selected_executor_id: str | None = None
    prior_selected_capability_id: str | None = None
    new_selected_capability_id: str | None = None
    prior_scheduler_state: ScheduleState | None = None
    new_scheduler_state: ScheduleState | None = None
    prior_commitment: ScheduleCommitment | None = None
    new_commitment: ScheduleCommitment | None = None
    rebinding_fields: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleDispatchReconciliationReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_receipt_id: str
    source_schedule_control_receipt_id: str | None = None
    source_branch_reschedule_receipt_id: str | None = None
    work_unit_id: str | None = None
    schedule_source_kind: ScheduleSourceKind | None = None
    assignment_action: str = "NO_CHANGE"
    work_unit_status_before: WorkUnitStatus | None = None
    work_unit_status_after: WorkUnitStatus | None = None
    dispatch_packet_path: str | None = None
    selected_carrier: ScheduleCarrier | None = None
    selected_executor_id: str | None = None
    selected_capability_id: str | None = None
    capability_assignment_delta: int = 0
    capability_assignments_before: int | None = None
    capability_assignments_after: int | None = None
    retired_schedule_receipt_ids: tuple[str, ...] = ()
    retired_schedule_control_receipt_ids: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleCompletionReleaseReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_dispatch_reconciliation_receipt_id: str
    source_schedule_control_receipt_id: str | None = None
    work_unit_id: str | None = None
    terminal_commit_delta_id: str | None = None
    terminal_commit_delta_status: CommitDeltaStatus | None = None
    release_action: str = "NO_CHANGE"
    work_unit_status_before: WorkUnitStatus | None = None
    work_unit_status_after: WorkUnitStatus | None = None
    selected_capability_id: str | None = None
    capability_release_delta: int = 0
    capability_assignments_before: int | None = None
    capability_assignments_after: int | None = None
    retired_schedule_dispatch_receipt_ids: tuple[str, ...] = ()
    release_reason: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleSettlementReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_completion_release_receipt_id: str
    source_schedule_dispatch_reconciliation_receipt_id: str | None = None
    source_schedule_control_receipt_id: str | None = None
    work_unit_id: str | None = None
    settlement_action: str = "NO_CHANGE"
    terminal_commit_delta_id: str | None = None
    terminal_commit_delta_status: CommitDeltaStatus | None = None
    retired_schedule_receipt_ids: tuple[str, ...] = ()
    retired_schedule_control_receipt_ids: tuple[str, ...] = ()
    retired_schedule_dispatch_receipt_ids: tuple[str, ...] = ()
    retired_schedule_completion_release_receipt_ids: tuple[str, ...] = ()
    future_reentry_schedule_receipt_id: str | None = None
    future_reentry_candidate_id: str | None = None
    future_reentry_candidate_title: str | None = None
    future_reentry_scheduler_state: ScheduleState | None = None
    future_reentry_commitment: ScheduleCommitment | None = None
    future_reentry_reason: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleLineageArchiveReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_settlement_receipt_id: str
    active_schedule_receipt_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_scheduler_state: ScheduleState | None = None
    active_commitment: ScheduleCommitment | None = None
    lineage_action: str = "NO_CHANGE"
    lineage_summary: str | None = None
    archived_schedule_receipt_ids: tuple[str, ...] = ()
    archived_schedule_control_receipt_ids: tuple[str, ...] = ()
    archived_schedule_dispatch_receipt_ids: tuple[str, ...] = ()
    archived_schedule_completion_release_receipt_ids: tuple[str, ...] = ()
    archived_schedule_settlement_receipt_ids: tuple[str, ...] = ()
    settled_line_count: int = 0
    archived_receipt_count: int = 0
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleLineageReplayReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_lineage_archive_receipt_id: str
    source_schedule_receipt_id: str | None = None
    source_schedule_dispatch_reconciliation_receipt_id: str | None = None
    source_schedule_completion_release_receipt_id: str | None = None
    source_schedule_settlement_receipt_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_scheduler_state: ScheduleState | None = None
    active_commitment: ScheduleCommitment | None = None
    active_cycle_stage: str = "NO_ACTIVE_CYCLE"
    replay_action: str = "NO_CHANGE"
    replay_summary: str | None = None
    settled_line_count: int = 0
    archived_receipt_count: int = 0
    warnings: tuple[str, ...] = ()



@dataclass(frozen=True)
class ScheduleResumeProjectionReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_lineage_replay_receipt_id: str
    source_schedule_lineage_archive_receipt_id: str
    source_schedule_receipt_id: str | None = None
    source_schedule_dispatch_reconciliation_receipt_id: str | None = None
    source_schedule_completion_release_receipt_id: str | None = None
    source_schedule_settlement_receipt_id: str | None = None
    work_unit_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_cycle_stage: str = "NO_ACTIVE_CYCLE"
    projection_action: str = "NO_CHANGE"
    resume_ready: bool = False
    packet_type: str | None = None
    packet_path: str | None = None
    packet_relative_path: str | None = None
    packet_checksum: str | None = None
    packet_title: str | None = None
    target_executor: str | None = None
    required_reads: tuple[str, ...] = ()
    next_action: str | None = None
    expected_output: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()



@dataclass(frozen=True)
class ScheduleResumeBundleMaterializationReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_resume_projection_receipt_id: str
    source_schedule_lineage_replay_receipt_id: str
    source_schedule_lineage_archive_receipt_id: str
    source_context_perfect_continuation_receipt_id: str | None = None
    work_unit_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_cycle_stage: str = "NO_ACTIVE_CYCLE"
    materialization_action: str = "NO_CHANGE"
    resume_ready: bool = False
    packet_type: str | None = None
    packet_path: str | None = None
    packet_relative_path: str | None = None
    packet_checksum: str | None = None
    target_executor: str | None = None
    required_reads: tuple[str, ...] = ()
    next_action: str | None = None
    continuation_bundle_root_path: str | None = None
    continuation_bundle_root_relative_path: str | None = None
    continuation_bundle_packet_relative_path: str | None = None
    continuation_bundle_role_session_relative_path: str | None = None
    continuation_bundle_manifest_relative_path: str | None = None
    warnings: tuple[str, ...] = ()



@dataclass(frozen=True)
class ScheduleTakeoverEntryActivationReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_resume_bundle_materialization_receipt_id: str
    source_schedule_resume_projection_receipt_id: str
    source_schedule_lineage_replay_receipt_id: str
    source_schedule_lineage_archive_receipt_id: str
    source_context_perfect_continuation_receipt_id: str | None = None
    source_takeover_assessment_receipt_id: str | None = None
    work_unit_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_cycle_stage: str = "NO_ACTIVE_CYCLE"
    activation_action: str = "NO_CHANGE"
    activation_ready: bool = False
    target_executor: str | None = None
    selected_capability_id: str | None = None
    selected_capability_executor_id: str | None = None
    selected_capability_carrier: ScheduleCarrier | None = None
    entry_packet_type: str | None = None
    entry_packet_path: str | None = None
    entry_packet_relative_path: str | None = None
    entry_packet_checksum: str | None = None
    continuation_bundle_root_path: str | None = None
    continuation_bundle_root_relative_path: str | None = None
    continuation_bundle_manifest_relative_path: str | None = None
    continuation_bundle_role_session_relative_path: str | None = None
    activation_summary_path: str | None = None
    activation_summary_relative_path: str | None = None
    required_reads: tuple[str, ...] = ()
    next_action: str | None = None
    warnings: tuple[str, ...] = ()



@dataclass(frozen=True)
class ScheduleActivationHandoffCapsuleReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_takeover_entry_activation_receipt_id: str
    source_schedule_resume_bundle_materialization_receipt_id: str
    source_schedule_resume_projection_receipt_id: str
    source_schedule_lineage_replay_receipt_id: str
    source_schedule_lineage_archive_receipt_id: str
    source_context_perfect_continuation_receipt_id: str | None = None
    source_takeover_assessment_receipt_id: str | None = None
    work_unit_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_cycle_stage: str = "NO_ACTIVE_CYCLE"
    capsule_materialization_action: str = "NO_CHANGE"
    handoff_capsule_ready: bool = False
    target_executor: str | None = None
    selected_capability_id: str | None = None
    selected_capability_executor_id: str | None = None
    selected_capability_carrier: ScheduleCarrier | None = None
    capsule_id: str | None = None
    capsule_type: str | None = None
    capsule_callsign: str | None = None
    handoff_capsule_root_path: str | None = None
    handoff_capsule_root_relative_path: str | None = None
    handoff_capsule_json_relative_path: str | None = None
    handoff_capsule_markdown_relative_path: str | None = None
    handoff_capsule_manifest_relative_path: str | None = None
    continuation_bundle_root_relative_path: str | None = None
    activation_summary_relative_path: str | None = None
    entry_packet_relative_path: str | None = None
    required_reads: tuple[str, ...] = ()
    next_action: str | None = None
    warnings: tuple[str, ...] = ()



@dataclass(frozen=True)
class ScheduleHandoffEntryRehearsalReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_activation_handoff_capsule_receipt_id: str
    source_schedule_takeover_entry_activation_receipt_id: str
    source_schedule_resume_bundle_materialization_receipt_id: str
    source_schedule_resume_projection_receipt_id: str
    source_schedule_lineage_replay_receipt_id: str
    source_schedule_lineage_archive_receipt_id: str
    source_context_perfect_continuation_receipt_id: str | None = None
    source_takeover_assessment_receipt_id: str | None = None
    work_unit_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_cycle_stage: str = "NO_ACTIVE_CYCLE"
    entry_rehearsal_action: str = "NO_CHANGE"
    entry_rehearsal_ready: bool = False
    target_executor: str | None = None
    selected_capability_id: str | None = None
    selected_capability_executor_id: str | None = None
    selected_capability_carrier: ScheduleCarrier | None = None
    capsule_id: str | None = None
    capsule_type: str | None = None
    capsule_callsign: str | None = None
    handoff_capsule_root_relative_path: str | None = None
    handoff_capsule_json_relative_path: str | None = None
    handoff_capsule_markdown_relative_path: str | None = None
    handoff_capsule_manifest_relative_path: str | None = None
    entry_rehearsal_summary_path: str | None = None
    entry_rehearsal_summary_relative_path: str | None = None
    entry_rehearsal_manifest_relative_path: str | None = None
    continuation_bundle_root_relative_path: str | None = None
    activation_summary_relative_path: str | None = None
    entry_packet_relative_path: str | None = None
    required_reads: tuple[str, ...] = ()
    next_action: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScheduleExecutorStartPacketMaterializationReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    policy_id: str
    scope_type: str
    scope_ref: str
    source_schedule_handoff_entry_rehearsal_receipt_id: str
    source_schedule_activation_handoff_capsule_receipt_id: str
    source_schedule_takeover_entry_activation_receipt_id: str
    source_schedule_resume_bundle_materialization_receipt_id: str
    source_schedule_resume_projection_receipt_id: str
    source_schedule_lineage_replay_receipt_id: str
    source_schedule_lineage_archive_receipt_id: str
    source_context_perfect_continuation_receipt_id: str | None = None
    source_takeover_assessment_receipt_id: str | None = None
    work_unit_id: str | None = None
    active_candidate_id: str | None = None
    active_candidate_title: str | None = None
    active_cycle_stage: str = "NO_ACTIVE_CYCLE"
    executor_start_action: str = "NO_CHANGE"
    executor_start_ready: bool = False
    target_executor: str | None = None
    selected_capability_id: str | None = None
    selected_capability_executor_id: str | None = None
    selected_capability_carrier: ScheduleCarrier | None = None
    capsule_id: str | None = None
    capsule_type: str | None = None
    capsule_callsign: str | None = None
    handoff_capsule_root_relative_path: str | None = None
    handoff_capsule_json_relative_path: str | None = None
    handoff_capsule_markdown_relative_path: str | None = None
    handoff_capsule_manifest_relative_path: str | None = None
    entry_rehearsal_summary_relative_path: str | None = None
    entry_rehearsal_manifest_relative_path: str | None = None
    executor_start_packet_type: str | None = None
    executor_start_packet_path: str | None = None
    executor_start_packet_relative_path: str | None = None
    executor_start_packet_checksum: str | None = None
    executor_start_manifest_relative_path: str | None = None
    continuation_bundle_root_relative_path: str | None = None
    activation_summary_relative_path: str | None = None
    entry_packet_relative_path: str | None = None
    required_reads: tuple[str, ...] = ()
    next_action: str | None = None
    warnings: tuple[str, ...] = ()
