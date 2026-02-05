import { useState } from 'react';
import { cn, truncate, formatRelativeTime } from '@/lib/utils';
import { Panel, TaskStatusBadge, Icons } from '@/components/ui/status-indicators';
import { useTaskQueue } from '@/hooks/use-orchestration';
import type { Task, DAGEdge } from '@/types/orchestration';
import { ScrollArea } from '@/components/ui/scroll-area';

export function TaskQueuePanel() {
  const { tasks, stats, getDAGEdges } = useTaskQueue();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  return (
    <Panel 
      title="Task Queue" 
      icon={<Icons.List className="w-4 h-4" />}
      className="h-full flex flex-col"
      actions={
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-status-success">{stats.done} done</span>
          <span className="text-status-active">{stats.active} active</span>
          <span className="text-muted-foreground">{stats.queued} queued</span>
        </div>
      }
    >
      <div className="flex gap-4 h-full">
        {/* Task List */}
        <ScrollArea className="flex-1 -mx-4 -my-4 px-4 py-2">
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No tasks in queue</p>
            ) : (
              tasks.map((task) => (
                <TaskRow 
                  key={task.task_id} 
                  task={task} 
                  isSelected={selectedTask?.task_id === task.task_id}
                  onClick={() => setSelectedTask(task)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Task Details */}
        {selectedTask && (
          <div className="w-80 border-l border-border pl-4 -my-4 py-4">
            <TaskDetails task={selectedTask} onClose={() => setSelectedTask(null)} />
          </div>
        )}
      </div>
    </Panel>
  );
}

interface TaskRowProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}

function TaskRow({ task, isSelected, onClick }: TaskRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors',
        isSelected 
          ? 'bg-surface-2 border-primary' 
          : 'bg-surface-1 border-border hover:bg-surface-2'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{task.title}</span>
            <span className="text-xs text-muted-foreground font-mono">P{task.priority}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {truncate(task.prompt, 60)}
          </p>
        </div>
        <TaskStatusBadge status={task.status} />
      </div>
      
      {task.dependencies.length > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Icons.GitBranch className="w-3 h-3" />
          <span>{task.dependencies.length} dependencies</span>
        </div>
      )}
    </button>
  );
}

interface TaskDetailsProps {
  task: Task;
  onClose: () => void;
}

function TaskDetails({ task, onClose }: TaskDetailsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h4 className="font-semibold text-sm">{task.title}</h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.XCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <div className="mt-1">
            <TaskStatusBadge status={task.status} />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Priority</label>
          <p className="font-mono text-sm">{task.priority}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Prompt</label>
          <p className="text-sm mt-1 text-muted-foreground">{task.prompt}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Task ID</label>
          <p className="font-mono text-xs mt-1 break-all">{task.task_id}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Created</label>
          <p className="text-sm">{formatRelativeTime(task.created_at)}</p>
        </div>

        {task.acceptance_criteria.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground">Acceptance Criteria</label>
            <ul className="mt-1 space-y-1">
              {task.acceptance_criteria.map((criterion) => (
                <li key={criterion.id} className="text-xs flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>{criterion.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.history.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground">History</label>
            <div className="mt-1 space-y-1">
              {task.history.slice(-5).map((entry, i) => (
                <div key={i} className="text-xs">
                  <span className="text-muted-foreground">{formatRelativeTime(entry.timestamp)}:</span>
                  <span className="ml-1">{entry.field} → {String(entry.new_value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {task.error && (
          <div>
            <label className="text-xs text-status-error">Error</label>
            <p className="text-sm text-status-error mt-1">{task.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// DAG Visualization
export function DAGVisualization() {
  const { tasks, getDAGEdges } = useTaskQueue();
  const edges = getDAGEdges();

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No tasks to visualize
      </div>
    );
  }

  // Simple horizontal layout
  const statusOrder = ['queued', 'active', 'blocked', 'done', 'failed', 'canceled'];
  const groupedTasks = statusOrder.reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.status === status);
    return acc;
  }, {} as Record<string, Task[]>);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statusOrder.map((status) => {
        const statusTasks = groupedTasks[status];
        if (statusTasks.length === 0) return null;

        return (
          <div key={status} className="flex-shrink-0">
            <h5 className="text-xs font-medium text-muted-foreground mb-2 capitalize">{status}</h5>
            <div className="space-y-2">
              {statusTasks.map((task) => (
                <div 
                  key={task.task_id}
                  className={cn(
                    'px-3 py-2 rounded border text-xs min-w-[120px]',
                    status === 'done' && 'bg-node-done/20 border-node-done/50',
                    status === 'active' && 'bg-node-active/20 border-node-active/50',
                    status === 'failed' && 'bg-node-failed/20 border-node-failed/50',
                    status === 'blocked' && 'bg-node-blocked/20 border-node-blocked/50',
                    status === 'queued' && 'bg-surface-2 border-border',
                    status === 'canceled' && 'bg-surface-1 border-border opacity-50',
                  )}
                >
                  <span className="font-medium truncate block">{truncate(task.title, 20)}</span>
                  <span className="text-muted-foreground font-mono">P{task.priority}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
