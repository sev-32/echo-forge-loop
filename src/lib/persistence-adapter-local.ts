/**
 * Local persistence adapter — IndexedDB in the browser.
 * Used when VITE_USE_LOCAL_PERSISTENCE=true. No server or Supabase required.
 */

const DB_NAME = 'echo-forge-loop-local';
const DB_VERSION = 1;
const STORES = [
  'events',
  'snapshots',
  'tasks',
  'journal_entries',
  'context_banks',
  'context_bank_entries',
  'knowledge_nodes',
  'knowledge_edges',
  'test_runs',
  'run_traces',
  'conversations',
] as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
  });
}

function genId(): string {
  return crypto.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function add<T extends Record<string, unknown>>(
  storeName: (typeof STORES)[number],
  record: T & { id?: string }
): Promise<T & { id: string }> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const id = record.id ?? genId();
    const doc = { ...record, id };
    const req = store.add(doc);
    req.onsuccess = () => {
      db.close();
      resolve(doc as T & { id: string });
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function put<T extends Record<string, unknown>>(
  storeName: (typeof STORES)[number],
  record: T & { id: string }
): Promise<T & { id: string }> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => {
      db.close();
      resolve(record as T & { id: string });
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function get<T>(storeName: (typeof STORES)[number], id: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as T) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function getAll<T>(
  storeName: (typeof STORES)[number],
  indexName?: string,
  range?: IDBKeyRange
): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const target = indexName ? store.index(indexName) : store;
    const req = range ? target.getAll(range) : target.getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result || []) as T[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function deleteByKey(storeName: (typeof STORES)[number], id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function queryAll<T>(
  storeName: (typeof STORES)[number],
  filter?: (row: T) => boolean,
  sort?: (a: T, b: T) => number,
  limit?: number
): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => {
      db.close();
      let list = (req.result || []) as T[];
      if (filter) list = list.filter(filter);
      if (sort) list = list.sort(sort);
      if (limit != null) list = list.slice(0, limit);
      resolve(list);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

// ---- LocalAdapter ----

import type { PersistenceAdapter } from './persistence-adapter';

export class LocalAdapter implements PersistenceAdapter {
  async persistEvent(
    runId: string,
    eventType: string,
    payload: Record<string, unknown>,
    hashPrev?: string,
    hashSelf?: string
  ) {
    const now = new Date().toISOString();
    const doc = await add('events', {
      run_id: runId,
      event_type: eventType,
      payload,
      hash_prev: hashPrev ?? null,
      hash_self: hashSelf ?? null,
      created_at: now,
    });
    return doc;
  }

  async fetchEvents(runId: string) {
    const list = await queryAll<Record<string, unknown>>(
      'events',
      (r) => r.run_id === runId,
      (a, b) => (a.created_at as string).localeCompare(b.created_at as string)
    );
    return list;
  }

  async fetchRecentEvents(limit = 50) {
    const list = await queryAll<Record<string, unknown>>(
      'events',
      undefined,
      (a, b) => (b.created_at as string).localeCompare(a.created_at as string),
      limit
    );
    return list.reverse();
  }

  async persistSnapshot(
    runId: string,
    reason: string,
    state: Record<string, unknown>,
    eventCount: number
  ) {
    const now = new Date().toISOString();
    return add('snapshots', { run_id: runId, reason, state, event_count: eventCount, created_at: now });
  }

  async fetchSnapshots(runId: string) {
    return queryAll<Record<string, unknown>>(
      'snapshots',
      (r) => r.run_id === runId,
      (a, b) => (b.created_at as string).localeCompare(a.created_at as string)
    );
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
    const now = new Date().toISOString();
    return add('tasks', {
      run_id: task.run_id,
      title: task.title,
      prompt: task.prompt,
      status: task.status || 'queued',
      priority: task.priority ?? 50,
      acceptance_criteria: task.acceptance_criteria || [],
      dependencies: task.dependencies || [],
      created_at: now,
    });
  }

  async updateTask(taskId: string, updates: Record<string, unknown>) {
    const existing = await get<Record<string, unknown>>('tasks', taskId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id: taskId };
    await put('tasks', updated);
    return updated;
  }

  async fetchTasks(runId: string) {
    const list = await queryAll<Record<string, unknown>>(
      'tasks',
      (r) => r.run_id === runId,
      (a, b) => (b.priority as number) - (a.priority as number)
    );
    return list;
  }

  async fetchAllTasks() {
    return queryAll<Record<string, unknown>>(
      'tasks',
      undefined,
      (a, b) => (b.created_at as string).localeCompare(a.created_at as string),
      200
    );
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
    const now = new Date().toISOString();
    return add('journal_entries', {
      entry_type: entry.entry_type,
      title: entry.title,
      content: entry.content,
      tags: entry.tags || [],
      priority: entry.priority || 'medium',
      run_id: entry.run_id ?? null,
      task_id: entry.task_id ?? null,
      parent_id: entry.parent_id ?? null,
      metadata: entry.metadata || {},
      created_at: now,
    });
  }

  async fetchJournalEntries(options?: { run_id?: string; entry_type?: string; limit?: number }) {
    let list = await queryAll<Record<string, unknown>>(
      'journal_entries',
      undefined,
      (a, b) => (b.created_at as string).localeCompare(a.created_at as string),
      options?.limit ?? 100
    );
    if (options?.run_id) list = list.filter((r) => r.run_id === options.run_id);
    if (options?.entry_type) list = list.filter((r) => r.entry_type === options.entry_type);
    return list;
  }

  async persistContextBank(bank: {
    name: string;
    description: string;
    max_tokens?: number;
    auto_prune?: boolean;
  }) {
    const now = new Date().toISOString();
    return add('context_banks', {
      name: bank.name,
      description: bank.description,
      max_tokens: bank.max_tokens ?? 50000,
      auto_prune: bank.auto_prune ?? true,
      created_at: now,
    });
  }

  async fetchContextBanks() {
    return queryAll<Record<string, unknown>>(
      'context_banks',
      undefined,
      (a, b) => (b.created_at as string).localeCompare(a.created_at as string)
    );
  }

  async persistContextBankEntry(entry: {
    bank_id: string;
    content: string;
    source: string;
    priority?: number;
    tokens_estimate?: number;
  }) {
    const now = new Date().toISOString();
    return add('context_bank_entries', {
      bank_id: entry.bank_id,
      content: entry.content,
      source: entry.source,
      priority: entry.priority ?? 50,
      tokens_estimate: entry.tokens_estimate ?? Math.ceil(entry.content.length / 4),
      created_at: now,
    });
  }

  async fetchContextBankEntries(bankId: string) {
    return queryAll<Record<string, unknown>>(
      'context_bank_entries',
      (r) => r.bank_id === bankId,
      (a, b) => (b.priority as number) - (a.priority as number)
    );
  }

  async persistKnowledgeNode(node: {
    label: string;
    node_type: string;
    metadata?: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    return add('knowledge_nodes', {
      label: node.label,
      node_type: node.node_type,
      metadata: node.metadata || {},
      created_at: now,
    });
  }

  async persistKnowledgeEdge(edge: {
    source_id: string;
    target_id: string;
    relation: string;
    weight?: number;
  }) {
    const now = new Date().toISOString();
    return add('knowledge_edges', {
      source_id: edge.source_id,
      target_id: edge.target_id,
      relation: edge.relation,
      weight: edge.weight ?? 1.0,
      created_at: now,
    });
  }

  async fetchKnowledgeGraph() {
    const [nodes, edges] = await Promise.all([
      queryAll<Record<string, unknown>>(
        'knowledge_nodes',
        undefined,
        (a, b) => (b.created_at as string).localeCompare(a.created_at as string),
        200
      ),
      queryAll<Record<string, unknown>>(
        'knowledge_edges',
        undefined,
        (a, b) => (b.created_at as string).localeCompare(a.created_at as string),
        500
      ),
    ]);
    return { nodes, edges };
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
    const now = new Date().toISOString();
    return add('test_runs', {
      test_id: run.test_id,
      suite_id: run.suite_id ?? null,
      status: run.status,
      score: run.score,
      max_score: run.max_score,
      duration_ms: run.duration_ms,
      score_breakdown: run.score_breakdown || {},
      events_snapshot: run.events_snapshot || [],
      budget_snapshot: run.budget_snapshot || {},
      spec_snapshot: run.spec_snapshot || {},
      errors: run.errors || [],
      created_at: now,
    });
  }

  async updateTestRun(runId: string, updates: Record<string, unknown>) {
    const existing = await get<Record<string, unknown>>('test_runs', runId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, completed_at: new Date().toISOString(), id: runId };
    await put('test_runs', updated);
    return updated;
  }

  async fetchTestRuns(options?: { test_id?: string; suite_id?: string; limit?: number }) {
    let list = await queryAll<Record<string, unknown>>(
      'test_runs',
      undefined,
      (a, b) => (b.created_at as string).localeCompare(a.created_at as string),
      options?.limit ?? 50
    );
    if (options?.test_id) list = list.filter((r) => r.test_id === options!.test_id);
    if (options?.suite_id) list = list.filter((r) => r.suite_id === options!.suite_id);
    return list;
  }

  async persistRunTrace(run: Record<string, unknown>) {
    const now = new Date().toISOString();
    const doc = await add('run_traces', {
      ...run,
      run_id: run.run_id ?? genId(),
      goal: run.goal ?? '',
      approach: run.approach ?? '',
      status: run.status ?? 'complete',
      total_tokens: run.total_tokens ?? 0,
      task_count: run.task_count ?? 0,
      tasks_passed: run.tasks_passed ?? 0,
      created_at: run.created_at ?? now,
      completed_at: run.completed_at ?? now,
    });
    return doc;
  }

  async fetchRunTraces(limit = 50) {
    return queryAll<Record<string, unknown>>(
      'run_traces',
      undefined,
      (a, b) => (b.created_at as string).localeCompare(a.created_at as string),
      limit
    );
  }

  async listConversations(limit = 50) {
    const list = await queryAll<Record<string, unknown>>(
      'conversations',
      undefined,
      (a, b) => (b.updated_at as string).localeCompare(a.updated_at as string),
      limit
    );
    return list.map((c) => ({
      id: c.id as string,
      title: c.title as string,
      total_tokens: c.total_tokens as number | undefined,
      created_at: c.created_at as string,
      updated_at: c.updated_at as string,
      last_run_id: c.last_run_id as string | null | undefined,
    }));
  }

  async getConversation(id: string) {
    return get<Record<string, unknown>>('conversations', id);
  }

  async createConversation(title: string, messages: unknown[]) {
    const now = new Date().toISOString();
    const doc = await add('conversations', {
      title: title.slice(0, 100),
      messages: JSON.parse(JSON.stringify(messages)),
      total_tokens: null,
      last_run_id: null,
      created_at: now,
      updated_at: now,
    });
    return { id: doc.id };
  }

  async updateConversation(
    id: string,
    updates: { messages?: unknown[]; updated_at?: string; total_tokens?: number }
  ) {
    const existing = await get<Record<string, unknown>>('conversations', id);
    if (!existing) return;
    const updated = {
      ...existing,
      ...updates,
      updated_at: updates.updated_at ?? new Date().toISOString(),
      id,
    };
    if (updates.messages !== undefined) updated.messages = JSON.parse(JSON.stringify(updates.messages));
    if (updates.total_tokens !== undefined) updated.total_tokens = updates.total_tokens;
    await put('conversations', updated);
  }

  async deleteConversation(id: string) {
    await deleteByKey('conversations', id);
  }
}
