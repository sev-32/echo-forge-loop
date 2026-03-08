// ============================================
// SDF-CVF: Quartet Parity / Evolution Tracking
// ============================================
// Tracks co-evolution of code, docs, tests, and traces.
// Computes parity scores and DORA metrics.

import { supabase } from '@/integrations/supabase/client';

// ============================================
// Types
// ============================================

export type GateResult = 'pass' | 'fail' | 'warn' | 'abstain';
export type DORATier = 'elite' | 'high' | 'medium' | 'low';

export interface QuartetTrace {
  id: string;
  run_id: string;
  code_hash: string;
  docs_hash: string;
  tests_hash: string;
  trace_hash: string;
  parity_score: number;
  parity_details: Record<string, number>;
  gate_result: GateResult;
  gate_threshold: number;
  blast_radius: Record<string, unknown>;
  witness_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DORAMetrics {
  id: string;
  run_id: string;
  deployment_frequency: number;
  lead_time_seconds: number;
  restore_time_seconds: number;
  change_failure_rate: number;
  tier: DORATier;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// SDF-CVF Service
// ============================================

export class QuartetParityTracker {

  async createTrace(params: {
    run_id: string;
    code_hash: string;
    docs_hash: string;
    tests_hash: string;
    trace_hash: string;
    parity_details?: Record<string, number>;
    blast_radius?: Record<string, unknown>;
    witness_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<QuartetTrace | null> {
    // Compute parity score from 6 pairwise similarities
    const details = params.parity_details ?? {};
    const pairs = Object.values(details);
    const parity_score = pairs.length > 0 ? pairs.reduce((a, b) => a + b, 0) / pairs.length : 0;
    const gate_threshold = 0.90;
    const gate_result: GateResult = parity_score >= gate_threshold ? 'pass' : parity_score >= 0.75 ? 'warn' : 'fail';

    const { data, error } = await supabase
      .from('quartet_traces')
      .insert({
        run_id: params.run_id,
        code_hash: params.code_hash,
        docs_hash: params.docs_hash,
        tests_hash: params.tests_hash,
        trace_hash: params.trace_hash,
        parity_score,
        parity_details: params.parity_details ?? {},
        gate_result,
        gate_threshold,
        blast_radius: params.blast_radius ?? {},
        witness_id: params.witness_id ?? null,
        metadata: params.metadata ?? {},
      } as any)
      .select()
      .single();

    if (error) { console.error('SDF-CVF: trace creation error:', error); return null; }
    return data as unknown as QuartetTrace;
  }

  async createDORAMetrics(params: {
    run_id: string;
    deployment_frequency: number;
    lead_time_seconds: number;
    restore_time_seconds: number;
    change_failure_rate: number;
    metadata?: Record<string, unknown>;
  }): Promise<DORAMetrics | null> {
    // Compute DORA tier
    const { deployment_frequency, lead_time_seconds, change_failure_rate } = params;
    let tier: DORATier = 'low';
    if (deployment_frequency >= 1 && lead_time_seconds < 3600 && change_failure_rate < 0.05) tier = 'elite';
    else if (deployment_frequency >= 0.14 && lead_time_seconds < 86400 && change_failure_rate < 0.15) tier = 'high';
    else if (deployment_frequency >= 0.03 && lead_time_seconds < 604800 && change_failure_rate < 0.30) tier = 'medium';

    const { data, error } = await supabase
      .from('dora_metrics')
      .insert({
        run_id: params.run_id,
        deployment_frequency: params.deployment_frequency,
        lead_time_seconds: params.lead_time_seconds,
        restore_time_seconds: params.restore_time_seconds,
        change_failure_rate: params.change_failure_rate,
        tier,
        metadata: params.metadata ?? {},
      } as any)
      .select()
      .single();

    if (error) { console.error('SDF-CVF: DORA creation error:', error); return null; }
    return data as unknown as DORAMetrics;
  }

  // --- Queries ---

  async getTraces(limit = 50): Promise<QuartetTrace[]> {
    const { data, error } = await supabase
      .from('quartet_traces')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) { console.error('SDF-CVF: traces error:', error); return []; }
    return (data ?? []) as unknown as QuartetTrace[];
  }

  async getDORAMetrics(limit = 50): Promise<DORAMetrics[]> {
    const { data, error } = await supabase
      .from('dora_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) { console.error('SDF-CVF: DORA error:', error); return []; }
    return (data ?? []) as unknown as DORAMetrics[];
  }

  async getStats(): Promise<{
    totalTraces: number;
    avgParity: number;
    parityTrend: number[];
    latestTier: DORATier;
    gateResults: Record<string, number>;
  }> {
    const [tracesRes, doraRes] = await Promise.all([
      supabase.from('quartet_traces').select('parity_score, gate_result').order('created_at', { ascending: true }),
      supabase.from('dora_metrics').select('tier').order('created_at', { ascending: false }).limit(1),
    ]);

    const traces = tracesRes.data ?? [];
    const gateResults: Record<string, number> = {};
    let totalParity = 0;
    const parityTrend: number[] = [];

    for (const t of traces) {
      const tr = t as any;
      totalParity += tr.parity_score;
      parityTrend.push(tr.parity_score);
      gateResults[tr.gate_result] = (gateResults[tr.gate_result] || 0) + 1;
    }

    return {
      totalTraces: traces.length,
      avgParity: traces.length > 0 ? totalParity / traces.length : 0,
      parityTrend,
      latestTier: ((doraRes.data?.[0] as any)?.tier ?? 'low') as DORATier,
      gateResults,
    };
  }
}

// Singleton
export const sdfCvf = new QuartetParityTracker();
