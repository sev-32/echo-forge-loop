import { useState, useCallback } from 'react';
import { ControlPanel } from '@/components/ControlPanel';
import { TaskQueuePanel, DAGVisualization } from '@/components/TaskQueuePanel';
import { EventLogPanel } from '@/components/EventLogPanel';
import { BudgetPanel } from '@/components/BudgetPanel';
import { TestHarnessPanel } from '@/components/TestHarnessPanel';
import { ContextPanel } from '@/components/ContextPanel';
import { JournalPanel } from '@/components/JournalPanel';
import { TestAuditPanel } from '@/components/TestAuditPanel';
import { LiveActivityPanel } from '@/components/LiveActivityPanel';
import { AgentPanel } from '@/components/AgentPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAIKernel } from '@/hooks/use-ai-kernel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Play, Square, SkipForward, Pause, RotateCcw, Zap, Brain, Bot } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const [useAI, setUseAI] = useState(true);
  const { state, activities, isRunning, startRun, step, runToCompletion, requestStop, pause, resume, reset } = useAIKernel('default', useAI, true);

  const handleStartDemo = useCallback(async () => {
    try {
      await startRun([
        { title: 'Analyze system architecture', prompt: 'Review the current system architecture and identify areas for improvement. Consider scalability, maintainability, and performance.', priority: 80, acceptance_criteria: [{ description: 'Identifies at least 3 improvement areas', type: 'custom' as const, id: 'ac1', config: {}, required: true }, { description: 'Provides actionable recommendations', type: 'custom' as const, id: 'ac2', config: {}, required: true }] },
        { title: 'Design context management strategy', prompt: 'Create a strategy for managing context across long-running AI sessions. Address token limits, priority-based pruning, and knowledge persistence.', priority: 70, acceptance_criteria: [{ description: 'Addresses token budget constraints', type: 'custom' as const, id: 'ac3', config: {}, required: true }, { description: 'Includes pruning policy', type: 'custom' as const, id: 'ac4', config: {}, required: true }] },
        { title: 'Implement self-improvement protocol', prompt: 'Define a protocol for the AI system to identify and apply process improvements after each task cycle.', priority: 60, acceptance_criteria: [{ description: 'Protocol is iterative and measurable', type: 'custom' as const, id: 'ac5', config: {}, required: true }] },
      ]);
      toast.success('Run started with 3 tasks');
    } catch (e) {
      toast.error(`Failed to start: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }, [startRun]);

  const handleStep = useCallback(async () => {
    try {
      const result = await step();
      if (result.completed) toast.info('Run completed');
      else if (result.error) toast.warning(result.error);
    } catch (e) { toast.error(`Step failed: ${e instanceof Error ? e.message : 'unknown'}`); }
  }, [step]);

  const handleRunAll = useCallback(async () => {
    try { await runToCompletion(1000); toast.success('Run completed'); } 
    catch (e) { toast.error(`Run failed: ${e instanceof Error ? e.message : 'unknown'}`); }
  }, [runToCompletion]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-surface-1 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">OS</span>
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">AIM-OS Orchestration</h1>
            <p className="text-xs text-muted-foreground">Self-Evolving AI System • Powered by Lovable Cloud</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="ai-mode" checked={useAI} onCheckedChange={setUseAI} disabled={isRunning} />
              <Label htmlFor="ai-mode" className="text-xs flex items-center gap-1">
                <Brain className="h-3 w-3" /> {useAI ? 'AI Mode' : 'Stub Mode'}
              </Label>
            </div>
            {state?.run_id && (
              <Badge variant="outline" className="text-xs font-mono">
                Run: {state.run_id.slice(0, 8)} • Iter: {state.iteration}
              </Badge>
            )}
            <Badge variant={isRunning ? 'default' : 'secondary'} className="text-xs">
              {state?.status || 'idle'}
            </Badge>
          </div>
        </div>
        {/* Run Controls */}
        <div className="flex items-center gap-2 mt-2">
          {!state?.run_id || state.status === 'idle' || state.status === 'stopped' ? (
            <Button size="sm" onClick={handleStartDemo} className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> Start Demo Run
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={handleStep} disabled={!isRunning} className="gap-1">
                <SkipForward className="h-3.5 w-3.5" /> Step
              </Button>
              <Button size="sm" onClick={handleRunAll} disabled={!isRunning} className="gap-1">
                <Zap className="h-3.5 w-3.5" /> Run All
              </Button>
              {isRunning ? (
                <Button size="sm" variant="outline" onClick={() => pause()} className="gap-1">
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
              ) : state?.status === 'paused' ? (
                <Button size="sm" variant="outline" onClick={() => resume()} className="gap-1">
                  <Play className="h-3.5 w-3.5" /> Resume
                </Button>
              ) : null}
              <Button size="sm" variant="destructive" onClick={() => requestStop('User stop')} disabled={!isRunning} className="gap-1">
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={reset} disabled={isRunning} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-hidden">
        <Tabs defaultValue="orchestration" className="h-full flex flex-col">
          <TabsList className="bg-surface-1 mb-4 self-start">
            <TabsTrigger value="orchestration">Orchestration</TabsTrigger>
            <TabsTrigger value="activity">Live Activity</TabsTrigger>
            <TabsTrigger value="journal">AI Journal</TabsTrigger>
            <TabsTrigger value="tests">Test Harness</TabsTrigger>
            <TabsTrigger value="audit">Test Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="orchestration" className="flex-1 mt-0 min-h-0">
            <div className="grid grid-cols-12 gap-4 h-full">
              <div className="col-span-5 h-[calc(100vh-260px)]"><TaskQueuePanel /></div>
              <div className="col-span-4 h-[calc(100vh-260px)]"><EventLogPanel /></div>
              <div className="col-span-3 space-y-4"><BudgetPanel /><ContextPanel /></div>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-260px)] border border-border rounded-lg bg-surface-1 overflow-hidden">
              <LiveActivityPanel activities={activities} />
            </div>
          </TabsContent>

          <TabsContent value="journal" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-260px)]"><JournalPanel /></div>
          </TabsContent>

          <TabsContent value="tests" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-260px)]"><TestHarnessPanel /></div>
          </TabsContent>

          <TabsContent value="audit" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-260px)]"><TestAuditPanel /></div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
