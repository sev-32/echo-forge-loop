// ============================================
// Persistence Layer - Supabase integration
// ============================================

import { supabase } from '@/integrations/supabase/client';

// ---- Events ----
export async function persistEvent(runId: string, eventType: string, payload: Record<string, unknown>, hashPrev?: string, hashSelf?: string) {
  const { data, error } = await supabase.from('events').insert({
    run_id: runId,
    event_type: eventType,
    payload,
    hash_prev: hashPrev || null,
    hash_self: hashSelf || null,
  }).select().single();
  if (error) console.error('persistEvent error:', error);
  return data;
}

export async function fetchEvents(runId: string) {
  const { data, error } = await supabase.from('events')
    .select('*').eq('run_id', runId).order('created_at', { ascending: true });
  if (error) console.error('fetchEvents error:', error);
  return data || [];
}

export async function fetchRecentEvents(limit = 50) {
  const { data, error } = await supabase.from('events')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) console.error('fetchRecentEvents error:', error);
  return (data || []).reverse();
}

// ---- Snapshots ----
export async function persistSnapshot(runId: string, reason: string, state: Record<string, unknown>, eventCount: number) {
  const { data, error } = await supabase.from('snapshots').insert({
    run_id: runId, reason, state, event_count: eventCount,
  }).select().single();
  if (error) console.error('persistSnapshot error:', error);
  return data;
}

export async function fetchSnapshots(runId: string) {
  const { data, error } = await supabase.from('snapshots')
    .select('*').eq('run_id', runId).order('created_at', { ascending: false });
  if (error) console.error('fetchSnapshots error:', error);
  return data || [];
}

// ---- Tasks ----
export async function persistTask(task: {
  run_id: string; title: string; prompt: string; status?: string; priority?: number;
  acceptance_criteria?: unknown[]; dependencies?: string[];
}) {
  const { data, error } = await supabase.from('tasks').insert({
    run_id: task.run_id,
    title: task.title,
    prompt: task.prompt,
    status: task.status || 'queued',
    priority: task.priority || 50,
    acceptance_criteria: task.acceptance_criteria || [],
    dependencies: task.dependencies || [],
  }).select().single();
  if (error) console.error('persistTask error:', error);
  return data;
}

export async function updateTask(taskId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from('tasks')
    .update(updates).eq('id', taskId).select().single();
  if (error) console.error('updateTask error:', error);
  return data;
}

export async function fetchTasks(runId: string) {
  const { data, error } = await supabase.from('tasks')
    .select('*').eq('run_id', runId).order('priority', { ascending: false });
  if (error) console.error('fetchTasks error:', error);
  return data || [];
}

export async function fetchAllTasks() {
  const { data, error } = await supabase.from('tasks')
    .select('*').order('created_at', { ascending: false }).limit(200);
  if (error) console.error('fetchAllTasks error:', error);
  return data || [];
}

// ---- Journal Entries ----
export async function persistJournalEntry(entry: {
  entry_type: string; title: string; content: string;
  tags?: string[]; priority?: string; run_id?: string; task_id?: string; parent_id?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.from('journal_entries').insert({
    entry_type: entry.entry_type,
    title: entry.title,
    content: entry.content,
    tags: entry.tags || [],
    priority: entry.priority || 'medium',
    run_id: entry.run_id,
    task_id: entry.task_id,
    parent_id: entry.parent_id || null,
    metadata: entry.metadata || {},
  }).select().single();
  if (error) console.error('persistJournalEntry error:', error);
  return data;
}

export async function fetchJournalEntries(options?: { run_id?: string; entry_type?: string; limit?: number }) {
  let query = supabase.from('journal_entries').select('*').order('created_at', { ascending: false });
  if (options?.run_id) query = query.eq('run_id', options.run_id);
  if (options?.entry_type) query = query.eq('entry_type', options.entry_type);
  query = query.limit(options?.limit || 100);
  const { data, error } = await query;
  if (error) console.error('fetchJournalEntries error:', error);
  return data || [];
}

// ---- Context Banks ----
export async function persistContextBank(bank: { name: string; description: string; max_tokens?: number; auto_prune?: boolean }) {
  const { data, error } = await supabase.from('context_banks').insert({
    name: bank.name, description: bank.description,
    max_tokens: bank.max_tokens || 50000, auto_prune: bank.auto_prune ?? true,
  }).select().single();
  if (error) console.error('persistContextBank error:', error);
  return data;
}

export async function fetchContextBanks() {
  const { data, error } = await supabase.from('context_banks').select('*').order('created_at', { ascending: false });
  if (error) console.error('fetchContextBanks error:', error);
  return data || [];
}

export async function persistContextBankEntry(entry: {
  bank_id: string; content: string; source: string; priority?: number; tokens_estimate?: number;
}) {
  const { data, error } = await supabase.from('context_bank_entries').insert({
    bank_id: entry.bank_id, content: entry.content, source: entry.source,
    priority: entry.priority || 50, tokens_estimate: entry.tokens_estimate || Math.ceil(entry.content.length / 4),
  }).select().single();
  if (error) console.error('persistContextBankEntry error:', error);
  return data;
}

export async function fetchContextBankEntries(bankId: string) {
  const { data, error } = await supabase.from('context_bank_entries')
    .select('*').eq('bank_id', bankId).order('priority', { ascending: false });
  if (error) console.error('fetchContextBankEntries error:', error);
  return data || [];
}

// ---- Knowledge Graph ----
export async function persistKnowledgeNode(node: { label: string; node_type: string; metadata?: Record<string, unknown> }) {
  const { data, error } = await supabase.from('knowledge_nodes').insert({
    label: node.label, node_type: node.node_type, metadata: node.metadata || {},
  }).select().single();
  if (error) console.error('persistKnowledgeNode error:', error);
  return data;
}

export async function persistKnowledgeEdge(edge: {
  source_id: string; target_id: string; relation: string; weight?: number;
}) {
  const { data, error } = await supabase.from('knowledge_edges').insert({
    source_id: edge.source_id, target_id: edge.target_id,
    relation: edge.relation, weight: edge.weight || 1.0,
  }).select().single();
  if (error) console.error('persistKnowledgeEdge error:', error);
  return data;
}

export async function fetchKnowledgeGraph() {
  const [nodesRes, edgesRes] = await Promise.all([
    supabase.from('knowledge_nodes').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('knowledge_edges').select('*').order('created_at', { ascending: false }).limit(500),
  ]);
  return {
    nodes: nodesRes.data || [],
    edges: edgesRes.data || [],
  };
}

// ---- Test Runs ----
export async function persistTestRun(run: {
  test_id: string; suite_id?: string; status: string; score?: number; max_score?: number;
  duration_ms?: number; score_breakdown?: Record<string, unknown>; events_snapshot?: unknown[];
  budget_snapshot?: Record<string, unknown>; spec_snapshot?: Record<string, unknown>; errors?: string[];
}) {
  const { data, error } = await supabase.from('test_runs').insert({
    test_id: run.test_id, suite_id: run.suite_id, status: run.status,
    score: run.score, max_score: run.max_score, duration_ms: run.duration_ms,
    score_breakdown: run.score_breakdown || {}, events_snapshot: run.events_snapshot || [],
    budget_snapshot: run.budget_snapshot || {}, spec_snapshot: run.spec_snapshot || {},
    errors: run.errors || [],
  }).select().single();
  if (error) console.error('persistTestRun error:', error);
  return data;
}

export async function updateTestRun(runId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from('test_runs')
    .update({ ...updates, completed_at: new Date().toISOString() }).eq('id', runId).select().single();
  if (error) console.error('updateTestRun error:', error);
  return data;
}

export async function fetchTestRuns(options?: { test_id?: string; suite_id?: string; limit?: number }) {
  let query = supabase.from('test_runs').select('*').order('created_at', { ascending: false });
  if (options?.test_id) query = query.eq('test_id', options.test_id);
  if (options?.suite_id) query = query.eq('suite_id', options.suite_id);
  query = query.limit(options?.limit || 50);
  const { data, error } = await query;
  if (error) console.error('fetchTestRuns error:', error);
  return data || [];
}
