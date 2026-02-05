// ============================================
// Event Store - Append-only event log with hash chaining
// ============================================

import { generateId, generateHashSync, formatTimestamp } from '@/lib/utils';
import type { Event, EventType, Snapshot, Task, DAGEdge, ContextItem, ArtifactRef, BudgetState, RunMetadata } from '@/types/orchestration';

export class EventStore {
  private events: Event[] = [];
  private snapshots: Snapshot[] = [];
  private lastHash: string = '0'.repeat(16);

  // Append a new event to the log
  appendEvent(
    runId: string,
    type: EventType,
    payload: Record<string, unknown>
  ): Event {
    const event: Event = {
      event_id: generateId(),
      run_id: runId,
      timestamp: formatTimestamp(new Date()),
      type,
      payload,
      hash_prev: this.lastHash,
      hash_self: '', // Will be set below
    };

    // Generate hash for tamper-evident chaining
    const contentToHash = JSON.stringify({
      event_id: event.event_id,
      run_id: event.run_id,
      timestamp: event.timestamp,
      type: event.type,
      payload: event.payload,
      hash_prev: event.hash_prev,
    });
    event.hash_self = generateHashSync(contentToHash);
    this.lastHash = event.hash_self;

    this.events.push(event);
    return event;
  }

  // Get all events
  getEvents(): Event[] {
    return [...this.events];
  }

  // Get events for a specific run
  getEventsByRun(runId: string): Event[] {
    return this.events.filter(e => e.run_id === runId);
  }

  // Get events by type
  getEventsByType(type: EventType): Event[] {
    return this.events.filter(e => e.type === type);
  }

  // Get events since a specific event
  getEventsSince(eventId: string): Event[] {
    const index = this.events.findIndex(e => e.event_id === eventId);
    if (index === -1) return [];
    return this.events.slice(index + 1);
  }

  // Verify event chain integrity
  verifyIntegrity(): { valid: boolean; brokenAt?: string } {
    let prevHash = '0'.repeat(16);
    
    for (const event of this.events) {
      if (event.hash_prev !== prevHash) {
        return { valid: false, brokenAt: event.event_id };
      }
      
      const contentToHash = JSON.stringify({
        event_id: event.event_id,
        run_id: event.run_id,
        timestamp: event.timestamp,
        type: event.type,
        payload: event.payload,
        hash_prev: event.hash_prev,
      });
      const expectedHash = generateHashSync(contentToHash);
      
      if (event.hash_self !== expectedHash) {
        return { valid: false, brokenAt: event.event_id };
      }
      
      prevHash = event.hash_self;
    }
    
    return { valid: true };
  }

  // Create a snapshot
  createSnapshot(
    runId: string,
    queueState: Task[],
    dagEdges: DAGEdge[],
    pinnedContext: ContextItem[],
    workingContext: ContextItem[],
    artifactsIndex: ArtifactRef[],
    budgets: BudgetState,
    runMetadata: RunMetadata
  ): Snapshot {
    const snapshot: Snapshot = {
      snapshot_id: generateId(),
      run_id: runId,
      timestamp: formatTimestamp(new Date()),
      queue_state: queueState,
      dag_edges: dagEdges,
      pinned_context: pinnedContext,
      working_context: workingContext,
      artifacts_index: artifactsIndex,
      budgets,
      run_metadata: runMetadata,
      hash: '',
    };

    snapshot.hash = generateHashSync(JSON.stringify(snapshot));
    this.snapshots.push(snapshot);

    // Also log the snapshot creation as an event
    this.appendEvent(runId, 'SNAPSHOT_CREATED', { snapshot_id: snapshot.snapshot_id });

    return snapshot;
  }

  // Get latest snapshot for a run
  getLatestSnapshot(runId: string): Snapshot | null {
    const runSnapshots = this.snapshots.filter(s => s.run_id === runId);
    if (runSnapshots.length === 0) return null;
    return runSnapshots[runSnapshots.length - 1];
  }

  // Get all snapshots
  getSnapshots(): Snapshot[] {
    return [...this.snapshots];
  }

  // Replay events from a snapshot to rebuild state
  replayFromSnapshot(snapshotId: string): { snapshot: Snapshot; events: Event[] } | null {
    const snapshot = this.snapshots.find(s => s.snapshot_id === snapshotId);
    if (!snapshot) return null;

    const snapshotEvent = this.events.find(
      e => e.type === 'SNAPSHOT_CREATED' && 
           (e.payload as { snapshot_id: string }).snapshot_id === snapshotId
    );
    if (!snapshotEvent) return { snapshot, events: [] };

    const eventsAfter = this.getEventsSince(snapshotEvent.event_id);
    return { snapshot, events: eventsAfter };
  }

  // Export all data for external storage
  export(): { events: Event[]; snapshots: Snapshot[] } {
    return {
      events: this.getEvents(),
      snapshots: this.getSnapshots(),
    };
  }

  // Import data (for replay)
  import(data: { events: Event[]; snapshots: Snapshot[] }): void {
    this.events = [...data.events];
    this.snapshots = [...data.snapshots];
    if (this.events.length > 0) {
      this.lastHash = this.events[this.events.length - 1].hash_self;
    }
  }

  // Clear all data (for testing)
  clear(): void {
    this.events = [];
    this.snapshots = [];
    this.lastHash = '0'.repeat(16);
  }

  // Get event count
  getEventCount(): number {
    return this.events.length;
  }

  // Get snapshot count
  getSnapshotCount(): number {
    return this.snapshots.length;
  }
}

// Singleton instance
export const eventStore = new EventStore();
