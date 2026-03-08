// ============================================
// CAS: Cognitive Analysis System — Meta-Cognitive Monitoring
// ============================================
// Monitors the AI's cognitive state during execution:
// attention breadth, concept tracking, drift detection,
// failure mode analysis, and self-consistency.

import { supabase } from '@/integrations/supabase/client';

// ============================================
// Types
// ============================================

export type AttentionBreadth = 'narrow' | 'normal' | 'wide';
export type FailureMode = 
  | 'categorization_error'
  | 'activation_gap'
  | 'procedure_gap'
  | 'blind_spot'
  | 'anchoring_bias'
  | 'confirmation_bias'
  | 'shortcut_taking';

export interface CognitiveSnapshot {
  id: string;
  run_id: string;
  task_id: string | null;
  plan_step_id: string | null;
  cognitive_load: number;
  attention_breadth: AttentionBreadth;
  active_concepts: string[];
  cold_concepts: string[];
  concept_churn_rate: number;
  drift_detected: boolean;
  drift_score: number;
  drift_details: string | null;
  failure_mode: FailureMode | null;
  failure_confidence: number | null;
  failure_details: string | null;
  reasoning_depth: number;
  self_consistency_score: number;
  uncertainty_awareness: number;
  witness_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// CAS Service
// ============================================

export class CognitiveAnalysisSystem {

  // --- Snapshot Creation ---

  async createSnapshot(params: {
    run_id: string;
    task_id?: string;
    plan_step_id?: string;
    cognitive_load?: number;
    attention_breadth?: AttentionBreadth;
    active_concepts?: string[];
    cold_concepts?: string[];
    concept_churn_rate?: number;
    drift_detected?: boolean;
    drift_score?: number;
    drift_details?: string;
    failure_mode?: FailureMode;
    failure_confidence?: number;
    failure_details?: string;
    reasoning_depth?: number;
    self_consistency_score?: number;
    uncertainty_awareness?: number;
    witness_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CognitiveSnapshot | null> {
    const { data, error } = await supabase
      .from('cognitive_snapshots')
      .insert({
        run_id: params.run_id,
        task_id: params.task_id ?? null,
        plan_step_id: params.plan_step_id ?? null,
        cognitive_load: params.cognitive_load ?? 0.0,
        attention_breadth: params.attention_breadth ?? 'normal',
        active_concepts: params.active_concepts ?? [],
        cold_concepts: params.cold_concepts ?? [],
        concept_churn_rate: params.concept_churn_rate ?? 0.0,
        drift_detected: params.drift_detected ?? false,
        drift_score: params.drift_score ?? 0.0,
        drift_details: params.drift_details ?? null,
        failure_mode: params.failure_mode ?? null,
        failure_confidence: params.failure_confidence ?? null,
        failure_details: params.failure_details ?? null,
        reasoning_depth: params.reasoning_depth ?? 0,
        self_consistency_score: params.self_consistency_score ?? 1.0,
        uncertainty_awareness: params.uncertainty_awareness ?? 0.5,
        witness_id: params.witness_id ?? null,
        metadata: params.metadata ?? {},
      })
      .select()
      .single();

    if (error) { console.error('CAS: snapshot creation error:', error); return null; }
    return data as unknown as CognitiveSnapshot;
  }

  // --- Queries ---

  async getSnapshotsByRun(runId: string): Promise<CognitiveSnapshot[]> {
    const { data, error } = await supabase
      .from('cognitive_snapshots')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    if (error) { console.error('CAS: fetch snapshots error:', error); return []; }
    return (data ?? []) as unknown as CognitiveSnapshot[];
  }

  async getRecentSnapshots(limit = 50): Promise<CognitiveSnapshot[]> {
    const { data, error } = await supabase
      .from('cognitive_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) { console.error('CAS: recent snapshots error:', error); return []; }
    return (data ?? []) as unknown as CognitiveSnapshot[];
  }

  async getDriftAlerts(runId?: string): Promise<CognitiveSnapshot[]> {
    let query = supabase
      .from('cognitive_snapshots')
      .select('*')
      .eq('drift_detected', true)
      .order('created_at', { ascending: false });

    if (runId) query = query.eq('run_id', runId);

    const { data, error } = await query;
    if (error) { console.error('CAS: drift alerts error:', error); return []; }
    return (data ?? []) as unknown as CognitiveSnapshot[];
  }

  async getFailureModes(runId?: string): Promise<CognitiveSnapshot[]> {
    let query = supabase
      .from('cognitive_snapshots')
      .select('*')
      .not('failure_mode', 'is', null)
      .order('created_at', { ascending: false });

    if (runId) query = query.eq('run_id', runId);

    const { data, error } = await query;
    if (error) { console.error('CAS: failure modes error:', error); return []; }
    return (data ?? []) as unknown as CognitiveSnapshot[];
  }

  // --- Statistics ---

  async getStats(): Promise<{
    totalSnapshots: number;
    avgCognitiveLoad: number;
    driftCount: number;
    failureModes: Record<string, number>;
    avgConsistency: number;
    avgUncertaintyAwareness: number;
    attentionDistribution: Record<string, number>;
  }> {
    const { data, error } = await supabase
      .from('cognitive_snapshots')
      .select('cognitive_load, drift_detected, failure_mode, self_consistency_score, uncertainty_awareness, attention_breadth');

    if (error) { console.error('CAS: stats error:', error); return { totalSnapshots: 0, avgCognitiveLoad: 0, driftCount: 0, failureModes: {}, avgConsistency: 0, avgUncertaintyAwareness: 0, attentionDistribution: {} }; }

    const snapshots = data ?? [];
    let totalLoad = 0, totalConsistency = 0, totalUncertainty = 0, driftCount = 0;
    const failureModes: Record<string, number> = {};
    const attentionDistribution: Record<string, number> = {};

    for (const s of snapshots) {
      const snap = s as any;
      totalLoad += snap.cognitive_load;
      totalConsistency += snap.self_consistency_score;
      totalUncertainty += snap.uncertainty_awareness;
      if (snap.drift_detected) driftCount++;
      if (snap.failure_mode) failureModes[snap.failure_mode] = (failureModes[snap.failure_mode] || 0) + 1;
      attentionDistribution[snap.attention_breadth] = (attentionDistribution[snap.attention_breadth] || 0) + 1;
    }

    const n = snapshots.length || 1;
    return {
      totalSnapshots: snapshots.length,
      avgCognitiveLoad: totalLoad / n,
      driftCount,
      failureModes,
      avgConsistency: totalConsistency / n,
      avgUncertaintyAwareness: totalUncertainty / n,
      attentionDistribution,
    };
  }
}

// Singleton
export const cas = new CognitiveAnalysisSystem();
