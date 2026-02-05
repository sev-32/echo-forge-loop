// ============================================
// Orchestration Kernel - Main execution loop
// ============================================

import { generateId, formatTimestamp, deepClone } from '@/lib/utils';
import { eventStore } from '@/lib/event-store';
import { taskQueue } from '@/lib/task-queue';
import { governor } from '@/lib/autonomy-governor';
import { verifier } from '@/lib/verifier';
import { contextManager } from '@/lib/context-manager';
import type { 
  KernelState, 
  Task, 
  ExecutionPlan, 
  PlanStep,
  Snapshot,
  BudgetConfig,
  AutonomyMode 
} from '@/types/orchestration';

export type KernelStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export interface KernelConfig {
  projectId: string;
  budgetConfig?: Partial<BudgetConfig>;
  autonomyMode?: AutonomyMode;
  onStateChange?: (state: KernelState) => void;
  onEvent?: (event: { type: string; payload: unknown }) => void;
}

export class OrchestrationKernel {
  private state: KernelState;
  private config: KernelConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private actionsSinceCheckpoint: number = 0;

  constructor(config: KernelConfig) {
    this.config = config;
    this.state = {
      run_id: '',
      status: 'idle',
      iteration: 0,
      last_checkpoint_at: 0,
      events: [],
      snapshot: null,
    };

    if (config.autonomyMode) {
      governor.setMode(config.autonomyMode);
    }
  }

  // Start a new run
  startRun(initialTasks?: Partial<Task>[]): string {
    const runId = generateId();
    this.state.run_id = runId;
    this.state.status = 'running';
    this.state.iteration = 0;
    this.actionsSinceCheckpoint = 0;

    // Initialize governor
    governor.reset(this.config.budgetConfig);
    governor.startRun(runId);

    // Log run started
    eventStore.appendEvent(runId, 'RUN_STARTED', {
      project_id: this.config.projectId,
      autonomy_mode: governor.getMode(),
      budgets: governor.getBudgetState(),
      timestamp: formatTimestamp(new Date()),
    });

    // Create initial tasks if provided
    if (initialTasks) {
      for (const taskData of initialTasks) {
        taskQueue.createTask(
          runId,
          taskData.title || 'Untitled Task',
          taskData.prompt || '',
          {
            acceptance_criteria: taskData.acceptance_criteria,
            dependencies: taskData.dependencies,
            priority: taskData.priority,
            context_refs: taskData.context_refs,
          }
        );
      }
    }

    // Create initial checkpoint
    this.createCheckpoint('Initial checkpoint');

    this.notifyStateChange();
    return runId;
  }

  // Main execution step
  async step(): Promise<{ completed: boolean; task?: Task; error?: string }> {
    if (this.state.status !== 'running') {
      return { completed: false, error: 'Kernel not running' };
    }

    // Check STOP
    if (governor.isStopRequested()) {
      await this.handleStop();
      return { completed: true };
    }

    // Check budgets
    if (!governor.canContinue()) {
      await this.handleBudgetExhausted();
      return { completed: true };
    }

    // Get next task
    const task = taskQueue.getNextTask();
    if (!task) {
      // No more tasks - check if all done or blocked
      const stats = taskQueue.getStats();
      if (stats.queued === 0 && stats.active === 0 && stats.blocked === 0) {
        this.state.status = 'stopped';
        eventStore.appendEvent(this.state.run_id, 'RUN_STOPPED', {
          reason: 'All tasks completed',
          stats,
        });
        this.createCheckpoint('Run completed');
        return { completed: true };
      }
      return { completed: false, error: 'No ready tasks (some may be blocked)' };
    }

    // Execute task
    this.state.current_task_id = task.task_id;
    this.state.iteration++;
    governor.recordIteration();

    try {
      // Update task status to active
      taskQueue.updateStatus(this.state.run_id, task.task_id, 'active', 'Starting execution');

      // Create execution plan
      const plan = this.createPlan(task);
      eventStore.appendEvent(this.state.run_id, 'PLAN_CREATED', {
        task_id: task.task_id,
        plan,
      });

      // Execute plan steps
      const result = await this.executePlan(plan);

      // Verify result
      if (task.acceptance_criteria.length > 0) {
        const verification = await verifier.verifyTask(
          this.state.run_id,
          task.task_id,
          task.acceptance_criteria,
          result
        );

        if (!verification.passed) {
          // Create fix task
          const fixTask = taskQueue.createTask(
            this.state.run_id,
            `Fix: ${task.title}`,
            `Fix verification failures for task "${task.title}": ${verification.results.filter(r => !r.passed).map(r => r.message).join('; ')}`,
            {
              dependencies: [],
              priority: task.priority + 10, // Higher priority
            }
          );

          taskQueue.updateStatus(this.state.run_id, task.task_id, 'failed', 'Verification failed');
          
          verifier.addAuditEntry(
            this.state.run_id,
            'follow_up',
            `Created fix task ${fixTask.task_id} for failed verification`,
            'warning',
            task.task_id
          );
        } else {
          taskQueue.updateStatus(this.state.run_id, task.task_id, 'done', 'Verification passed');
        }
      } else {
        // No verification criteria - mark as done
        taskQueue.updateStatus(this.state.run_id, task.task_id, 'done', 'Completed (no verification)');
      }

      // Record action and check for checkpoint
      this.actionsSinceCheckpoint++;
      if (governor.shouldCheckpoint(this.actionsSinceCheckpoint)) {
        this.createCheckpoint(`Periodic checkpoint after ${this.actionsSinceCheckpoint} actions`);
        this.actionsSinceCheckpoint = 0;
      }

      this.notifyStateChange();
      return { completed: false, task };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      taskQueue.updateStatus(this.state.run_id, task.task_id, 'failed', errorMessage);
      taskQueue.setError(this.state.run_id, task.task_id, errorMessage);

      eventStore.appendEvent(this.state.run_id, 'ERROR_RAISED', {
        task_id: task.task_id,
        error: errorMessage,
      });

      return { completed: false, task, error: errorMessage };
    }
  }

  // Create execution plan for a task
  private createPlan(task: Task): ExecutionPlan {
    // Simple planning - in production this would use LLM
    const steps: PlanStep[] = [
      {
        id: generateId(),
        action: 'analyze',
        expected_output: 'Understanding of task requirements',
      },
      {
        id: generateId(),
        action: 'execute',
        expected_output: 'Task output',
      },
      {
        id: generateId(),
        action: 'verify',
        expected_output: 'Verification results',
      },
    ];

    return {
      task_id: task.task_id,
      steps,
      estimated_tokens: 1000, // Placeholder
      estimated_tool_calls: steps.length,
    };
  }

  // Execute a plan
  private async executePlan(plan: ExecutionPlan): Promise<unknown> {
    for (const step of plan.steps) {
      eventStore.appendEvent(this.state.run_id, 'ACTION_EXECUTED', {
        task_id: plan.task_id,
        step_id: step.id,
        action: step.action,
      });

      // Simulate execution
      governor.recordTokens(100); // Placeholder token count
      
      if (step.tool) {
        governor.recordToolCall();
        eventStore.appendEvent(this.state.run_id, 'TOOL_CALLED', {
          task_id: plan.task_id,
          tool: step.tool,
          args: step.args,
        });

        // Simulate tool result
        eventStore.appendEvent(this.state.run_id, 'TOOL_RESULT', {
          task_id: plan.task_id,
          tool: step.tool,
          result: { success: true },
        });
      }

      // Check for STOP between steps
      if (governor.isStopRequested()) {
        throw new Error('STOP requested during execution');
      }
    }

    return { success: true, output: 'Task completed' };
  }

  // Handle STOP request
  private async handleStop(): Promise<void> {
    this.state.status = 'stopped';
    
    eventStore.appendEvent(this.state.run_id, 'RUN_STOPPED', {
      reason: governor.getStopReason(),
      immediate: true,
      budgets: governor.getBudgetState(),
      queue_stats: taskQueue.getStats(),
    });

    this.createCheckpoint(`STOP: ${governor.getStopReason()}`);
    this.notifyStateChange();
  }

  // Handle budget exhaustion
  private async handleBudgetExhausted(): Promise<void> {
    this.state.status = 'stopped';
    
    eventStore.appendEvent(this.state.run_id, 'RUN_STOPPED', {
      reason: 'Budget exhausted',
      budgets: governor.getBudgetState(),
      queue_stats: taskQueue.getStats(),
    });

    this.createCheckpoint('Budget exhausted - emergency checkpoint');
    this.notifyStateChange();
  }

  // Create a checkpoint (snapshot)
  createCheckpoint(reason: string): Snapshot {
    const { pinned, working, artifacts } = contextManager.export();
    const { tasks, edges } = taskQueue.export();

    const snapshot = eventStore.createSnapshot(
      this.state.run_id,
      tasks,
      edges,
      pinned,
      working,
      artifacts,
      governor.getBudgetState(),
      governor.getRunMetadata(this.config.projectId)
    );

    eventStore.appendEvent(this.state.run_id, 'CHECKPOINT_CREATED', {
      snapshot_id: snapshot.snapshot_id,
      reason,
      iteration: this.state.iteration,
    });

    this.state.snapshot = snapshot;
    this.state.last_checkpoint_at = this.state.iteration;
    
    return snapshot;
  }

  // Request STOP
  requestStop(reason: string = 'User requested stop'): void {
    governor.requestStop(reason);
    this.notifyStateChange();
  }

  // Pause execution
  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.notifyStateChange();
    }
  }

  // Resume execution
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.notifyStateChange();
    }
  }

  // Run continuously until completion or STOP
  async runToCompletion(stepDelayMs: number = 100): Promise<void> {
    while (this.state.status === 'running') {
      const result = await this.step();
      if (result.completed) break;
      await new Promise(resolve => setTimeout(resolve, stepDelayMs));
    }
  }

  // Get current state
  getState(): KernelState {
    return deepClone(this.state);
  }

  // Get status
  getStatus(): KernelStatus {
    return this.state.status;
  }

  // Get run ID
  getRunId(): string {
    return this.state.run_id;
  }

  // Notify state change
  private notifyStateChange(): void {
    if (this.config.onStateChange) {
      this.config.onStateChange(this.getState());
    }
  }

  // Replay from a snapshot
  replayFromSnapshot(snapshotId: string): boolean {
    const replayData = eventStore.replayFromSnapshot(snapshotId);
    if (!replayData) return false;

    const { snapshot, events } = replayData;

    // Restore state from snapshot
    taskQueue.import({ tasks: snapshot.queue_state, edges: snapshot.dag_edges });
    contextManager.import({
      pinned: snapshot.pinned_context,
      working: snapshot.working_context,
      artifacts: snapshot.artifacts_index,
    });

    // Replay events
    this.state.run_id = snapshot.run_id;
    this.state.snapshot = snapshot;
    this.state.events = events;

    return true;
  }

  // Export run bundle
  exportBundle(): {
    events: ReturnType<typeof eventStore.export>;
    tasks: ReturnType<typeof taskQueue.export>;
    context: ReturnType<typeof contextManager.export>;
    state: KernelState;
  } {
    return {
      events: eventStore.export(),
      tasks: taskQueue.export(),
      context: contextManager.export(),
      state: this.getState(),
    };
  }

  // Reset kernel for new run
  reset(): void {
    this.state = {
      run_id: '',
      status: 'idle',
      iteration: 0,
      last_checkpoint_at: 0,
      events: [],
      snapshot: null,
    };
    
    eventStore.clear();
    taskQueue.clear();
    contextManager.clear();
    governor.reset();
    verifier.clearAuditEntries();
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Factory function
export function createKernel(config: KernelConfig): OrchestrationKernel {
  return new OrchestrationKernel(config);
}
