// ============================================
// useIONKernel — React hook for ION v2 daemon control
// ============================================

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeRefresh } from './use-realtime-refresh';

export interface IONRun {
  id: string;
  goal: string;
  status: string;
  autonomy_mode: string;
  priority_tier: number;
  total_work_units: number;
  completed_work_units: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  stopped_at: string | null;
  config: any;
  metadata: any;
}

export interface IONWorkUnit {
  id: string;
  run_id: string;
  protocol: string;
  shard_index: number;
  status: string;
  priority: number;
  title: string;
  description: string;
  dependencies: string[];
  input_data: any;
  result_data: any;
  error: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface IONArtifact {
  id: string;
  run_id: string;
  name: string;
  content: string;
  authority_class: string;
  version: number;
  artifact_type: string;
  created_at: string;
}

export interface IONOpenQuestion {
  id: string;
  run_id: string;
  question: string;
  status: string;
  answer: string | null;
  priority: number;
  created_at: string;
}

export interface IONSignal {
  id: string;
  run_id: string;
  signal_type: string;
  target_protocol: string | null;
  payload: any;
  consumed: boolean;
  created_at: string;
}

export interface IONDelta {
  id: string;
  work_unit_id: string;
  run_id: string;
  status: string;
  confidence: number;
  artifacts_created: any[];
  questions_raised: any[];
  signals_emitted: any[];
  contradictions_found: any[];
  created_at: string;
}

export interface IONState {
  run: IONRun | null;
  work_units: IONWorkUnit[];
  deltas: IONDelta[];
  questions: IONOpenQuestion[];
  signals: IONSignal[];
  artifacts: IONArtifact[];
}

export function useIONKernel() {
  const [runs, setRuns] = useState<IONRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [state, setState] = useState<IONState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepLog, setStepLog] = useState<any[]>([]);
  const pollingRef = useRef(false);

  const invoke = useCallback(async (action: string, params: any = {}) => {
    const { data, error: fnErr } = await supabase.functions.invoke('ion-daemon', {
      body: { action, ...params },
    });
    if (fnErr) throw new Error(fnErr.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refreshState = useCallback(async () => {
    if (!activeRunId) return;
    try {
      const data = await invoke('get_state', { run_id: activeRunId });
      setState(data);
    } catch (e) {
      console.error('Failed to refresh ION state:', e);
    }
  }, [activeRunId, invoke]);

  const refreshRuns = useCallback(async () => {
    try {
      const data = await invoke('list_runs');
      setRuns(data.runs || []);
    } catch (e) {
      console.error('Failed to list ION runs:', e);
    }
  }, [invoke]);

  // Realtime subscriptions
  useRealtimeRefresh(refreshState, {
    tables: ['ion_work_units', 'ion_commit_deltas', 'ion_open_questions', 'ion_signals', 'ion_artifacts'],
    events: ['INSERT', 'UPDATE'],
    debounceMs: 500,
    enabled: !!activeRunId,
  });

  useRealtimeRefresh(refreshRuns, {
    tables: ['ion_runs'],
    events: ['INSERT', 'UPDATE'],
    debounceMs: 1000,
    enabled: true,
  });

  const startRun = useCallback(async (goal: string, config?: any) => {
    setLoading(true);
    setError(null);
    setStepLog([]);
    try {
      const data = await invoke('start_run', { goal, config });
      setActiveRunId(data.run.id);
      await refreshRuns();
      await refreshState();
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [invoke, refreshRuns, refreshState]);

  const step = useCallback(async () => {
    if (!activeRunId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invoke('step', { run_id: activeRunId });
      setStepLog(prev => [...prev, { ...data, timestamp: new Date().toISOString() }]);
      await refreshState();
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [activeRunId, invoke, refreshState]);

  const runToCompletion = useCallback(async (maxSteps = 10) => {
    if (!activeRunId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invoke('run_to_completion', { run_id: activeRunId, max_steps: maxSteps });
      setStepLog(prev => [...prev, ...data.steps.map((s: any) => ({ ...s, timestamp: new Date().toISOString() }))]);
      await refreshState();
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [activeRunId, invoke, refreshState]);

  const reviewDelta = useCallback(async (deltaId: string, verdict: string, notes?: string) => {
    if (!activeRunId) return;
    setLoading(true);
    try {
      const data = await invoke('review_delta', { run_id: activeRunId, delta_id: deltaId, verdict, notes });
      await refreshState();
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [activeRunId, invoke, refreshState]);

  const stopRun = useCallback(async () => {
    if (!activeRunId) return;
    setLoading(true);
    try {
      await invoke('stop', { run_id: activeRunId });
      await refreshState();
      await refreshRuns();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeRunId, invoke, refreshState, refreshRuns]);

  const selectRun = useCallback(async (runId: string) => {
    setActiveRunId(runId);
    setStepLog([]);
    try {
      const data = await invoke('get_state', { run_id: runId });
      setState(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, [invoke]);

  const answerQuestion = useCallback(async (questionId: string, answer: string) => {
    if (!activeRunId) return;
    setLoading(true);
    try {
      const data = await invoke('answer_question', { run_id: activeRunId, question_id: questionId, answer });
      await refreshState();
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [activeRunId, invoke, refreshState]);

  const emitSignal = useCallback(async (signalType: string, payload: any, targetProtocol?: string) => {
    if (!activeRunId) return;
    setLoading(true);
    try {
      const data = await invoke('emit_signal', { run_id: activeRunId, signal_type: signalType, payload, target_protocol: targetProtocol });
      await refreshState();
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [activeRunId, invoke, refreshState]);

  return {
    runs,
    activeRunId,
    state,
    loading,
    error,
    stepLog,
    startRun,
    step,
    runToCompletion,
    reviewDelta,
    stopRun,
    selectRun,
    refreshRuns,
    refreshState,
    answerQuestion,
    emitSignal,
  };
}
