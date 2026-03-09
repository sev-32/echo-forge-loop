// ─── Chat Types ──────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  runData?: RunData;
}

export interface TaskPlan {
  id: string;
  index: number;
  title: string;
  status: 'queued' | 'running' | 'verifying' | 'done' | 'failed' | 'retrying';
  priority: number;
  criteriaCount: number;
  detailLevel: 'concise' | 'standard' | 'comprehensive' | 'exhaustive';
  expectedSections: number;
  output: string;
  reasoning?: string;
  depthGuidance?: string;
  acceptanceCriteria?: string[];
  verification?: { passed: boolean; score: number; summary: string; criteria_results?: Array<{ criterion: string; met: boolean; reasoning: string }> };
  retryDiagnosis?: string;
  retried?: boolean;
}

export interface ProcessEvaluation {
  planning_score: number;
  complexity_calibration_accurate: boolean;
  tasks_well_scoped: boolean;
  detail_levels_appropriate: boolean;
  planning_notes: string;
}

export interface StrategyAssessment {
  effectiveness_score: number;
  what_worked: string[];
  what_failed: string[];
  would_change: string;
}

export interface ProcessRule {
  rule_text: string;
  category: string;
  confidence: number;
  id?: string;
}

export interface ReflectionData {
  summary: string;
  internal_monologue?: string;
  lessons: string[];
  knowledge_nodes: Array<{ label: string; node_type: string }>;
  knowledge_edges?: Array<{ source_label: string; target_label: string; relation: string }>;
  improvements?: string[];
  process_evaluation?: ProcessEvaluation;
  strategy_assessment?: StrategyAssessment;
  detected_patterns?: string[];
  new_process_rules?: ProcessRule[];
  self_test_proposals?: string[];
}

export interface MemoryLoaded {
  reflections: number;
  rules: number;
  knowledge: number;
}

export interface MemoryDetail {
  reflections: Array<{ content: string; tags: string[]; planning_score?: number; strategy_score?: number }>;
  rules: Array<{ id: string; text: string; category: string; confidence: number; times_applied: number; times_helped: number }>;
  knowledge: Array<{ label: string; type: string }>;
}

export interface ThoughtEntry {
  id: string;
  timestamp: number;
  phase: 'memory' | 'planning' | 'execute' | 'verify' | 'retry' | 'audit' | 'synthesize' | 'reflect' | 'evolve' | 'complete';
  content: string;
}

export interface AuditDecision {
  verdict: string;
  confidence: number;
  reasoning: string;
  style_analysis?: { tone: string; detail_preference: string; patterns_observed: string[] };
  next_actions?: Array<{ action: string; target?: string; reason: string }>;
  synthesis_plan?: { structure: string; key_points: string[]; style_notes: string };
  additional_tasks_count?: number;
  loop?: number;
}

export interface RunData {
  runId: string;
  goal: string;
  approach: string;
  planningReasoning: string;
  openQuestions: string[];
  overallComplexity: 'simple' | 'moderate' | 'complex' | 'research-grade';
  tasks: TaskPlan[];
  thoughts: ThoughtEntry[];
  reflection: ReflectionData | null;
  knowledgeUpdate: { nodes_added: number; edges_added: number } | null;
  status: 'planning' | 'executing' | 'auditing' | 'synthesizing' | 'reflecting' | 'complete' | 'error';
  totalTokens: number;
  memoryLoaded?: MemoryLoaded;
  memoryDetail?: MemoryDetail;
  lessonsIncorporated?: string[];
  generatedRules?: ProcessRule[];
  activePhase: ThoughtEntry['phase'];
  auditDecision?: AuditDecision;
  synthesizedResponse?: string;
  synthesisFollowUps?: string[];
  synthesisCaveats?: string[];
  auditLoops?: number;
}

export interface SystemEvent {
  id: string;
  timestamp: number;
  type: 'plan' | 'task_start' | 'task_done' | 'task_fail' | 'verify' | 'reflect' | 'knowledge' | 'complete' | 'error' | 'retry';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  last_run_id?: string;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}
