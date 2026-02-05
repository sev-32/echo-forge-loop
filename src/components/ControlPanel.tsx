import { useState, useCallback } from 'react';
import { useKernel, useTaskQueue, useBudget } from '@/hooks/use-orchestration';
import { Panel, StatusIndicator, IconButton, Icons } from '@/components/ui/status-indicators';
import { BudgetSummaryBar } from '@/components/BudgetPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function ControlPanel() {
  const { state, status, startRun, step, requestStop, pause, resume, reset, runToCompletion, createCheckpoint, exportBundle } = useKernel();
  const { createTask } = useTaskQueue();
  const { budgetState } = useBudget();
  const [isRunning, setIsRunning] = useState(false);

  const handleStartRun = useCallback(async () => {
    const runId = startRun();
    // Add a demo task
    createTask(runId, 'Demo Task', 'This is a demonstration task', { priority: 50 });
  }, [startRun, createTask]);

  const handleRunToCompletion = useCallback(async () => {
    setIsRunning(true);
    await runToCompletion(200);
    setIsRunning(false);
  }, [runToCompletion]);

  const handleStep = useCallback(async () => {
    await step();
  }, [step]);

  const handleExport = useCallback(() => {
    const bundle = exportBundle();
    if (bundle) {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-${state?.run_id || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [exportBundle, state?.run_id]);

  return (
    <div className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Status and Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <StatusIndicator 
                status={status === 'running' ? 'running' : status === 'paused' ? 'warning' : status === 'error' ? 'error' : 'idle'} 
                size="lg" 
                pulse={status === 'running'}
              />
              <span className="font-semibold capitalize">{status}</span>
              {state?.run_id && (
                <span className="text-xs text-muted-foreground font-mono ml-2">
                  Run: {state.run_id.slice(0, 8)}...
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 border-l border-border pl-4">
              {status === 'idle' ? (
                <Button onClick={handleStartRun} size="sm" className="gap-1">
                  <Icons.Play className="w-3 h-3" />
                  Start Run
                </Button>
              ) : (
                <>
                  <IconButton 
                    icon={<Icons.Play className="w-4 h-4" />}
                    onClick={handleStep}
                    disabled={status !== 'running'}
                    title="Step"
                  />
                  <IconButton 
                    icon={isRunning ? <Icons.Activity className="w-4 h-4 animate-spin" /> : <Icons.Zap className="w-4 h-4" />}
                    onClick={handleRunToCompletion}
                    disabled={status !== 'running' || isRunning}
                    variant="primary"
                    title="Run to Completion"
                  />
                  {status === 'running' ? (
                    <IconButton 
                      icon={<Icons.Pause className="w-4 h-4" />}
                      onClick={pause}
                      title="Pause"
                    />
                  ) : status === 'paused' ? (
                    <IconButton 
                      icon={<Icons.Play className="w-4 h-4" />}
                      onClick={resume}
                      title="Resume"
                    />
                  ) : null}
                  <IconButton 
                    icon={<Icons.Square className="w-4 h-4" />}
                    onClick={() => requestStop('User requested stop')}
                    disabled={status !== 'running' && status !== 'paused'}
                    variant="danger"
                    title="STOP"
                  />
                  <IconButton 
                    icon={<Icons.RotateCcw className="w-4 h-4" />}
                    onClick={reset}
                    title="Reset"
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-1 border-l border-border pl-4">
              <IconButton 
                icon={<Icons.Database className="w-4 h-4" />}
                onClick={() => createCheckpoint?.('Manual checkpoint')}
                disabled={!state?.run_id}
                title="Create Checkpoint"
              />
              <IconButton 
                icon={<Icons.FileText className="w-4 h-4" />}
                onClick={handleExport}
                disabled={!state?.run_id}
                title="Export Bundle"
              />
              <AddTaskDialog runId={state?.run_id || ''} />
            </div>
          </div>

          {/* Right: Budget Summary */}
          <BudgetSummaryBar />
        </div>

        {/* Iteration Counter */}
        {state && (
          <div className="flex items-center gap-6 mt-2 text-xs text-muted-foreground">
            <span>Iteration: <span className="font-mono text-foreground">{state.iteration}</span></span>
            <span>Last Checkpoint: <span className="font-mono text-foreground">{state.last_checkpoint_at}</span></span>
            {state.current_task_id && (
              <span>Current Task: <span className="font-mono text-foreground">{state.current_task_id.slice(0, 8)}...</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface AddTaskDialogProps {
  runId: string;
}

function AddTaskDialog({ runId }: AddTaskDialogProps) {
  const { createTask } = useTaskQueue();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [priority, setPriority] = useState(50);

  const handleSubmit = () => {
    if (title && prompt && runId) {
      createTask(runId, title, prompt, { priority });
      setTitle('');
      setPrompt('');
      setPriority(50);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton 
          icon={<Icons.List className="w-4 h-4" />}
          disabled={!runId}
          title="Add Task"
        />
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
          <DialogDescription>
            Add a new task to the queue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Prompt</label>
            <Textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Task prompt/description"
              className="mt-1"
              rows={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Priority (0-100)</label>
            <Input 
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              min={0}
              max={100}
              className="mt-1 w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title || !prompt}>Add Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
