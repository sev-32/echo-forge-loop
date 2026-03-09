// ============================================
// React Hooks for Orchestration System
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { createKernel, OrchestrationKernel, KernelStatus } from '@/lib/orchestration-kernel';
import { eventStore } from '@/lib/event-store';
import { taskQueue } from '@/lib/task-queue';
import { governor } from '@/lib/autonomy-governor';
import { contextManager } from '@/lib/context-manager';
import { verifier } from '@/lib/verifier';
import { testHarness } from '@/lib/test-harness';
import type { 
  Event, 
  Task, 
  Snapshot, 
  BudgetState, 
  KernelState,
  TestSpec,
  TestResult,
  AuditEntry,
  ContextItem,
  ArtifactRef
} from '@/types/orchestration';

// Hook for kernel state
export function useKernel(projectId: string = 'default') {
  const kernelRef = useRef<OrchestrationKernel | null>(null);
  const [state, setState] = useState<KernelState | null>(null);
  const [status, setStatus] = useState<KernelStatus>('idle');

  useEffect(() => {
    kernelRef.current = createKernel({
      projectId,
      onStateChange: (newState) => {
        setState(newState);
        setStatus(newState.status);
      },
    });
  }, [projectId]);

  const startRun = useCallback((initialTasks?: Partial<Task>[]) => {
    if (kernelRef.current) {
      return kernelRef.current.startRun(initialTasks);
    }
    return '';
  }, []);

  const step = useCallback(async () => {
    if (kernelRef.current) {
      return kernelRef.current.step();
    }
    return { completed: true, error: 'Kernel not initialized' };
  }, []);

  const requestStop = useCallback((reason?: string) => {
    if (kernelRef.current) {
      kernelRef.current.requestStop(reason);
    }
  }, []);

  const pause = useCallback(() => {
    if (kernelRef.current) {
      kernelRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (kernelRef.current) {
      kernelRef.current.resume();
    }
  }, []);

  const reset = useCallback(() => {
    if (kernelRef.current) {
      kernelRef.current.reset();
      setState(null);
      setStatus('idle');
    }
  }, []);

  const runToCompletion = useCallback(async (stepDelayMs?: number) => {
    if (kernelRef.current) {
      await kernelRef.current.runToCompletion(stepDelayMs);
    }
  }, []);

  const createCheckpoint = useCallback((reason: string) => {
    if (kernelRef.current) {
      return kernelRef.current.createCheckpoint(reason);
    }
    return null;
  }, []);

  const exportBundle = useCallback(() => {
    if (kernelRef.current) {
      return kernelRef.current.exportBundle();
    }
    return null;
  }, []);

  return {
    state,
    status,
    startRun,
    step,
    requestStop,
    pause,
    resume,
    reset,
    runToCompletion,
    createCheckpoint,
    exportBundle,
    kernel: kernelRef.current,
  };
}

// Hook for task queue
export function useTaskQueue() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState(taskQueue.getStats());

  const refresh = useCallback(() => {
    setTasks(taskQueue.getAllTasks());
    setStats(taskQueue.getStats());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [refresh]);

  const createTask = useCallback((runId: string, title: string, prompt: string, options?: Parameters<typeof taskQueue.createTask>[3]) => {
    const task = taskQueue.createTask(runId, title, prompt, options);
    refresh();
    return task;
  }, [refresh]);

  const updateStatus = useCallback((runId: string, taskId: string, status: Task['status'], reason: string) => {
    const task = taskQueue.updateStatus(runId, taskId, status, reason);
    refresh();
    return task;
  }, [refresh]);

  const reprioritize = useCallback((runId: string, taskId: string, priority: number, justification: string) => {
    const task = taskQueue.reprioritize(runId, taskId, priority, justification);
    refresh();
    return task;
  }, [refresh]);

  return {
    tasks,
    stats,
    refresh,
    createTask,
    updateStatus,
    reprioritize,
    getNextTask: taskQueue.getNextTask.bind(taskQueue),
    getExecutionOrder: taskQueue.getExecutionOrder.bind(taskQueue),
    getDAGEdges: taskQueue.getDAGEdges.bind(taskQueue),
  };
}

// Hook for events
export function useEvents() {
  const [events, setEvents] = useState<Event[]>([]);

  const refresh = useCallback(() => {
    setEvents(eventStore.getEvents());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    events,
    refresh,
    getEventsByType: eventStore.getEventsByType.bind(eventStore),
    getEventsByRun: eventStore.getEventsByRun.bind(eventStore),
    verifyIntegrity: eventStore.verifyIntegrity.bind(eventStore),
    getEventCount: eventStore.getEventCount.bind(eventStore),
  };
}

// Hook for system events (live feed format)
export function useSystemEvents() {
  const [events, setEvents] = useState<{ type: string; content: string; timestamp: Date }[]>([]);

  useEffect(() => {
    const refresh = () => {
      const rawEvents = eventStore.getEvents();
      setEvents(
        rawEvents.slice(-100).map((e) => ({
          type: e.type,
          content: typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload).slice(0, 100),
          timestamp: new Date(e.timestamp),
        }))
      );
    };
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, []);

  return events;
}

// Hook for budget state
export function useBudget() {
  const [budgetState, setBudgetState] = useState<BudgetState>(governor.getBudgetState());

  useEffect(() => {
    const interval = setInterval(() => {
      setBudgetState(governor.getBudgetState());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return {
    budgetState,
    canContinue: governor.canContinue.bind(governor),
    isStopRequested: governor.isStopRequested.bind(governor),
    getMode: governor.getMode.bind(governor),
    setMode: governor.setMode.bind(governor),
    requestStop: governor.requestStop.bind(governor),
  };
}

// Hook for snapshots
export function useSnapshots() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  const refresh = useCallback(() => {
    setSnapshots(eventStore.getSnapshots());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    snapshots,
    refresh,
    getLatestSnapshot: eventStore.getLatestSnapshot.bind(eventStore),
    replayFromSnapshot: eventStore.replayFromSnapshot.bind(eventStore),
  };
}

// Hook for context manager
export function useContext() {
  const [pinnedContext, setPinnedContext] = useState<ContextItem[]>([]);
  const [workingContext, setWorkingContext] = useState<ContextItem[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
  const [stats, setStats] = useState(contextManager.getStats());

  const refresh = useCallback(() => {
    setPinnedContext(contextManager.getPinnedContext());
    setWorkingContext(contextManager.getWorkingContext());
    setArtifacts(contextManager.getArtifacts());
    setStats(contextManager.getStats());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    pinnedContext,
    workingContext,
    artifacts,
    stats,
    refresh,
    pinContext: contextManager.pinContext.bind(contextManager),
    addToWorking: contextManager.addToWorking.bind(contextManager),
    searchLongTerm: contextManager.searchLongTerm.bind(contextManager),
  };
}

// Hook for verifier
export function useVerifier() {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const refresh = useCallback(() => {
    setAuditEntries(verifier.getAuditEntries());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    auditEntries,
    refresh,
    addAuditEntry: verifier.addAuditEntry.bind(verifier),
    resolveAuditEntry: verifier.resolveAuditEntry.bind(verifier),
    checkContradiction: verifier.checkContradiction.bind(verifier),
  };
}

// Hook for test harness
export function useTestHarness() {
  const [specs, setSpecs] = useState<TestSpec[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);

  useEffect(() => {
    setSpecs(testHarness.getSpecs());
    setResults(testHarness.getAllResults());
  }, []);

  const runTest = useCallback(async (testId: string) => {
    setRunning(true);
    setCurrentTest(testId);
    try {
      const result = await testHarness.runTest(testId);
      setResults(testHarness.getAllResults());
      return result;
    } finally {
      setRunning(false);
      setCurrentTest(null);
    }
  }, []);

  const runAllTests = useCallback(async () => {
    setRunning(true);
    try {
      const allResults = await testHarness.runAllTests();
      setResults(allResults);
    } catch (error) {
      console.error('Suite run failed:', error);
    }
    setRunning(false);
    setCurrentTest(null);
  }, []);

  const generateReport = useCallback(() => {
    return testHarness.generateReport();
  }, []);

  return {
    specs,
    results,
    running,
    currentTest,
    runTest,
    runAllTests,
    generateReport,
  };
}
