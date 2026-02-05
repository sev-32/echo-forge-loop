// ============================================
// Context Manager - Three-tier context management
// ============================================

import { generateId, formatTimestamp } from '@/lib/utils';
import { eventStore } from '@/lib/event-store';
import type { ContextItem, ContextTier, ArtifactRef } from '@/types/orchestration';

export interface ContextManagerConfig {
  maxPinnedItems: number;
  maxWorkingItems: number;
  maxTokensPerTier: {
    pinned: number;
    working: number;
  };
  summarizeThreshold: number; // Summarize when working set exceeds this token count
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxPinnedItems: 20,
  maxWorkingItems: 50,
  maxTokensPerTier: {
    pinned: 8000,
    working: 16000,
  },
  summarizeThreshold: 12000,
};

export class ContextManager {
  private pinnedContext: Map<string, ContextItem> = new Map();
  private workingContext: Map<string, ContextItem> = new Map();
  private longTermMemory: ContextItem[] = [];
  private artifacts: Map<string, ArtifactRef> = new Map();
  private config: ContextManagerConfig;

  constructor(config?: Partial<ContextManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Add item to pinned context (non-negotiables)
  pinContext(content: string, source: string, priority: number = 100): ContextItem {
    const item: ContextItem = {
      id: generateId(),
      tier: 'pinned',
      content,
      source,
      created_at: formatTimestamp(new Date()),
      last_accessed: formatTimestamp(new Date()),
      priority,
      tokens_estimate: this.estimateTokens(content),
    };

    // Enforce limits
    while (this.pinnedContext.size >= this.config.maxPinnedItems) {
      const lowestPriority = this.getLowestPriorityItem(this.pinnedContext);
      if (lowestPriority) {
        this.demoteToWorking(lowestPriority);
      }
    }

    this.pinnedContext.set(item.id, item);
    return item;
  }

  // Add item to working context
  addToWorking(content: string, source: string, priority: number = 50): ContextItem {
    const item: ContextItem = {
      id: generateId(),
      tier: 'working',
      content,
      source,
      created_at: formatTimestamp(new Date()),
      last_accessed: formatTimestamp(new Date()),
      priority,
      tokens_estimate: this.estimateTokens(content),
    };

    // Enforce limits
    while (this.workingContext.size >= this.config.maxWorkingItems) {
      const lowestPriority = this.getLowestPriorityItem(this.workingContext);
      if (lowestPriority) {
        this.archiveToLongTerm(lowestPriority);
      }
    }

    this.workingContext.set(item.id, item);
    return item;
  }

  // Add to long-term memory
  addToLongTerm(content: string, source: string): ContextItem {
    const item: ContextItem = {
      id: generateId(),
      tier: 'long_term',
      content,
      source,
      created_at: formatTimestamp(new Date()),
      last_accessed: formatTimestamp(new Date()),
      priority: 0,
      tokens_estimate: this.estimateTokens(content),
    };

    this.longTermMemory.push(item);
    return item;
  }

  // Get context item by ID
  getItem(id: string): ContextItem | undefined {
    return this.pinnedContext.get(id) || 
           this.workingContext.get(id) || 
           this.longTermMemory.find(item => item.id === id);
  }

  // Get all pinned context
  getPinnedContext(): ContextItem[] {
    return Array.from(this.pinnedContext.values());
  }

  // Get all working context
  getWorkingContext(): ContextItem[] {
    return Array.from(this.workingContext.values());
  }

  // Get pinned constraints as strings
  getPinnedConstraints(): string[] {
    return this.getPinnedContext().map(item => item.content);
  }

  // Search long-term memory (simple text search, would use embeddings in production)
  searchLongTerm(query: string, limit: number = 10): ContextItem[] {
    const queryLower = query.toLowerCase();
    const scored = this.longTermMemory
      .map(item => ({
        item,
        score: this.calculateRelevanceScore(item.content, queryLower),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Update last accessed
    for (const { item } of scored) {
      item.last_accessed = formatTimestamp(new Date());
    }

    return scored.map(({ item }) => item);
  }

  // Calculate relevance score (simple TF-based, would use embeddings in production)
  private calculateRelevanceScore(content: string, query: string): number {
    const contentLower = content.toLowerCase();
    const queryTerms = query.split(/\s+/).filter(t => t.length > 2);
    
    let score = 0;
    for (const term of queryTerms) {
      const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
      score += occurrences;
    }
    
    return score;
  }

  // Demote pinned item to working
  private demoteToWorking(item: ContextItem): void {
    this.pinnedContext.delete(item.id);
    item.tier = 'working';
    this.workingContext.set(item.id, item);
  }

  // Archive working item to long-term
  private archiveToLongTerm(item: ContextItem): void {
    this.workingContext.delete(item.id);
    item.tier = 'long_term';
    this.longTermMemory.push(item);
  }

  // Get lowest priority item from a map
  private getLowestPriorityItem(map: Map<string, ContextItem>): ContextItem | null {
    let lowest: ContextItem | null = null;
    for (const item of map.values()) {
      if (!lowest || item.priority < lowest.priority) {
        lowest = item;
      }
    }
    return lowest;
  }

  // Estimate token count (rough approximation)
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  // Get total tokens in working set
  getWorkingTokenCount(): number {
    let total = 0;
    for (const item of this.workingContext.values()) {
      total += item.tokens_estimate;
    }
    return total;
  }

  // Get total tokens in pinned context
  getPinnedTokenCount(): number {
    let total = 0;
    for (const item of this.pinnedContext.values()) {
      total += item.tokens_estimate;
    }
    return total;
  }

  // Check if summarization is needed
  needsSummarization(): boolean {
    return this.getWorkingTokenCount() > this.config.summarizeThreshold;
  }

  // Summarize working context (stub - would use LLM in production)
  summarizeWorkingContext(runId: string): string {
    const items = this.getWorkingContext();
    const summary = `[Summary of ${items.length} context items with ${this.getWorkingTokenCount()} tokens]`;
    
    // Archive current items and add summary
    for (const item of items) {
      this.archiveToLongTerm(item);
    }
    this.workingContext.clear();

    this.addToWorking(summary, 'context_summarization');

    eventStore.appendEvent(runId, 'CONTEXT_UPDATED', {
      action: 'summarization',
      items_archived: items.length,
      summary_tokens: this.estimateTokens(summary),
    });

    return summary;
  }

  // Register an artifact
  registerArtifact(
    name: string,
    type: string,
    path: string,
    hash: string
  ): ArtifactRef {
    const existingVersions = Array.from(this.artifacts.values())
      .filter(a => a.name === name)
      .map(a => a.version);
    
    const version = existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;

    const artifact: ArtifactRef = {
      artifact_id: generateId(),
      name,
      type,
      path,
      version,
      created_at: formatTimestamp(new Date()),
      hash,
    };

    this.artifacts.set(artifact.artifact_id, artifact);
    return artifact;
  }

  // Get artifact by ID
  getArtifact(artifactId: string): ArtifactRef | undefined {
    return this.artifacts.get(artifactId);
  }

  // Get all artifacts
  getArtifacts(): ArtifactRef[] {
    return Array.from(this.artifacts.values());
  }

  // Get artifact versions
  getArtifactVersions(name: string): ArtifactRef[] {
    return Array.from(this.artifacts.values())
      .filter(a => a.name === name)
      .sort((a, b) => b.version - a.version);
  }

  // Export state for snapshotting
  export(): { pinned: ContextItem[]; working: ContextItem[]; artifacts: ArtifactRef[] } {
    return {
      pinned: this.getPinnedContext(),
      working: this.getWorkingContext(),
      artifacts: this.getArtifacts(),
    };
  }

  // Import state (for replay)
  import(data: { pinned: ContextItem[]; working: ContextItem[]; artifacts: ArtifactRef[] }): void {
    this.pinnedContext.clear();
    this.workingContext.clear();
    this.artifacts.clear();

    for (const item of data.pinned) {
      this.pinnedContext.set(item.id, item);
    }
    for (const item of data.working) {
      this.workingContext.set(item.id, item);
    }
    for (const artifact of data.artifacts) {
      this.artifacts.set(artifact.artifact_id, artifact);
    }
  }

  // Clear all context
  clear(): void {
    this.pinnedContext.clear();
    this.workingContext.clear();
    this.longTermMemory = [];
    this.artifacts.clear();
  }

  // Get statistics
  getStats(): {
    pinned: { count: number; tokens: number };
    working: { count: number; tokens: number };
    long_term: { count: number };
    artifacts: { count: number };
  } {
    return {
      pinned: { count: this.pinnedContext.size, tokens: this.getPinnedTokenCount() },
      working: { count: this.workingContext.size, tokens: this.getWorkingTokenCount() },
      long_term: { count: this.longTermMemory.length },
      artifacts: { count: this.artifacts.size },
    };
  }
}

// Singleton instance
export const contextManager = new ContextManager();
