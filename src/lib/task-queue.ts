// ============================================
// Task Queue - DAG-aware task queue management
// ============================================

import { generateId, formatTimestamp, deepClone, topologicalSort } from '@/lib/utils';
import { eventStore } from '@/lib/event-store';
import type { Task, TaskStatus, TaskHistoryEntry, AcceptanceCriterion, DAGEdge } from '@/types/orchestration';

export interface QueueMutation {
  type: 'add' | 'remove' | 'split' | 'merge' | 'reprioritize' | 'update_status' | 'add_dependency';
  task_ids: string[];
  justification: string;
  payload?: unknown;
}

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private dagEdges: DAGEdge[] = [];

  // Create a new task
  createTask(
    runId: string,
    title: string,
    prompt: string,
    options: {
      acceptance_criteria?: AcceptanceCriterion[];
      dependencies?: string[];
      priority?: number;
      context_refs?: string[];
    } = {}
  ): Task {
    const task: Task = {
      task_id: generateId(),
      title,
      prompt,
      acceptance_criteria: options.acceptance_criteria || [],
      dependencies: options.dependencies || [],
      priority: options.priority ?? 50,
      status: 'queued',
      context_refs: options.context_refs || [],
      history: [],
      created_at: formatTimestamp(new Date()),
      updated_at: formatTimestamp(new Date()),
    };

    // Update DAG edges
    for (const depId of task.dependencies) {
      this.dagEdges.push({
        from_task_id: depId,
        to_task_id: task.task_id,
        type: 'depends_on',
      });
    }

    this.tasks.set(task.task_id, task);

    // Log mutation event
    eventStore.appendEvent(runId, 'QUEUE_MUTATION', {
      mutation: {
        type: 'add',
        task_ids: [task.task_id],
        justification: `Created task: ${title}`,
      } as QueueMutation,
    });

    return task;
  }

  // Get a task by ID
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  // Get all tasks
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  // Get tasks by status
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter(t => t.status === status);
  }

  // Get next task to execute (DAG + priority aware)
  getNextTask(): Task | null {
    const queuedTasks = this.getTasksByStatus('queued');
    
    // Filter to tasks with all dependencies satisfied
    const readyTasks = queuedTasks.filter(task => {
      return task.dependencies.every(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'done';
      });
    });

    if (readyTasks.length === 0) return null;

    // Sort by priority (highest first)
    readyTasks.sort((a, b) => b.priority - a.priority);
    return readyTasks[0];
  }

  // Update task status
  updateStatus(runId: string, taskId: string, status: TaskStatus, reason: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const oldStatus = task.status;
    task.status = status;
    task.updated_at = formatTimestamp(new Date());

    if (status === 'active' && !task.started_at) {
      task.started_at = formatTimestamp(new Date());
    }
    if (status === 'done' || status === 'failed' || status === 'canceled') {
      task.completed_at = formatTimestamp(new Date());
    }

    task.history.push({
      timestamp: formatTimestamp(new Date()),
      field: 'status',
      old_value: oldStatus,
      new_value: status,
      reason,
    });

    eventStore.appendEvent(runId, 'QUEUE_MUTATION', {
      mutation: {
        type: 'update_status',
        task_ids: [taskId],
        justification: reason,
        payload: { old: oldStatus, new: status },
      } as QueueMutation,
    });

    return task;
  }

  // Reprioritize a task
  reprioritize(runId: string, taskId: string, newPriority: number, justification: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const oldPriority = task.priority;
    task.priority = Math.max(0, Math.min(100, newPriority));
    task.updated_at = formatTimestamp(new Date());

    task.history.push({
      timestamp: formatTimestamp(new Date()),
      field: 'priority',
      old_value: oldPriority,
      new_value: task.priority,
      reason: justification,
    });

    eventStore.appendEvent(runId, 'QUEUE_MUTATION', {
      mutation: {
        type: 'reprioritize',
        task_ids: [taskId],
        justification,
        payload: { old: oldPriority, new: task.priority },
      } as QueueMutation,
    });

    return task;
  }

  // Add a dependency
  addDependency(runId: string, taskId: string, dependsOnId: string, justification: string): boolean {
    const task = this.tasks.get(taskId);
    const dependency = this.tasks.get(dependsOnId);
    if (!task || !dependency) return false;

    // Check for circular dependency
    if (this.wouldCreateCycle(taskId, dependsOnId)) {
      return false;
    }

    if (!task.dependencies.includes(dependsOnId)) {
      task.dependencies.push(dependsOnId);
      task.updated_at = formatTimestamp(new Date());

      this.dagEdges.push({
        from_task_id: dependsOnId,
        to_task_id: taskId,
        type: 'depends_on',
      });

      task.history.push({
        timestamp: formatTimestamp(new Date()),
        field: 'dependencies',
        old_value: task.dependencies.filter(d => d !== dependsOnId),
        new_value: task.dependencies,
        reason: justification,
      });

      eventStore.appendEvent(runId, 'QUEUE_MUTATION', {
        mutation: {
          type: 'add_dependency',
          task_ids: [taskId, dependsOnId],
          justification,
        } as QueueMutation,
      });

      // If dependency is not done, block this task
      if (dependency.status !== 'done') {
        this.updateStatus(runId, taskId, 'blocked', `Blocked by ${dependency.title}`);
      }
    }

    return true;
  }

  // Split a task into subtasks
  splitTask(
    runId: string,
    taskId: string,
    subtasks: { title: string; prompt: string }[],
    justification: string
  ): Task[] {
    const originalTask = this.tasks.get(taskId);
    if (!originalTask) return [];

    const newTasks: Task[] = [];
    const subtaskIds: string[] = [];

    for (const subtask of subtasks) {
      const newTask = this.createTask(runId, subtask.title, subtask.prompt, {
        priority: originalTask.priority,
        dependencies: [...originalTask.dependencies],
      });
      newTasks.push(newTask);
      subtaskIds.push(newTask.task_id);
    }

    // Cancel the original task
    this.updateStatus(runId, taskId, 'canceled', `Split into ${subtasks.length} subtasks`);

    eventStore.appendEvent(runId, 'QUEUE_MUTATION', {
      mutation: {
        type: 'split',
        task_ids: [taskId, ...subtaskIds],
        justification,
        payload: { original: taskId, subtasks: subtaskIds },
      } as QueueMutation,
    });

    return newTasks;
  }

  // Check if adding a dependency would create a cycle
  private wouldCreateCycle(taskId: string, newDepId: string): boolean {
    const visited = new Set<string>();
    const stack = [taskId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === newDepId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Get all tasks that depend on current
      const dependents = this.dagEdges
        .filter(e => e.from_task_id === current)
        .map(e => e.to_task_id);
      stack.push(...dependents);
    }

    return false;
  }

  // Get DAG edges
  getDAGEdges(): DAGEdge[] {
    return [...this.dagEdges];
  }

  // Get task execution order (topological sort)
  getExecutionOrder(): string[] {
    const tasks = this.getAllTasks().map(t => ({
      task_id: t.task_id,
      dependencies: t.dependencies,
    }));
    return topologicalSort(tasks);
  }

  // Get queue statistics
  getStats(): Record<TaskStatus, number> {
    const stats: Record<TaskStatus, number> = {
      queued: 0,
      active: 0,
      blocked: 0,
      done: 0,
      failed: 0,
      canceled: 0,
    };

    for (const task of this.tasks.values()) {
      stats[task.status]++;
    }

    return stats;
  }

  // Export state for snapshotting
  export(): { tasks: Task[]; edges: DAGEdge[] } {
    return {
      tasks: this.getAllTasks().map(t => deepClone(t)),
      edges: deepClone(this.dagEdges),
    };
  }

  // Import state (for replay)
  import(data: { tasks: Task[]; edges: DAGEdge[] }): void {
    this.tasks.clear();
    this.dagEdges = [];

    for (const task of data.tasks) {
      this.tasks.set(task.task_id, deepClone(task));
    }
    this.dagEdges = deepClone(data.edges);
  }

  // Clear all tasks
  clear(): void {
    this.tasks.clear();
    this.dagEdges = [];
  }

  // Set error on task
  setError(runId: string, taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.error = error;
      task.updated_at = formatTimestamp(new Date());
    }
  }
}

// Singleton instance
export const taskQueue = new TaskQueue();
