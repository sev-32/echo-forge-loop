// ============================================
// AI Journal System - Self-documenting knowledge management
// Plans, reflections, discoveries, decisions, context banks
// ============================================

import { generateId, formatTimestamp } from '@/lib/utils';

// ============================================
// Types
// ============================================

export type JournalEntryType = 
  | 'plan'           // Strategic plans and roadmaps
  | 'reflection'     // Post-task analysis and lessons learned
  | 'discovery'      // New insights found during execution
  | 'decision'       // Architectural/strategic decisions with rationale
  | 'hypothesis'     // Theories to test
  | 'observation'    // Patterns noticed
  | 'correction'     // Self-corrections and error analysis
  | 'synthesis'      // Connecting multiple discoveries
  | 'bookmark'       // Important references to revisit
  | 'process_note';  // Meta-notes about how to improve process

export type JournalPriority = 'critical' | 'high' | 'medium' | 'low';

export interface JournalEntry {
  id: string;
  type: JournalEntryType;
  title: string;
  content: string;
  tags: string[];
  priority: JournalPriority;
  created_at: string;
  updated_at: string;
  run_id?: string;
  task_id?: string;
  parent_id?: string;        // For threading entries
  children_ids: string[];
  references: JournalRef[];  // Cross-references to other entries, events, artifacts
  metadata: Record<string, unknown>;
  archived: boolean;
  tokens_estimate: number;
}

export interface JournalRef {
  type: 'journal' | 'event' | 'artifact' | 'task' | 'test_result' | 'context' | 'external';
  id: string;
  label: string;
}

export interface ContextBank {
  id: string;
  name: string;
  description: string;
  entries: ContextBankEntry[];
  created_at: string;
  updated_at: string;
  max_tokens: number;
  current_tokens: number;
  auto_prune: boolean;       // Automatically prune low-priority entries when full
  tags: string[];
}

export interface ContextBankEntry {
  id: string;
  content: string;
  source: string;
  priority: number;          // 0-100
  tokens_estimate: number;
  created_at: string;
  last_accessed: string;
  access_count: number;
  decay_rate: number;        // How quickly priority decays (0 = never, 1 = fast)
  pinned: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface PlanNode {
  id: string;
  title: string;
  description: string;
  status: 'planned' | 'in_progress' | 'completed' | 'abandoned' | 'blocked';
  children: PlanNode[];
  dependencies: string[];
  estimated_effort: 'trivial' | 'small' | 'medium' | 'large' | 'epic';
  notes: string[];
  created_at: string;
  completed_at?: string;
}

export interface KnowledgeGraph {
  nodes: KGNode[];
  edges: KGEdge[];
}

export interface KGNode {
  id: string;
  label: string;
  type: 'concept' | 'fact' | 'rule' | 'pattern' | 'error' | 'solution';
  content: string;
  weight: number;
  source_entries: string[];  // journal entry IDs
}

export interface KGEdge {
  from: string;
  to: string;
  relationship: 'relates_to' | 'causes' | 'prevents' | 'requires' | 'contradicts' | 'supports' | 'replaces';
  weight: number;
}

// ============================================
// Journal Manager
// ============================================

export class JournalManager {
  private entries: Map<string, JournalEntry> = new Map();
  private contextBanks: Map<string, ContextBank> = new Map();
  private knowledgeGraph: KnowledgeGraph = { nodes: [], edges: [] };
  private plans: Map<string, PlanNode> = new Map();

  // ---- Journal Entries ----

  createEntry(
    type: JournalEntryType,
    title: string,
    content: string,
    options: {
      tags?: string[];
      priority?: JournalPriority;
      run_id?: string;
      task_id?: string;
      parent_id?: string;
      references?: JournalRef[];
      metadata?: Record<string, unknown>;
    } = {}
  ): JournalEntry {
    const entry: JournalEntry = {
      id: generateId(),
      type,
      title,
      content,
      tags: options.tags || [],
      priority: options.priority || 'medium',
      created_at: formatTimestamp(new Date()),
      updated_at: formatTimestamp(new Date()),
      run_id: options.run_id,
      task_id: options.task_id,
      parent_id: options.parent_id,
      children_ids: [],
      references: options.references || [],
      metadata: options.metadata || {},
      archived: false,
      tokens_estimate: Math.ceil(content.length / 4),
    };

    this.entries.set(entry.id, entry);

    // Link to parent
    if (options.parent_id) {
      const parent = this.entries.get(options.parent_id);
      if (parent) {
        parent.children_ids.push(entry.id);
        parent.updated_at = formatTimestamp(new Date());
      }
    }

    // Auto-extract knowledge graph nodes
    this.extractKnowledge(entry);

    return entry;
  }

  updateEntry(id: string, updates: Partial<Pick<JournalEntry, 'title' | 'content' | 'tags' | 'priority' | 'archived' | 'metadata'>>): JournalEntry | null {
    const entry = this.entries.get(id);
    if (!entry) return null;

    Object.assign(entry, updates, { updated_at: formatTimestamp(new Date()) });
    if (updates.content) {
      entry.tokens_estimate = Math.ceil(updates.content.length / 4);
    }
    return entry;
  }

  getEntry(id: string): JournalEntry | undefined {
    return this.entries.get(id);
  }

  getAllEntries(): JournalEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  getEntriesByType(type: JournalEntryType): JournalEntry[] {
    return this.getAllEntries().filter(e => e.type === type);
  }

  getEntriesByTag(tag: string): JournalEntry[] {
    return this.getAllEntries().filter(e => e.tags.includes(tag));
  }

  getEntriesByRun(runId: string): JournalEntry[] {
    return this.getAllEntries().filter(e => e.run_id === runId);
  }

  searchEntries(query: string, limit = 20): JournalEntry[] {
    const q = query.toLowerCase();
    return this.getAllEntries()
      .filter(e => 
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      )
      .slice(0, limit);
  }

  getThread(entryId: string): JournalEntry[] {
    const thread: JournalEntry[] = [];
    let current = this.entries.get(entryId);
    
    // Walk up to root
    while (current?.parent_id) {
      current = this.entries.get(current.parent_id);
    }
    
    // DFS collect the full thread
    if (current) {
      this.collectThread(current, thread);
    }
    return thread;
  }

  private collectThread(entry: JournalEntry, result: JournalEntry[]): void {
    result.push(entry);
    for (const childId of entry.children_ids) {
      const child = this.entries.get(childId);
      if (child) this.collectThread(child, result);
    }
  }

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const entry of this.entries.values()) {
      for (const tag of entry.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }

  // ---- Context Banks ----

  createContextBank(
    name: string,
    description: string,
    options: { max_tokens?: number; auto_prune?: boolean; tags?: string[] } = {}
  ): ContextBank {
    const bank: ContextBank = {
      id: generateId(),
      name,
      description,
      entries: [],
      created_at: formatTimestamp(new Date()),
      updated_at: formatTimestamp(new Date()),
      max_tokens: options.max_tokens || 50000,
      current_tokens: 0,
      auto_prune: options.auto_prune ?? true,
      tags: options.tags || [],
    };
    this.contextBanks.set(bank.id, bank);
    return bank;
  }

  addToContextBank(
    bankId: string,
    content: string,
    source: string,
    options: { priority?: number; pinned?: boolean; tags?: string[]; decay_rate?: number; metadata?: Record<string, unknown> } = {}
  ): ContextBankEntry | null {
    const bank = this.contextBanks.get(bankId);
    if (!bank) return null;

    const tokens = Math.ceil(content.length / 4);
    
    // Auto-prune if needed
    if (bank.auto_prune && bank.current_tokens + tokens > bank.max_tokens) {
      this.pruneContextBank(bankId, tokens);
    }

    const entry: ContextBankEntry = {
      id: generateId(),
      content,
      source,
      priority: options.priority ?? 50,
      tokens_estimate: tokens,
      created_at: formatTimestamp(new Date()),
      last_accessed: formatTimestamp(new Date()),
      access_count: 0,
      decay_rate: options.decay_rate ?? 0.1,
      pinned: options.pinned ?? false,
      tags: options.tags || [],
      metadata: options.metadata || {},
    };

    bank.entries.push(entry);
    bank.current_tokens += tokens;
    bank.updated_at = formatTimestamp(new Date());
    return entry;
  }

  accessContextBankEntry(bankId: string, entryId: string): ContextBankEntry | null {
    const bank = this.contextBanks.get(bankId);
    if (!bank) return null;
    const entry = bank.entries.find(e => e.id === entryId);
    if (!entry) return null;
    entry.last_accessed = formatTimestamp(new Date());
    entry.access_count++;
    return entry;
  }

  searchContextBank(bankId: string, query: string, limit = 10): ContextBankEntry[] {
    const bank = this.contextBanks.get(bankId);
    if (!bank) return [];
    const q = query.toLowerCase();
    return bank.entries
      .filter(e => e.content.toLowerCase().includes(q) || e.tags.some(t => t.includes(q)))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  private pruneContextBank(bankId: string, neededTokens: number): void {
    const bank = this.contextBanks.get(bankId);
    if (!bank) return;

    // Sort unpinned entries by effective priority (priority - decay)
    const unpinned = bank.entries
      .filter(e => !e.pinned)
      .map(e => {
        const age = (Date.now() - new Date(e.last_accessed).getTime()) / (1000 * 60 * 60); // hours
        const effectivePriority = e.priority - (e.decay_rate * age);
        return { entry: e, effectivePriority };
      })
      .sort((a, b) => a.effectivePriority - b.effectivePriority);

    let freed = 0;
    for (const { entry } of unpinned) {
      if (freed >= neededTokens) break;
      freed += entry.tokens_estimate;
      bank.entries = bank.entries.filter(e => e.id !== entry.id);
      bank.current_tokens -= entry.tokens_estimate;
    }
  }

  getContextBank(bankId: string): ContextBank | undefined {
    return this.contextBanks.get(bankId);
  }

  getAllContextBanks(): ContextBank[] {
    return Array.from(this.contextBanks.values());
  }

  // ---- Plans ----

  createPlan(title: string, description: string, children?: PlanNode[]): PlanNode {
    const plan: PlanNode = {
      id: generateId(),
      title,
      description,
      status: 'planned',
      children: children || [],
      dependencies: [],
      estimated_effort: 'medium',
      notes: [],
      created_at: formatTimestamp(new Date()),
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  updatePlanStatus(planId: string, status: PlanNode['status']): PlanNode | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;
    plan.status = status;
    if (status === 'completed') plan.completed_at = formatTimestamp(new Date());
    return plan;
  }

  addPlanNote(planId: string, note: string): PlanNode | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;
    plan.notes.push(`[${formatTimestamp(new Date())}] ${note}`);
    return plan;
  }

  getAllPlans(): PlanNode[] {
    return Array.from(this.plans.values());
  }

  // ---- Knowledge Graph ----

  private extractKnowledge(entry: JournalEntry): void {
    // Auto-create a KG node for each entry
    if (entry.type === 'discovery' || entry.type === 'decision' || entry.type === 'correction') {
      const nodeType = entry.type === 'discovery' ? 'fact' 
        : entry.type === 'decision' ? 'rule' 
        : 'solution';

      this.addKGNode(entry.title, nodeType, entry.content, [entry.id]);

      // Connect to related entries via tags
      for (const tag of entry.tags) {
        const related = this.getEntriesByTag(tag).filter(e => e.id !== entry.id);
        for (const rel of related.slice(0, 3)) {
          const existingNode = this.knowledgeGraph.nodes.find(n => n.source_entries.includes(rel.id));
          if (existingNode) {
            const newNode = this.knowledgeGraph.nodes[this.knowledgeGraph.nodes.length - 1];
            if (newNode) {
              this.addKGEdge(newNode.id, existingNode.id, 'relates_to');
            }
          }
        }
      }
    }
  }

  addKGNode(label: string, type: KGNode['type'], content: string, sourceEntries: string[] = []): KGNode {
    const node: KGNode = {
      id: generateId(),
      label,
      type,
      content,
      weight: 1,
      source_entries: sourceEntries,
    };
    this.knowledgeGraph.nodes.push(node);
    return node;
  }

  addKGEdge(from: string, to: string, relationship: KGEdge['relationship']): KGEdge {
    const edge: KGEdge = { from, to, relationship, weight: 1 };
    this.knowledgeGraph.edges.push(edge);
    return edge;
  }

  getKnowledgeGraph(): KnowledgeGraph {
    return { ...this.knowledgeGraph };
  }

  // ---- Statistics ----

  getStats(): {
    total_entries: number;
    by_type: Record<string, number>;
    by_priority: Record<string, number>;
    total_tags: number;
    context_banks: number;
    total_context_tokens: number;
    plans: number;
    kg_nodes: number;
    kg_edges: number;
  } {
    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    
    for (const entry of this.entries.values()) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      byPriority[entry.priority] = (byPriority[entry.priority] || 0) + 1;
    }

    let totalContextTokens = 0;
    for (const bank of this.contextBanks.values()) {
      totalContextTokens += bank.current_tokens;
    }

    return {
      total_entries: this.entries.size,
      by_type: byType,
      by_priority: byPriority,
      total_tags: this.getAllTags().length,
      context_banks: this.contextBanks.size,
      total_context_tokens: totalContextTokens,
      plans: this.plans.size,
      kg_nodes: this.knowledgeGraph.nodes.length,
      kg_edges: this.knowledgeGraph.edges.length,
    };
  }

  // ---- Export / Import ----

  export(): {
    entries: JournalEntry[];
    contextBanks: ContextBank[];
    knowledgeGraph: KnowledgeGraph;
    plans: PlanNode[];
  } {
    return {
      entries: this.getAllEntries(),
      contextBanks: this.getAllContextBanks(),
      knowledgeGraph: this.getKnowledgeGraph(),
      plans: this.getAllPlans(),
    };
  }

  import(data: ReturnType<JournalManager['export']>): void {
    this.entries.clear();
    this.contextBanks.clear();
    this.plans.clear();

    for (const entry of data.entries) {
      this.entries.set(entry.id, entry);
    }
    for (const bank of data.contextBanks) {
      this.contextBanks.set(bank.id, bank);
    }
    this.knowledgeGraph = data.knowledgeGraph;
    for (const plan of data.plans) {
      this.plans.set(plan.id, plan);
    }
  }

  clear(): void {
    this.entries.clear();
    this.contextBanks.clear();
    this.knowledgeGraph = { nodes: [], edges: [] };
    this.plans.clear();
  }
}

// Singleton
export const journal = new JournalManager();
