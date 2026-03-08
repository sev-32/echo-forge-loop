// ============================================
// APOE: Adaptive Plan Orchestration Engine
// ============================================
// Replaces the flat task loop with typed execution plans.
// Each plan is a DAG of steps, each assigned a role and gated
// by quality/safety/policy checks.

import { supabase } from '@/integrations/supabase/client';

// ============================================
// Types
// ============================================

export type PlanStepType = 'retrieve' | 'reason' | 'build' | 'verify' | 'critique' | 'plan' | 'witness' | 'operate';
export type APOERole = 'planner' | 'retriever' | 'reasoner' | 'verifier' | 'builder' | 'critic' | 'operator' | 'witness';
export type GateType = 'quality' | 'safety' | 'policy';
export type GateResult = 'pass' | 'fail' | 'warn' | 'abstain';
export type PlanStatus = 'draft' | 'active' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped' | 'blocked';

export interface ExecutionPlan {
  id: string;
  run_id: string;
  plan_acl: Record<string, unknown>;
  status: PlanStatus;
  budget_config: Record<string, unknown>;
  budget_used: Record<string, unknown>;
  gates_config: Record<string, unknown>;
  goal: string;
  complexity: string;
  reasoning: string;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export interface PlanStep {
  id: string;
  plan_id: string;
  step_index: number;
  step_type: PlanStepType;
  assigned_role: APOERole;
  title: string;
  description: string;
  budget: Record<string, unknown>;
  budget_used: Record<string, unknown>;
  gate_before: GateType | null;
  gate_config: Record<string, unknown>;
  gate_result: GateResult | null;
  gate_details: Record<string, unknown> | null;
  input_refs: string[];
  output_refs: string[];
  witness_id: string | null;
  depends_on: string[];
  status: StepStatus;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Role descriptions for system prompts
export const ROLE_DESCRIPTIONS: Record<APOERole, { name: string; purpose: string; capabilities: string[] }> = {
  planner: {
    name: 'Planner',
    purpose: 'Decomposes goals into typed execution DAGs with role assignments',
    capabilities: ['goal_decomposition', 'dependency_analysis', 'complexity_estimation', 'role_assignment'],
  },
  retriever: {
    name: 'Retriever',
    purpose: 'HHNI-powered context fetching from CMC atoms and external sources',
    capabilities: ['bitemporal_query', 'semantic_search', 'context_ranking', 'provenance_tracking'],
  },
  reasoner: {
    name: 'Reasoner',
    purpose: 'Core analysis, synthesis, and logical deduction',
    capabilities: ['logical_inference', 'pattern_recognition', 'hypothesis_generation', 'evidence_weighing'],
  },
  verifier: {
    name: 'Verifier',
    purpose: 'Acceptance criteria checking and confidence assessment',
    capabilities: ['criteria_evaluation', 'consistency_checking', 'confidence_scoring', 'contradiction_detection'],
  },
  builder: {
    name: 'Builder',
    purpose: 'Content generation with depth calibration',
    capabilities: ['content_generation', 'depth_calibration', 'section_planning', 'continuation'],
  },
  critic: {
    name: 'Critic',
    purpose: 'Adversarial review of outputs — finds weaknesses',
    capabilities: ['adversarial_review', 'weakness_identification', 'improvement_suggestion', 'bias_detection'],
  },
  operator: {
    name: 'Operator',
    purpose: 'Infrastructure and state management',
    capabilities: ['state_management', 'checkpoint_creation', 'budget_tracking', 'error_recovery'],
  },
  witness: {
    name: 'Witness',
    purpose: 'VIF envelope creation and provenance logging',
    capabilities: ['envelope_creation', 'hash_computation', 'confidence_assessment', 'ece_tracking'],
  },
};

// ============================================
// APOE Service
// ============================================

export class AdaptivePlanOrchestrationEngine {

  // --- Plan Creation ---

  async createPlan(params: {
    run_id: string;
    goal: string;
    complexity?: string;
    reasoning?: string;
    plan_acl?: Record<string, unknown>;
    budget_config?: Record<string, unknown>;
    gates_config?: Record<string, unknown>;
    steps?: Omit<PlanStep, 'id' | 'plan_id' | 'created_at'>[];
  }): Promise<{ plan: ExecutionPlan; steps: PlanStep[] } | null> {
    // Create plan
    const { data: planData, error: planError } = await supabase
      .from('execution_plans')
      .insert({
        run_id: params.run_id,
        goal: params.goal,
        complexity: params.complexity ?? 'moderate',
        reasoning: params.reasoning ?? '',
        plan_acl: params.plan_acl ?? {},
        budget_config: params.budget_config ?? { max_tokens: 100000, max_tool_calls: 50, max_wall_time_seconds: 600 },
        budget_used: {},
        gates_config: params.gates_config ?? { quality_threshold: 0.7, safety_enabled: true },
        total_steps: params.steps?.length ?? 0,
        status: 'draft',
      })
      .select()
      .single();

    if (planError) { console.error('APOE: plan creation error:', planError); return null; }
    const plan = planData as unknown as ExecutionPlan;

    // Create steps
    const steps: PlanStep[] = [];
    if (params.steps && params.steps.length > 0) {
      const stepInserts = params.steps.map((s, i) => ({
        plan_id: plan.id,
        step_index: s.step_index ?? i,
        step_type: s.step_type,
        assigned_role: s.assigned_role,
        title: s.title,
        description: s.description,
        budget: s.budget ?? {},
        budget_used: {},
        gate_before: s.gate_before ?? null,
        gate_config: s.gate_config ?? {},
        depends_on: s.depends_on ?? [],
        input_refs: s.input_refs ?? [],
        output_refs: [],
        status: 'pending' as StepStatus,
      }));

      const { data: stepsData, error: stepsError } = await supabase
        .from('plan_steps')
        .insert(stepInserts)
        .select();

      if (stepsError) { console.error('APOE: steps creation error:', stepsError); }
      else { steps.push(...(stepsData as unknown as PlanStep[])); }
    }

    return { plan, steps };
  }

  // --- Plan Status ---

  async activatePlan(planId: string): Promise<boolean> {
    const { error } = await supabase
      .from('execution_plans')
      .update({ status: 'active' })
      .eq('id', planId);
    return !error;
  }

  async completePlan(planId: string): Promise<boolean> {
    const { error } = await supabase
      .from('execution_plans')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', planId);
    return !error;
  }

  async failPlan(planId: string): Promise<boolean> {
    const { error } = await supabase
      .from('execution_plans')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', planId);
    return !error;
  }

  // --- Step Management ---

  async updateStepStatus(stepId: string, status: StepStatus, extras?: {
    gate_result?: GateResult;
    gate_details?: Record<string, unknown>;
    result?: Record<string, unknown>;
    witness_id?: string;
    output_refs?: string[];
    error?: string;
    budget_used?: Record<string, unknown>;
  }): Promise<boolean> {
    const update: Record<string, unknown> = { status };
    if (status === 'active') update.started_at = new Date().toISOString();
    if (status === 'completed' || status === 'failed') update.completed_at = new Date().toISOString();
    if (extras?.gate_result) update.gate_result = extras.gate_result;
    if (extras?.gate_details) update.gate_details = extras.gate_details;
    if (extras?.result) update.result = extras.result;
    if (extras?.witness_id) update.witness_id = extras.witness_id;
    if (extras?.output_refs) update.output_refs = extras.output_refs;
    if (extras?.error) update.error = extras.error;
    if (extras?.budget_used) update.budget_used = extras.budget_used;

    const { error } = await supabase
      .from('plan_steps')
      .update(update)
      .eq('id', stepId);

    return !error;
  }

  async getNextStep(planId: string): Promise<PlanStep | null> {
    // Get all steps for this plan
    const { data, error } = await supabase
      .from('plan_steps')
      .select('*')
      .eq('plan_id', planId)
      .order('step_index', { ascending: true });

    if (error || !data) return null;
    const steps = data as unknown as PlanStep[];

    // Find completed step IDs
    const completedIds = new Set(steps.filter(s => s.status === 'completed').map(s => s.id));

    // Find first pending step whose dependencies are all completed
    for (const step of steps) {
      if (step.status !== 'pending') continue;
      const depsComplete = step.depends_on.every(depId => completedIds.has(depId));
      if (depsComplete) return step;
    }

    return null;
  }

  // --- Queries ---

  async getPlansByRun(runId: string): Promise<ExecutionPlan[]> {
    const { data, error } = await supabase
      .from('execution_plans')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: false });

    if (error) { console.error('APOE: fetch plans error:', error); return []; }
    return (data ?? []) as unknown as ExecutionPlan[];
  }

  async getStepsByPlan(planId: string): Promise<PlanStep[]> {
    const { data, error } = await supabase
      .from('plan_steps')
      .select('*')
      .eq('plan_id', planId)
      .order('step_index', { ascending: true });

    if (error) { console.error('APOE: fetch steps error:', error); return []; }
    return (data ?? []) as unknown as PlanStep[];
  }

  async getRecentPlans(limit = 20): Promise<ExecutionPlan[]> {
    const { data, error } = await supabase
      .from('execution_plans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) { console.error('APOE: recent plans error:', error); return []; }
    return (data ?? []) as unknown as ExecutionPlan[];
  }

  // --- Statistics ---

  async getStats(): Promise<{
    totalPlans: number;
    byStatus: Record<string, number>;
    totalSteps: number;
    stepsByRole: Record<string, number>;
    gateResults: Record<string, number>;
  }> {
    const [plansRes, stepsRes] = await Promise.all([
      supabase.from('execution_plans').select('status'),
      supabase.from('plan_steps').select('assigned_role, gate_result'),
    ]);

    const plans = plansRes.data ?? [];
    const steps = stepsRes.data ?? [];

    const byStatus: Record<string, number> = {};
    for (const p of plans) {
      const s = (p as any).status;
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    const stepsByRole: Record<string, number> = {};
    const gateResults: Record<string, number> = {};
    for (const s of steps) {
      const st = (s as any);
      stepsByRole[st.assigned_role] = (stepsByRole[st.assigned_role] || 0) + 1;
      if (st.gate_result) gateResults[st.gate_result] = (gateResults[st.gate_result] || 0) + 1;
    }

    return { totalPlans: plans.length, byStatus, totalSteps: steps.length, stepsByRole, gateResults };
  }
}

// Singleton
export const apoe = new AdaptivePlanOrchestrationEngine();
