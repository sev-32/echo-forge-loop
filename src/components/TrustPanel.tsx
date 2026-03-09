// ============================================
// Trust Panel — VIF Witness Envelope Browser + κ-Gate + ECE
// Hasselblad X2D Aesthetic + Precision Instruments
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { vif, type WitnessEnvelope, type ConfidenceBand, type KappaGateResult } from '@/lib/vif';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GaugeRadial, Sparkline, CalibrationCurve } from '@/components/ui/instruments';
import { ShieldCheck, RefreshCw, Eye, Target, AlertTriangle, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

const BAND_COLORS: Record<ConfidenceBand, string> = {
  A: 'bg-status-success/20 text-status-success border-status-success/30',
  B: 'bg-status-warning/20 text-status-warning border-status-warning/30',
  C: 'bg-status-error/20 text-status-error border-status-error/30',
};

const GATE_ICONS: Record<KappaGateResult, typeof CheckCircle> = {
  pass: CheckCircle,
  abstain: MinusCircle,
  fail: XCircle,
};

const GATE_COLORS: Record<KappaGateResult, string> = {
  pass: 'text-status-success',
  abstain: 'text-status-warning',
  fail: 'text-status-error',
};

export function TrustPanel() {
  const [witnesses, setWitnesses] = useState<WitnessEnvelope[]>([]);
  const [selected, setSelected] = useState<WitnessEnvelope | null>(null);
  const [stats, setStats] = useState<{
    totalWitnesses: number;
    byBand: Record<string, number>;
    byGateResult: Record<string, number>;
    byOperation: Record<string, number>;
    avgConfidence: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [w, s] = await Promise.all([vif.getRecentWitnesses(100), vif.getStats()]);
    setWitnesses(w);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh(refresh, { tables: ['witness_envelopes', 'ece_tracking'], debounceMs: 1000 });

  // Confidence trend sparkline
  const confTrend = useMemo(() => 
    witnesses.slice(0, 30).map(w => w.confidence_score * 100).reverse(), 
    [witnesses]
  );

  // ECE calibration bins from witnesses
  const eceBins = useMemo(() => {
    if (witnesses.length === 0) return [];
    const binCount = 10;
    const bins: Record<number, { sum_predicted: number; sum_actual: number; count: number }> = {};
    for (let i = 0; i < binCount; i++) bins[i] = { sum_predicted: 0, sum_actual: 0, count: 0 };
    
    witnesses.forEach(w => {
      const binIdx = Math.min(Math.floor(w.confidence_score * binCount), binCount - 1);
      bins[binIdx].sum_predicted += w.confidence_score;
      bins[binIdx].sum_actual += w.actual_accuracy ?? w.confidence_score;
      bins[binIdx].count += 1;
    });
    
    return Object.entries(bins)
      .filter(([, b]) => b.count > 0)
      .map(([idx, b]) => ({
        predicted: b.sum_predicted / b.count,
        actual: b.sum_actual / b.count,
        count: b.count,
      }));
  }, [witnesses]);

  // κ-pass rate
  const kappaPassRate = stats ? ((stats.byGateResult.pass || 0) / Math.max(1, stats.totalWitnesses) * 100) : 0;

  return (
    <div className="h-full flex gap-3 p-3">
      {/* Left: Witness list + instruments */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-engraved">VIF — TRUST LAYER</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-6 w-6 rail-icon" onClick={refresh}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Gauge Cluster */}
        {stats && stats.totalWitnesses > 0 && (
          <div className="surface-well rounded p-3">
            <div className="flex items-center justify-around">
              <GaugeRadial
                value={stats.avgConfidence * 100}
                label="AVG CONF"
                sublabel={`${stats.totalWitnesses} witnesses`}
                size={68}
              />
              <GaugeRadial
                value={kappaPassRate}
                label="κ-PASS"
                size={68}
                color="success"
              />
              <div className="flex flex-col items-center gap-1">
                <span className="text-[8px] font-mono text-label-muted tracking-wider">CONF TREND</span>
                {confTrend.length >= 3 && (
                  <Sparkline data={confTrend} width={100} height={28} color="primary" showDots fill />
                )}
                {confTrend.length < 3 && <span className="text-[8px] text-label-engraved">insufficient data</span>}
              </div>
            </div>
          </div>
        )}

        {/* Band distribution */}
        {stats && stats.totalWitnesses > 0 && (
          <div className="flex gap-1">
            {(['A', 'B', 'C'] as ConfidenceBand[]).map(band => {
              const count = stats.byBand[band] || 0;
              const pct = (count / stats.totalWitnesses * 100).toFixed(0);
              return (
                <div key={band} className={`flex-1 text-center py-1.5 surface-well rounded`}>
                  <div className={`text-[10px] font-mono font-bold ${BAND_COLORS[band].split(' ')[1]}`}>Band {band}</div>
                  <div className="text-[9px] text-label-muted font-mono">{count} ({pct}%)</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Witness list */}
        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {witnesses.map(w => {
              const GateIcon = GATE_ICONS[w.kappa_gate_result];
              return (
                <button
                  key={w.id}
                  className={`w-full text-left p-2 rounded transition-all ${
                    selected?.id === w.id ? 'surface-well amber-glow' : 'surface-well hover:amber-glow'
                  }`}
                  onClick={() => setSelected(w)}
                >
                  <div className="flex items-center gap-1.5">
                    <GateIcon className={`h-3 w-3 ${GATE_COLORS[w.kappa_gate_result]}`} />
                    <span className="text-[10px] font-mono font-medium text-label-primary">{w.operation_type}</span>
                    <Badge className={`${BAND_COLORS[w.confidence_band]} text-[8px] px-1 py-0 h-3 border`}>
                      {w.confidence_band} · {(w.confidence_score * 100).toFixed(0)}%
                    </Badge>
                    <span className="flex-1" />
                    <span className="text-[9px] text-label-muted font-mono">{w.model_id.split('/').pop()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-label-muted font-mono">
                    <span>κ={w.kappa_threshold}</span>
                    <span>·</span>
                    <span>{w.input_tokens + w.output_tokens} tok</span>
                    {w.latency_ms && <><span>·</span><span>{w.latency_ms}ms</span></>}
                    <span className="flex-1" />
                    <span>{new Date(w.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                </button>
              );
            })}
            {witnesses.length === 0 && (
              <div className="text-center py-8">
                <ShieldCheck className="w-5 h-5 text-label-engraved mx-auto mb-2" />
                <span className="text-engraved">{loading ? 'LOADING...' : 'NO WITNESSES'}</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Detail + ECE Curve */}
      <div className="w-72 flex flex-col gap-2">
        {/* ECE Calibration Curve */}
        {eceBins.length > 0 && (
          <div className="panel">
            <div className="p-2">
              <CalibrationCurve bins={eceBins} width={250} height={150} />
            </div>
          </div>
        )}

        {/* Witness Detail */}
        {selected ? (
          <div className="panel flex-1 overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3 w-3 text-primary" />
                <span className="text-engraved">WITNESS ENVELOPE</span>
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-2.5rem)] p-2">
              <div className="space-y-2 text-[10px]">
                <DetailRow label="Operation" value={selected.operation_type} />
                <DetailRow label="Model" value={selected.model_id} />
                <DetailRow label="Confidence" value={`${(selected.confidence_score * 100).toFixed(1)}% (Band ${selected.confidence_band})`} />
                <DetailRow label="κ-Gate" value={`${selected.kappa_gate_result} (threshold: ${selected.kappa_threshold})`} />
                <div>
                  <span className="text-label-muted">Hashes:</span>
                  <div className="mt-0.5 space-y-0.5 font-mono text-[9px] text-label-secondary">
                    <div>prompt: {selected.prompt_hash.slice(0, 16)}…</div>
                    <div>context: {selected.context_hash.slice(0, 16)}…</div>
                    <div>response: {selected.response_hash.slice(0, 16)}…</div>
                  </div>
                </div>
                <DetailRow label="Tokens" value={`${selected.input_tokens} in / ${selected.output_tokens} out`} />
                {selected.latency_ms && <DetailRow label="Latency" value={`${selected.latency_ms}ms`} />}
                <DetailRow label="Run ID" value={selected.run_id || '—'} mono />
                <DetailRow label="Task ID" value={selected.task_id || '—'} mono />
                <DetailRow label="Atom ID" value={selected.atom_id || '—'} mono />
                <DetailRow label="Created" value={new Date(selected.created_at).toLocaleString()} />
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="panel flex-1 flex items-center justify-center">
            <div className="text-center">
              <Eye className="w-5 h-5 text-label-engraved mx-auto mb-2" />
              <span className="text-engraved">SELECT ENVELOPE</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-label-muted">{label}:</span>{' '}
      <span className={`text-label-secondary ${mono ? 'font-mono text-[9px]' : ''}`}>{value}</span>
    </div>
  );
}
