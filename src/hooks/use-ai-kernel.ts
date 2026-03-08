// ============================================
// React Hook for AI-Powered Kernel
// ============================================

import { useState, useCallback, useRef } from 'react';
import { createAIKernel, AIOrchestrationKernel, type AIKernelConfig, type ActivityEntry } from '@/lib/ai-kernel';
import type { Task, KernelState } from '@/types/orchestration';

export function useAIKernel(projectId: string = 'default', useAI = true, persistToCloud = true) {
  const kernelRef = useRef<AIOrchestrationKernel | null>(null);
  const [state, setState] = useState<KernelState | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const getKernel = useCallback(() => {
    if (!kernelRef.current) {
      kernelRef.current = createAIKernel({
        projectId,
        useAI,
        persistToCloud,
        onStateChange: (s) => { setState(s); setIsRunning(s.status === 'running'); },
        onActivity: (a) => { setActivities(prev => [...prev.slice(-199), a]); },
      });
    }
    return kernelRef.current;
  }, [projectId, useAI, persistToCloud]);

  const startRun = useCallback(async (tasks?: Partial<Task>[]) => {
    const k = getKernel();
    const runId = await k.startRun(tasks);
    setState(k.getState());
    setIsRunning(true);
    return runId;
  }, [getKernel]);

  const step = useCallback(async () => {
    const k = getKernel();
    return k.step();
  }, [getKernel]);

  const runToCompletion = useCallback(async (delayMs?: number) => {
    const k = getKernel();
    await k.runToCompletion(delayMs);
  }, [getKernel]);

  const requestStop = useCallback((reason?: string) => getKernel().requestStop(reason), [getKernel]);
  const pause = useCallback(() => getKernel().pause(), [getKernel]);
  const resume = useCallback(() => getKernel().resume(), [getKernel]);
  const reset = useCallback(() => { getKernel().reset(); setState(null); setActivities([]); setIsRunning(false); }, [getKernel]);

  return { state, activities, isRunning, startRun, step, runToCompletion, requestStop, pause, resume, reset, kernel: kernelRef.current };
}
