/**
 * Persistence adapter — abstract storage so the app can use Supabase or local (IndexedDB).
 * Selected at runtime via VITE_USE_LOCAL_PERSISTENCE (default: Supabase).
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { LocalAdapter } from './persistence-adapter-local';

// ---- Interface: what the app needs from persistence ----

export interface PersistenceAdapter {
  // Events
  persistEvent(
    runId: string,
    eventType: string,
    payload: Record<string, unknown>,
    hashPrev?: string,
    hashSelf?: string
  ): Promise<Record<string, unknown> | null>;
  fetchEvents(runId: string): Promise<Record<string, unknown>[]>;
  fetchRecentEvents(limit?: number): Promise<Record<string, unknown>[]>;

  // Snapshots
  persistSnapshot(
    runId: string,
    reason: string,
    state: Record<string, unknown>,
    eventCount: number
  ): Promise<Record<string, unknown> | null>;
  fetchSnapshots(runId: string): Promise<Record<string, unknown>[]>;

  // Tasks
  persistTask(task: {
    run_id: string;
    title: string;
    prompt: string;
    status?: string;
    priority?: number;
    acceptance_criteria?: unknown[];
    dependencies?: string[];
  }): Promise<Record<string, unknown> | null>;
  updateTask(taskId: string, updates: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  fetchTasks(runId: string): Promise<Record<string, unknown>[]>;
  fetchAllTasks(): Promise<Record<string, unknown>[]>;

  // Journal
  persistJournalEntry(entry: {
    entry_type: string;
    title: string;
    content: string;
    tags?: string[];
    priority?: string;
    run_id?: string;
    task_id?: string;
    parent_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null>;
  fetchJournalEntries(options?: {
    run_id?: string;
    entry_type?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]>;

  // Context banks
  persistContextBank(bank: {
    name: string;
    description: string;
    max_tokens?: number;
    auto_prune?: boolean;
  }): Promise<Record<string, unknown> | null>;
  fetchContextBanks(): Promise<Record<string, unknown>[]>;
  persistContextBankEntry(entry: {
    bank_id: string;
    content: string;
    source: string;
    priority?: number;
    tokens_estimate?: number;
  }): Promise<Record<string, unknown> | null>;
  fetchContextBankEntries(bankId: string): Promise<Record<string, unknown>[]>;

  // Knowledge graph
  persistKnowledgeNode(node: {
    label: string;
    node_type: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null>;
  persistKnowledgeEdge(edge: {
    source_id: string;
    target_id: string;
    relation: string;
    weight?: number;
  }): Promise<Record<string, unknown> | null>;
  fetchKnowledgeGraph(): Promise<{ nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }>;

  // Test runs
  persistTestRun(run: {
    test_id: string;
    suite_id?: string;
    status: string;
    score?: number;
    max_score?: number;
    duration_ms?: number;
    score_breakdown?: Record<string, unknown>;
    events_snapshot?: unknown[];
    budget_snapshot?: Record<string, unknown>;
    spec_snapshot?: Record<string, unknown>;
    errors?: string[];
  }): Promise<Record<string, unknown> | null>;
  updateTestRun(runId: string, updates: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  fetchTestRuns(options?: {
    test_id?: string;
    suite_id?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]>;

  // Run traces (for Run History and live metrics)
  persistRunTrace(run: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  fetchRunTraces(limit?: number): Promise<Record<string, unknown>[]>;

  // Conversations (for use-conversations and chat UI)
  listConversations(limit?: number): Promise<{ id: string; title: string; total_tokens?: number; created_at: string; updated_at: string; last_run_id?: string | null }[]>;
  getConversation(id: string): Promise<Record<string, unknown> | null>;
  createConversation(title: string, messages: unknown[]): Promise<{ id: string } | null>;
  updateConversation(
    id: string,
    updates: { messages?: unknown[]; updated_at?: string; total_tokens?: number }
  ): Promise<void>;
  deleteConversation(id: string): Promise<void>;
}

// ---- Supabase implementation ----

class SupabaseAdapter implements PersistenceAdapter {
  async persistEvent(
    runId: string,
    eventType: string,
    payload: Record<string, unknown>,
    hashPrev?: string,
    hashSelf?: string
  ) {
    const { data, error } = await supabase
      .from('events')
      .insert([
        {
          run_id: runId,
          event_type: eventType,
          payload: payload as Json,
          hash_prev: hashPrev ?? null,
          hash_self: hashSelf ?? null,
        },
      ])
      .select()
      .single();
    if (error) console.error('persistEvent error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchEvents(runId: string) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });
    if (error) console.error('fetchEvents error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async fetchRecentEvents(limit = 50) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) console.error('fetchRecentEvents error:', error);
    return ((data || []).reverse()) as Record<string, unknown>[];
  }

  async persistSnapshot(
    runId: string,
    reason: string,
    state: Record<string, unknown>,
    eventCount: number
  ) {
    const { data, error } = await supabase
      .from('snapshots')
      .insert([{ run_id: runId, reason, state: state as Json, event_count: eventCount }])
      .select()
      .single();
    if (error) console.error('persistSnapshot error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchSnapshots(runId: string) {
    const { data, error } = await supabase
      .from('snapshots')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: false });
    if (error) console.error('fetchSnapshots error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async persistTask(task: {
    run_id: string;
    title: string;
    prompt: string;
    status?: string;
    priority?: number;
    acceptance_criteria?: unknown[];
    dependencies?: string[];
  }) {
    const { data, error } = await supabase
      .from('tasks')
      .insert([
        {
          run_id: task.run_id,
          title: task.title,
          prompt: task.prompt,
          status: task.status || 'queued',
          priority: task.priority ?? 50,
          acceptance_criteria: (task.acceptance_criteria || []) as Json,
          dependencies: task.dependencies || [],
        },
      ])
      .select()
      .single();
    if (error) console.error('persistTask error:', error);
    return data as Record<string, unknown> | null;
  }

  async updateTask(taskId: string, updates: Record<string, unknown>) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (['acceptance_criteria', 'history', 'result'].includes(k)) clean[k] = v as Json;
      else clean[k] = v;
    }
    const { data, error } = await supabase.from('tasks').update(clean).eq('id', taskId).select().single();
    if (error) console.error('updateTask error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchTasks(runId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('run_id', runId)
      .order('priority', { ascending: false });
    if (error) console.error('fetchTasks error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async fetchAllTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) console.error('fetchAllTasks error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async persistJournalEntry(entry: {
    entry_type: string;
    title: string;
    content: string;
    tags?: string[];
    priority?: string;
    run_id?: string;
    task_id?: string;
    parent_id?: string;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await supabase
      .from('journal_entries')
      .insert([
        {
          entry_type: entry.entry_type,
          title: entry.title,
          content: entry.content,
          tags: entry.tags || [],
          priority: entry.priority || 'medium',
          run_id: entry.run_id || null,
          task_id: entry.task_id || null,
          parent_id: entry.parent_id || null,
          metadata: (entry.metadata || {}) as Json,
        },
      ])
      .select()
      .single();
    if (error) console.error('persistJournalEntry error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchJournalEntries(options?: { run_id?: string; entry_type?: string; limit?: number }) {
    let query = supabase
      .from('journal_entries')
      .select('*')
      .order('created_at', { ascending: false });
    if (options?.run_id) query = query.eq('run_id', options.run_id);
    if (options?.entry_type) query = query.eq('entry_type', options.entry_type);
    query = query.limit(options?.limit || 100);
    const { data, error } = await query;
    if (error) console.error('fetchJournalEntries error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async persistContextBank(bank: {
    name: string;
    description: string;
    max_tokens?: number;
    auto_prune?: boolean;
  }) {
    const { data, error } = await supabase
      .from('context_banks')
      .insert([
        {
          name: bank.name,
          description: bank.description,
          max_tokens: bank.max_tokens ?? 50000,
          auto_prune: bank.auto_prune ?? true,
        },
      ])
      .select()
      .single();
    if (error) console.error('persistContextBank error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchContextBanks() {
    const { data, error } = await supabase
      .from('context_banks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error('fetchContextBanks error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async persistContextBankEntry(entry: {
    bank_id: string;
    content: string;
    source: string;
    priority?: number;
    tokens_estimate?: number;
  }) {
    const { data, error } = await supabase
      .from('context_bank_entries')
      .insert([
        {
          bank_id: entry.bank_id,
          content: entry.content,
          source: entry.source,
          priority: entry.priority ?? 50,
          tokens_estimate: entry.tokens_estimate ?? Math.ceil(entry.content.length / 4),
        },
      ])
      .select()
      .single();
    if (error) console.error('persistContextBankEntry error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchContextBankEntries(bankId: string) {
    const { data, error } = await supabase
      .from('context_bank_entries')
      .select('*')
      .eq('bank_id', bankId)
      .order('priority', { ascending: false });
    if (error) console.error('fetchContextBankEntries error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async persistKnowledgeNode(node: {
    label: string;
    node_type: string;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await supabase
      .from('knowledge_nodes')
      .insert([{ label: node.label, node_type: node.node_type, metadata: (node.metadata || {}) as Json }])
      .select()
      .single();
    if (error) console.error('persistKnowledgeNode error:', error);
    return data as Record<string, unknown> | null;
  }

  async persistKnowledgeEdge(edge: {
    source_id: string;
    target_id: string;
    relation: string;
    weight?: number;
  }) {
    const { data, error } = await supabase
      .from('knowledge_edges')
      .insert([
        {
          source_id: edge.source_id,
          target_id: edge.target_id,
          relation: edge.relation,
          weight: edge.weight ?? 1.0,
        },
      ])
      .select()
      .single();
    if (error) console.error('persistKnowledgeEdge error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchKnowledgeGraph() {
    const [nodesRes, edgesRes] = await Promise.all([
      supabase
        .from('knowledge_nodes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('knowledge_edges')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    return {
      nodes: (nodesRes.data || []) as Record<string, unknown>[],
      edges: (edgesRes.data || []) as Record<string, unknown>[],
    };
  }

  async persistTestRun(run: {
    test_id: string;
    suite_id?: string;
    status: string;
    score?: number;
    max_score?: number;
    duration_ms?: number;
    score_breakdown?: Record<string, unknown>;
    events_snapshot?: unknown[];
    budget_snapshot?: Record<string, unknown>;
    spec_snapshot?: Record<string, unknown>;
    errors?: string[];
  }) {
    const { data, error } = await supabase
      .from('test_runs')
      .insert([
        {
          test_id: run.test_id,
          suite_id: run.suite_id ?? null,
          status: run.status,
          score: run.score,
          max_score: run.max_score,
          duration_ms: run.duration_ms,
          score_breakdown: (run.score_breakdown || {}) as Json,
          events_snapshot: (run.events_snapshot || []) as Json,
          budget_snapshot: (run.budget_snapshot || {}) as Json,
          spec_snapshot: (run.spec_snapshot || {}) as Json,
          errors: run.errors || [],
        },
      ])
      .select()
      .single();
    if (error) console.error('persistTestRun error:', error);
    return data as Record<string, unknown> | null;
  }

  async updateTestRun(runId: string, updates: Record<string, unknown>) {
    const clean: Record<string, unknown> = { completed_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(updates)) {
      if (['score_breakdown', 'events_snapshot', 'budget_snapshot', 'spec_snapshot', 'comparison', 'notes'].includes(k)) {
        clean[k] = v as Json;
      } else {
        clean[k] = v;
      }
    }
    const { data, error } = await supabase
      .from('test_runs')
      .update(clean)
      .eq('id', runId)
      .select()
      .single();
    if (error) console.error('updateTestRun error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchTestRuns(options?: { test_id?: string; suite_id?: string; limit?: number }) {
    let query = supabase
      .from('test_runs')
      .select('*')
      .order('created_at', { ascending: false });
    if (options?.test_id) query = query.eq('test_id', options.test_id);
    if (options?.suite_id) query = query.eq('suite_id', options.suite_id);
    query = query.limit(options?.limit || 50);
    const { data, error } = await query;
    if (error) console.error('fetchTestRuns error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async persistRunTrace(run: Record<string, unknown>) {
    const row = {
      run_id: run.run_id,
      goal: run.goal ?? '',
      approach: run.approach ?? '',
      overall_complexity: run.overall_complexity ?? 'moderate',
      planning_reasoning: run.planning_reasoning ?? '',
      open_questions: (run.open_questions as string[]) ?? [],
      memory_loaded: (run.memory_loaded as Json) ?? {},
      status: run.status ?? 'complete',
      total_tokens: (run.total_tokens as number) ?? 0,
      task_count: (run.task_count as number) ?? 0,
      tasks_passed: (run.tasks_passed as number) ?? 0,
      avg_score: run.avg_score ?? null,
      planning_score: run.planning_score ?? null,
      strategy_score: run.strategy_score ?? null,
      tasks_detail: (run.tasks_detail as Json) ?? [],
      reflection: (run.reflection as Json) ?? null,
      generated_rules: (run.generated_rules as Json) ?? [],
      knowledge_update: (run.knowledge_update as Json) ?? null,
      duration_ms: run.duration_ms ?? null,
      completed_at: run.completed_at ?? new Date().toISOString(),
      thoughts: (run.thoughts as Json) ?? [],
    };
    const { data, error } = await supabase.from('run_traces').insert([row]).select().single();
    if (error) console.error('persistRunTrace error:', error);
    return data as Record<string, unknown> | null;
  }

  async fetchRunTraces(limit = 50) {
    const { data, error } = await supabase
      .from('run_traces')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) console.error('fetchRunTraces error:', error);
    return (data || []) as Record<string, unknown>[];
  }

  async listConversations(limit = 50) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, total_tokens, created_at, updated_at, last_run_id')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data || []) as {
      id: string;
      title: string;
      total_tokens?: number;
      created_at: string;
      updated_at: string;
      last_run_id?: string | null;
    }[];
  }

  async getConversation(id: string) {
    const { data, error } = await supabase.from('conversations').select('*').eq('id', id).single();
    if (error) return null;
    return data as Record<string, unknown>;
  }

  async createConversation(title: string, messages: unknown[]) {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ title: title.slice(0, 100), messages: JSON.parse(JSON.stringify(messages)) })
      .select('id')
      .single();
    if (error) return null;
    return data as { id: string };
  }

  async updateConversation(
    id: string,
    updates: { messages?: unknown[]; updated_at?: string; total_tokens?: number }
  ) {
    const update: Record<string, unknown> = {
      updated_at: updates.updated_at ?? new Date().toISOString(),
    };
    if (updates.messages !== undefined) update.messages = JSON.parse(JSON.stringify(updates.messages));
    if (updates.total_tokens !== undefined) update.total_tokens = updates.total_tokens;
    await supabase.from('conversations').update(update).eq('id', id);
  }

  async deleteConversation(id: string) {
    await supabase.from('conversations').delete().eq('id', id);
  }
}

// ---- Singleton: chosen by env ----

let _adapter: PersistenceAdapter | null = null;

/**
 * Get the active persistence adapter. Default: Supabase.
 * Set VITE_USE_LOCAL_PERSISTENCE=true to use local IndexedDB adapter.
 */
export function getPersistenceAdapter(): PersistenceAdapter {
  if (!_adapter) {
    const useLocal =
      import.meta.env.VITE_USE_LOCAL_PERSISTENCE === 'true' ||
      import.meta.env.VITE_USE_LOCAL_PERSISTENCE === true;
    _adapter = useLocal ? new LocalAdapter() : new SupabaseAdapter();
  }
  return _adapter;
}
