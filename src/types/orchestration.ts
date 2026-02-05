// ============================================
// AIM-OS Orchestration System - Core Types
// ============================================

// Task statuses
export type TaskStatus = 'queued' | 'active' | 'blocked' | 'done' | 'failed' | 'canceled';

// Autonomy modes
export type AutonomyMode = 'manual' | 'supervised' | 'autonomous';

// Event types for the event log
export type EventType =
  | 'RUN_STARTED'
  | 'RUN_STOPPED'
  | 'PLAN_CREATED'
  | 'ACTION_EXECUTED'
  | 'TOOL_CALLED'
  | 'TOOL_RESULT'
  | 'VERIFICATION_RUN'
  | 'VERIFICATION_PASSED'
  | 'VERIFICATION_FAILED'
  | 'AUDIT_NOTE'
  | 'CHECKPOINT_CREATED'
  | 'QUEUE_MUTATION'
  | 'SNAPSHOT_CREATED'
  | 'BUDGET_TICK'
  | 'BUDGET_EXHAUSTED'
  | 'ERROR_RAISED'
  | 'CONTEXT_UPDATED'
  | 'STOP_REQUESTED';

// Verification types
export type VerificationType = 'schema' | 'lint' | 'test' | 'contains' | 'not_contains' | 'word_limit' | 'custom';

// ============================================
// Core Entity Interfaces
// ============================================

export interface AcceptanceCriterion {
  id: string;
  type: VerificationType;
  description: string;
  config: Record<string, unknown>;
  required: boolean;
}

export interface Task {
  task_id: string;
  title: string;
  prompt: string;
  acceptance_criteria: AcceptanceCriterion[];
  dependencies: string[]; // task_ids
  priority: number; // 0-100
  status: TaskStatus;
  context_refs: string[]; // pointers to artifacts/events/memory
  history: TaskHistoryEntry[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface TaskHistoryEntry {
  timestamp: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
}

// ============================================
// Event Sourcing Types
// ============================================

export interface Event {
  event_id: string;
  run_id: string;
  timestamp: string;
  type: EventType;
  payload: Record<string, unknown>;
  hash_prev: string;
  hash_self: string;
}

export interface Snapshot {
  snapshot_id: string;
  run_id: string;
  timestamp: string;
  queue_state: Task[];
  dag_edges: DAGEdge[];
  pinned_context: ContextItem[];
  working_context: ContextItem[];
  artifacts_index: ArtifactRef[];
  budgets: BudgetState;
  run_metadata: RunMetadata;
  hash: string;
}

export interface DAGEdge {
  from_task_id: string;
  to_task_id: string;
  type: 'depends_on' | 'blocks';
}

// ============================================
// Context Management Types
// ============================================

export type ContextTier = 'pinned' | 'working' | 'long_term';

export interface ContextItem {
  id: string;
  tier: ContextTier;
  content: string;
  source: string;
  created_at: string;
  last_accessed: string;
  priority: number;
  tokens_estimate: number;
  embedding?: number[];
}

export interface ArtifactRef {
  artifact_id: string;
  name: string;
  type: string;
  path: string;
  version: number;
  created_at: string;
  hash: string;
}

// ============================================
// Budget and Governance Types
// ============================================

export interface BudgetConfig {
  max_wall_time_seconds: number;
  max_output_tokens: number;
  max_tool_calls: number;
  max_iterations: number;
  max_risk_budget?: number;
  checkpoint_interval: number; // actions between checkpoints
}

export interface BudgetState {
  config: BudgetConfig;
  used: {
    wall_time_seconds: number;
    output_tokens: number;
    tool_calls: number;
    iterations: number;
    risk_budget: number;
  };
  remaining: {
    wall_time_seconds: number;
    output_tokens: number;
    tool_calls: number;
    iterations: number;
    risk_budget: number;
  };
  status: 'ok' | 'warning' | 'critical' | 'exhausted';
}

export interface RiskPolicy {
  allow_destructive_ops: boolean;
  allow_external_calls: boolean;
  allow_artifact_overwrite: boolean;
  require_approval_for: string[]; // action types requiring approval
  secrets_redaction: boolean;
}

export interface RunMetadata {
  run_id: string;
  project_id: string;
  started_at: string;
  stopped_at?: string;
  autonomy_mode: AutonomyMode;
  risk_policy: RiskPolicy;
  stop_requested: boolean;
  stop_reason?: string;
}

// ============================================
// Verification and Audit Types
// ============================================

export interface VerificationResult {
  criterion_id: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  category: 'acceptance' | 'contradiction' | 'follow_up' | 'process';
  finding: string;
  severity: 'info' | 'warning' | 'error';
  task_id?: string;
  resolved: boolean;
}

// ============================================
// Test Harness Types
// ============================================

export interface TestSpec {
  test_id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  initial_context: {
    text: string;
    files?: Record<string, string>;
    pinned_constraints?: string[];
  };
  initial_queue: Partial<Task>[];
  queued_injections?: QueuedInjection[];
  budgets: BudgetConfig;
  must_do: string[];
  must_not_do: string[];
  acceptance_criteria: string[];
  scoring_rubric: ScoringRubricItem[];
  expected_artifacts?: Record<string, string>;
}

export interface QueuedInjection {
  trigger: {
    type: 'action_count' | 'time' | 'event';
    value: number | string;
  };
  action: 'add_task' | 'reprioritize' | 'stop' | 'inject_context';
  payload: unknown;
}

export interface ScoringRubricItem {
  criterion: string;
  weight: number;
  scoring: 'binary' | 'scale';
  max_score?: number;
}

export interface TestResult {
  test_id: string;
  passed: boolean;
  score: number;
  max_score: number;
  breakdown: {
    criterion: string;
    score: number;
    max_score: number;
    notes: string;
  }[];
  run_id: string;
  duration_ms: number;
  events_count: number;
  artifacts: string[];
  errors: string[];
}

// ============================================
// Orchestration Kernel Types
// ============================================

export interface KernelState {
  run_id: string;
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  current_task_id?: string;
  iteration: number;
  last_checkpoint_at: number;
  events: Event[];
  snapshot: Snapshot | null;
}

export interface KernelAction {
  type: 'execute_task' | 'verify' | 'checkpoint' | 'stop' | 'queue_mutation';
  payload: unknown;
}

export interface ExecutionPlan {
  task_id: string;
  steps: PlanStep[];
  estimated_tokens: number;
  estimated_tool_calls: number;
}

export interface PlanStep {
  id: string;
  action: string;
  tool?: string;
  args?: Record<string, unknown>;
  expected_output?: string;
}
