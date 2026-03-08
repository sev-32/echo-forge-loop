// ============================================
// VIF: Verifiable Intelligence Framework — Trust Layer
// ============================================
// Every AI operation gets a "witness envelope" — a cryptographic record
// of what was asked, what context was provided, what was returned,
// and how confident the system is. κ-gating prevents low-confidence
// outputs from being accepted.

import { supabase } from '@/integrations/supabase/client';

// ============================================
// Types
// ============================================

export type VIFOperationType = 'plan' | 'execute' | 'verify' | 'reflect' | 'critique' | 'retrieve' | 'build';
export type ConfidenceBand = 'A' | 'B' | 'C';
export type KappaGateResult = 'pass' | 'abstain' | 'fail';

export interface WitnessEnvelope {
  id: string;
  operation_type: VIFOperationType;
  model_id: string;
  prompt_hash: string;
  context_hash: string;
  response_hash: string;
  confidence_score: number;
  confidence_band: ConfidenceBand;
  kappa_gate_result: KappaGateResult;
  kappa_threshold: number;
  ece_contribution: number | null;
  actual_accuracy: number | null;
  atom_id: string | null;
  run_id: string | null;
  task_id: string | null;
  plan_step_id: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ECEDataPoint {
  id: string;
  run_id: string;
  witness_id: string;
  predicted_confidence: number;
  actual_accuracy: number | null;
  bin: number;
  operation_type: VIFOperationType;
  model_id: string;
  created_at: string;
}

// ============================================
// Hash Utility
// ============================================

async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// κ-Gating Configuration
// ============================================

const DEFAULT_KAPPA_THRESHOLDS: Record<VIFOperationType, number> = {
  plan: 0.70,
  execute: 0.65,
  verify: 0.80,
  reflect: 0.60,
  critique: 0.75,
  retrieve: 0.50,
  build: 0.65,
};

// ============================================
// Confidence Band Computation
// ============================================

function computeConfidenceBand(score: number): ConfidenceBand {
  if (score >= 0.95) return 'A';
  if (score >= 0.80) return 'B';
  return 'C';
}

function computeKappaGateResult(score: number, threshold: number): KappaGateResult {
  if (score >= threshold) return 'pass';
  if (score >= threshold * 0.7) return 'abstain'; // gray zone
  return 'fail';
}

// ============================================
// VIF Service
// ============================================

export class VerifiableIntelligenceFramework {

  // --- Create Witness Envelope ---

  async createWitness(params: {
    operation_type: VIFOperationType;
    model_id: string;
    prompt: string;
    context: string;
    response: string;
    confidence_score: number;
    atom_id?: string;
    run_id?: string;
    task_id?: string;
    plan_step_id?: string;
    input_tokens?: number;
    output_tokens?: number;
    latency_ms?: number;
    metadata?: Record<string, unknown>;
  }): Promise<WitnessEnvelope | null> {
    const [prompt_hash, context_hash, response_hash] = await Promise.all([
      sha256(params.prompt),
      sha256(params.context || ''),
      sha256(params.response),
    ]);

    const threshold = DEFAULT_KAPPA_THRESHOLDS[params.operation_type] ?? 0.70;
    const confidence_band = computeConfidenceBand(params.confidence_score);
    const kappa_gate_result = computeKappaGateResult(params.confidence_score, threshold);
    const bin = Math.min(9, Math.floor(params.confidence_score * 10));

    const { data, error } = await supabase
      .from('witness_envelopes')
      .insert({
        operation_type: params.operation_type,
        model_id: params.model_id,
        prompt_hash,
        context_hash,
        response_hash,
        confidence_score: params.confidence_score,
        confidence_band,
        kappa_gate_result,
        kappa_threshold: threshold,
        atom_id: params.atom_id ?? null,
        run_id: params.run_id ?? null,
        task_id: params.task_id ?? null,
        plan_step_id: params.plan_step_id ?? null,
        input_tokens: params.input_tokens ?? 0,
        output_tokens: params.output_tokens ?? 0,
        latency_ms: params.latency_ms ?? null,
        metadata: params.metadata ?? {},
      })
      .select()
      .single();

    if (error) { console.error('VIF: witness creation error:', error); return null; }

    const witness = data as unknown as WitnessEnvelope;

    // Also create ECE tracking point
    await supabase.from('ece_tracking').insert({
      run_id: params.run_id ?? 'unknown',
      witness_id: witness.id,
      predicted_confidence: params.confidence_score,
      bin,
      operation_type: params.operation_type,
      model_id: params.model_id,
    });

    return witness;
  }

  // --- Queries ---

  async getWitnessesByRun(runId: string): Promise<WitnessEnvelope[]> {
    const { data, error } = await supabase
      .from('witness_envelopes')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    if (error) { console.error('VIF: fetch witnesses error:', error); return []; }
    return (data ?? []) as unknown as WitnessEnvelope[];
  }

  async getRecentWitnesses(limit = 50): Promise<WitnessEnvelope[]> {
    const { data, error } = await supabase
      .from('witness_envelopes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) { console.error('VIF: recent witnesses error:', error); return []; }
    return (data ?? []) as unknown as WitnessEnvelope[];
  }

  async getWitnessByTask(taskId: string): Promise<WitnessEnvelope[]> {
    const { data, error } = await supabase
      .from('witness_envelopes')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) { console.error('VIF: task witnesses error:', error); return []; }
    return (data ?? []) as unknown as WitnessEnvelope[];
  }

  // --- κ-Gate Check (pure function) ---

  checkKappaGate(confidence: number, operationType: VIFOperationType): {
    result: KappaGateResult;
    band: ConfidenceBand;
    threshold: number;
  } {
    const threshold = DEFAULT_KAPPA_THRESHOLDS[operationType] ?? 0.70;
    return {
      result: computeKappaGateResult(confidence, threshold),
      band: computeConfidenceBand(confidence),
      threshold,
    };
  }

  // --- ECE Calibration ---

  async getECEData(options?: { run_id?: string; model_id?: string }): Promise<ECEDataPoint[]> {
    let query = supabase.from('ece_tracking').select('*');

    if (options?.run_id) query = query.eq('run_id', options.run_id);
    if (options?.model_id) query = query.eq('model_id', options.model_id);

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) { console.error('VIF: ECE data error:', error); return []; }
    return (data ?? []) as unknown as ECEDataPoint[];
  }

  async computeECE(options?: { run_id?: string; model_id?: string }): Promise<{
    ece: number;
    bins: { bin: number; avgConfidence: number; avgAccuracy: number; count: number }[];
  }> {
    const points = await this.getECEData(options);
    const withAccuracy = points.filter(p => p.actual_accuracy !== null);

    if (withAccuracy.length === 0) {
      return { ece: 0, bins: [] };
    }

    // 10-bin calibration
    const bins: { bin: number; confidenceSum: number; accuracySum: number; count: number }[] = [];
    for (let i = 0; i < 10; i++) {
      bins.push({ bin: i, confidenceSum: 0, accuracySum: 0, count: 0 });
    }

    for (const p of withAccuracy) {
      const b = Math.min(9, Math.floor(p.predicted_confidence * 10));
      bins[b].confidenceSum += p.predicted_confidence;
      bins[b].accuracySum += p.actual_accuracy!;
      bins[b].count += 1;
    }

    let ece = 0;
    const total = withAccuracy.length;
    const result = bins.map(b => {
      const avgConfidence = b.count > 0 ? b.confidenceSum / b.count : 0;
      const avgAccuracy = b.count > 0 ? b.accuracySum / b.count : 0;
      ece += (b.count / total) * Math.abs(avgAccuracy - avgConfidence);
      return { bin: b.bin, avgConfidence, avgAccuracy, count: b.count };
    });

    return { ece, bins: result };
  }

  // --- Statistics ---

  async getStats(): Promise<{
    totalWitnesses: number;
    byBand: Record<string, number>;
    byGateResult: Record<string, number>;
    byOperation: Record<string, number>;
    avgConfidence: number;
  }> {
    const { data, error } = await supabase
      .from('witness_envelopes')
      .select('confidence_band, kappa_gate_result, operation_type, confidence_score');

    if (error) { console.error('VIF: stats error:', error); return { totalWitnesses: 0, byBand: {}, byGateResult: {}, byOperation: {}, avgConfidence: 0 }; }

    const witnesses = data ?? [];
    const byBand: Record<string, number> = {};
    const byGateResult: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let totalConfidence = 0;

    for (const w of witnesses) {
      const wb = (w as any);
      byBand[wb.confidence_band] = (byBand[wb.confidence_band] || 0) + 1;
      byGateResult[wb.kappa_gate_result] = (byGateResult[wb.kappa_gate_result] || 0) + 1;
      byOperation[wb.operation_type] = (byOperation[wb.operation_type] || 0) + 1;
      totalConfidence += wb.confidence_score;
    }

    return {
      totalWitnesses: witnesses.length,
      byBand,
      byGateResult,
      byOperation,
      avgConfidence: witnesses.length > 0 ? totalConfidence / witnesses.length : 0,
    };
  }
}

// Singleton
export const vif = new VerifiableIntelligenceFramework();
