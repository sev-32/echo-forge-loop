// ============================================
// Real-time Metrics Hook — binds DB data to UI
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveMetrics {
  totalRuns: number;
  totalTokens: number;
  totalTasks: number;
  tasksPassed: number;
  avgScore: number | null;
  activeRules: number;
  knowledgeNodes: number;
  knowledgeEdges: number;
  contradictions: number;
  atoms: number;
  witnesses: number;
  latestRunId: string | null;
  latestRunStatus: string | null;
  cognitiveLoad: number;
  driftDetected: boolean;
  lastUpdated: number;
}

const EMPTY_METRICS: LiveMetrics = {
  totalRuns: 0, totalTokens: 0, totalTasks: 0, tasksPassed: 0,
  avgScore: null, activeRules: 0, knowledgeNodes: 0, knowledgeEdges: 0,
  contradictions: 0, atoms: 0, witnesses: 0,
  latestRunId: null, latestRunStatus: null,
  cognitiveLoad: 0, driftDetected: false, lastUpdated: Date.now(),
};

export function useLiveMetrics(pollIntervalMs = 5000) {
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [
        { count: runCount },
        { data: runAgg },
        { count: taskCount },
        { count: ruleCount },
        { count: nodeCount },
        { count: edgeCount },
        { count: contraCount },
        { count: atomCount },
        { count: witnessCount },
        { data: latestRun },
        { data: latestCog },
      ] = await Promise.all([
        supabase.from('run_traces').select('*', { count: 'exact', head: true }),
        supabase.from('run_traces').select('total_tokens, tasks_passed, avg_score').order('created_at', { ascending: false }).limit(20),
        supabase.from('tasks').select('*', { count: 'exact', head: true }),
        supabase.from('process_rules').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('knowledge_nodes').select('*', { count: 'exact', head: true }),
        supabase.from('knowledge_edges').select('*', { count: 'exact', head: true }),
        supabase.from('contradictions').select('*', { count: 'exact', head: true }),
        supabase.from('atoms').select('*', { count: 'exact', head: true }),
        supabase.from('witness_envelopes').select('*', { count: 'exact', head: true }),
        supabase.from('run_traces').select('run_id, status').order('created_at', { ascending: false }).limit(1),
        supabase.from('cognitive_snapshots').select('cognitive_load, drift_detected').order('created_at', { ascending: false }).limit(1),
      ]);

      const totalTokens = (runAgg || []).reduce((s, r) => s + (r.total_tokens || 0), 0);
      const totalPassed = (runAgg || []).reduce((s, r) => s + (r.tasks_passed || 0), 0);
      const scores = (runAgg || []).filter(r => r.avg_score != null).map(r => r.avg_score as number);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      setMetrics({
        totalRuns: runCount ?? 0,
        totalTokens,
        totalTasks: taskCount ?? 0,
        tasksPassed: totalPassed,
        avgScore,
        activeRules: ruleCount ?? 0,
        knowledgeNodes: nodeCount ?? 0,
        knowledgeEdges: edgeCount ?? 0,
        contradictions: contraCount ?? 0,
        atoms: atomCount ?? 0,
        witnesses: witnessCount ?? 0,
        latestRunId: latestRun?.[0]?.run_id ?? null,
        latestRunStatus: latestRun?.[0]?.status ?? null,
        cognitiveLoad: latestCog?.[0]?.cognitive_load ?? 0,
        driftDetected: latestCog?.[0]?.drift_detected ?? false,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      console.error('Live metrics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  return { metrics, loading, refresh };
}
