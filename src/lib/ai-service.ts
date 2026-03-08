// ============================================
// AI Service Layer - Calls edge functions
// ============================================

import { supabase } from '@/integrations/supabase/client';

export interface AIStepResult {
  plan: {
    steps: Array<{ action: string; reasoning: string; expected_output?: string }>;
    estimated_complexity?: string;
  };
  result: {
    output: string;
    artifacts?: Array<{ name: string; content: string; type?: string }>;
    tokens_used?: number;
  };
  discoveries?: Array<{
    type: 'insight' | 'contradiction' | 'question' | 'process_improvement';
    content: string;
    priority?: string;
  }>;
  new_tasks?: Array<{ title: string; prompt: string; priority?: number }>;
  self_assessment: {
    confidence: number;
    criteria_met?: string[];
    criteria_missed?: string[];
    improvement_notes?: string;
  };
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}

export interface AIVerifyResult {
  passed: boolean;
  overall_score: number;
  criteria_results: Array<{
    criterion: string;
    passed: boolean;
    score: number;
    reasoning: string;
    fix_suggestion?: string;
  }>;
  contradictions?: Array<{ description: string; severity: string }>;
  hallucination_flags?: string[];
  summary: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}

export interface AIJournalResult {
  journal_entries: Array<{
    entry_type: string;
    title: string;
    content: string;
    tags?: string[];
    priority?: string;
  }>;
  knowledge_updates?: {
    new_nodes?: Array<{ label: string; node_type: string }>;
    new_edges?: Array<{ source_label: string; target_label: string; relation: string; weight?: number }>;
  };
  process_improvements?: Array<{
    area: string;
    current_behavior?: string;
    suggested_improvement: string;
    expected_impact?: string;
  }>;
  context_bank_updates?: Array<{ bank_name: string; content: string; priority?: number }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}

export interface AITestGenResult {
  tests: Array<{
    test_id: string;
    category: string;
    difficulty: string;
    title: string;
    description: string;
    initial_context?: string;
    initial_queue: Array<{
      title: string;
      prompt: string;
      priority?: number;
      acceptance_criteria?: string[];
    }>;
    budgets?: {
      max_tokens?: number;
      max_iterations?: number;
      max_tool_calls?: number;
      max_time_ms?: number;
    };
    must_do: string[];
    must_not_do?: string[];
    scoring_rubric: Array<{ criterion: string; weight: number; description?: string }>;
    rationale: string;
  }>;
  analysis?: {
    weaknesses_targeted?: string[];
    coverage_gaps?: string[];
    expected_difficulty_curve?: string;
  };
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}

// Call ai-step edge function
export async function callAIStep(
  task: { title: string; prompt: string; acceptance_criteria?: unknown[]; priority?: number; dependency_results?: unknown[] },
  context: { pinned?: Array<{ content: string }>; working?: Array<{ content: string }>; process_notes?: string[] },
  mode: string = 'autonomous'
): Promise<AIStepResult> {
  const { data, error } = await supabase.functions.invoke('ai-step', {
    body: { task, context, mode },
  });
  if (error) throw new Error(`ai-step failed: ${error.message}`);
  if (data?.error) throw new Error(`ai-step error: ${data.error}`);
  return data;
}

// Call ai-verify edge function
export async function callAIVerify(
  taskOutput: unknown,
  acceptanceCriteria: unknown[],
  taskContext?: unknown,
  mustDo?: string[],
  mustNotDo?: string[]
): Promise<AIVerifyResult> {
  const { data, error } = await supabase.functions.invoke('ai-verify', {
    body: { task_output: taskOutput, acceptance_criteria: acceptanceCriteria, task_context: taskContext, must_do: mustDo, must_not_do: mustNotDo },
  });
  if (error) throw new Error(`ai-verify failed: ${error.message}`);
  if (data?.error) throw new Error(`ai-verify error: ${data.error}`);
  return data;
}

// Call ai-journal edge function
export async function callAIJournal(
  recentEvents: unknown[],
  taskResult?: unknown,
  journalHistory?: unknown[],
  knowledgeGraph?: { nodes: unknown[]; edges: unknown[] },
  reflectionType: string = 'post_task'
): Promise<AIJournalResult> {
  const { data, error } = await supabase.functions.invoke('ai-journal', {
    body: { recent_events: recentEvents, task_result: taskResult, journal_history: journalHistory, knowledge_graph: knowledgeGraph, reflection_type: reflectionType },
  });
  if (error) throw new Error(`ai-journal failed: ${error.message}`);
  if (data?.error) throw new Error(`ai-journal error: ${data.error}`);
  return data;
}

// Call ai-test-gen edge function
export async function callAITestGen(
  pastResults: unknown[],
  knowledgeGraph?: { nodes: unknown[]; edges: unknown[] },
  currentSpecs?: Array<{ test_id: string }>,
  focusAreas?: string[]
): Promise<AITestGenResult> {
  const { data, error } = await supabase.functions.invoke('ai-test-gen', {
    body: { past_results: pastResults, knowledge_graph: knowledgeGraph, current_specs: currentSpecs, focus_areas: focusAreas },
  });
  if (error) throw new Error(`ai-test-gen failed: ${error.message}`);
  if (data?.error) throw new Error(`ai-test-gen error: ${data.error}`);
  return data;
}
