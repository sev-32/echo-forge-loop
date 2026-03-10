// ============================================
// Persistence Layer — delegates to adapter (Supabase or local)
// ============================================

import { getPersistenceAdapter } from './persistence-adapter';

const adapter = () => getPersistenceAdapter();

// ---- Events ----
export async function persistEvent(
  runId: string,
  eventType: string,
  payload: Record<string, unknown>,
  hashPrev?: string,
  hashSelf?: string
) {
  return adapter().persistEvent(runId, eventType, payload, hashPrev, hashSelf);
}

export async function fetchEvents(runId: string) {
  return adapter().fetchEvents(runId);
}

export async function fetchRecentEvents(limit = 50) {
  return adapter().fetchRecentEvents(limit);
}

// ---- Snapshots ----
export async function persistSnapshot(
  runId: string,
  reason: string,
  state: Record<string, unknown>,
  eventCount: number
) {
  return adapter().persistSnapshot(runId, reason, state, eventCount);
}

export async function fetchSnapshots(runId: string) {
  return adapter().fetchSnapshots(runId);
}

// ---- Tasks ----
export async function persistTask(task: {
  run_id: string;
  title: string;
  prompt: string;
  status?: string;
  priority?: number;
  acceptance_criteria?: unknown[];
  dependencies?: string[];
}) {
  return adapter().persistTask(task);
}

export async function updateTask(taskId: string, updates: Record<string, unknown>) {
  return adapter().updateTask(taskId, updates);
}

export async function fetchTasks(runId: string) {
  return adapter().fetchTasks(runId);
}

export async function fetchAllTasks() {
  return adapter().fetchAllTasks();
}

// ---- Journal Entries ----
export async function persistJournalEntry(entry: {
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
  return adapter().persistJournalEntry(entry);
}

export async function fetchJournalEntries(options?: {
  run_id?: string;
  entry_type?: string;
  limit?: number;
}) {
  return adapter().fetchJournalEntries(options);
}

// ---- Context Banks ----
export async function persistContextBank(bank: {
  name: string;
  description: string;
  max_tokens?: number;
  auto_prune?: boolean;
}) {
  return adapter().persistContextBank(bank);
}

export async function fetchContextBanks() {
  return adapter().fetchContextBanks();
}

export async function persistContextBankEntry(entry: {
  bank_id: string;
  content: string;
  source: string;
  priority?: number;
  tokens_estimate?: number;
}) {
  return adapter().persistContextBankEntry(entry);
}

export async function fetchContextBankEntries(bankId: string) {
  return adapter().fetchContextBankEntries(bankId);
}

// ---- Knowledge Graph ----
export async function persistKnowledgeNode(node: {
  label: string;
  node_type: string;
  metadata?: Record<string, unknown>;
}) {
  return adapter().persistKnowledgeNode(node);
}

export async function persistKnowledgeEdge(edge: {
  source_id: string;
  target_id: string;
  relation: string;
  weight?: number;
}) {
  return adapter().persistKnowledgeEdge(edge);
}

export async function fetchKnowledgeGraph() {
  return adapter().fetchKnowledgeGraph();
}

// ---- Test Runs ----
export async function persistTestRun(run: {
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
  return adapter().persistTestRun(run);
}

export async function updateTestRun(runId: string, updates: Record<string, unknown>) {
  return adapter().updateTestRun(runId, updates);
}

export async function fetchTestRuns(options?: {
  test_id?: string;
  suite_id?: string;
  limit?: number;
}) {
  return adapter().fetchTestRuns(options);
}
