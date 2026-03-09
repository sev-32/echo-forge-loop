// ============================================
// Cognition Panel — CAS Meta-Cognitive Monitor
// Hasselblad X2D Aesthetic + Precision Instruments
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { cas, type CognitiveSnapshot, type FailureMode } from '@/lib/cas';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { GaugeRadial, Sparkline } from '@/components/ui/instruments';
import {
  Brain, RefreshCw, AlertTriangle, Activity, Eye, TrendingDown,
  Gauge, Focus, Zap
} from 'lucide-react';

const ATTENTION_COLORS: Record<string, string> = {
  narrow: 'bg-status-error/20 text-status-error',
  normal: 'bg-status-success/20 text-status-success',
  wide: 'bg-status-info/20 text-status-info',
};

const FAILURE_LABELS: Record<FailureMode, string> = {
  categorization_error: 'Categorization Error',
  activation_gap: 'Activation Gap',
  procedure_gap: 'Procedure Gap',
  blind_spot: 'Blind Spot',
  anchoring_bias: 'Anchoring Bias',
  confirmation_bias: 'Confirmation Bias',
  shortcut_taking: 'Shortcut Taking',
};

export function CognitionPanel() {
  const [snapshots, setSnapshots] = useState<CognitiveSnapshot[]>([]);
  const [driftAlerts, setDriftAlerts] = useState<CognitiveSnapshot[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [snaps, drifts, s] = await Promise.all([
      cas.getRecentSnapshots(50),
      cas.getDriftAlerts(),
      cas.getStats(),
    ]);
    setSnapshots(snaps);
    setDriftAlerts(drifts);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh(refresh, { tables: ['cognitive_snapshots'], debounceMs: 800 });

  // Sparkline data from snapshots
  const loadTrend = useMemo(() => snapshots.slice(-20).map(s => s.cognitive_load * 100).reverse(), [snapshots]);
  const consistencyTrend = useMemo(() => snapshots.slice(-20).map(s => s.self_consistency_score * 100).reverse(), [snapshots]);
  const depthTrend = useMemo(() => snapshots.slice(-20).map(s => s.reasoning_depth).reverse(), [snapshots]);
  const driftTrend = useMemo(() => snapshots.slice(-20).map(s => s.drift_score * 100).reverse(), [snapshots]);

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="text-engraved">CAS — COGNITIVE ANALYSIS</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-6 w-6 rail-icon" onClick={refresh}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Radial Gauge Cluster — CNC instrument panel */}
      {stats && (
        <div className="surface-well rounded p-3">
          <div className="flex items-center justify-around">
            <GaugeRadial
              value={stats.avgCognitiveLoad * 100}
              label="COG LOAD"
              sublabel={`${stats.totalSnapshots} samples`}
              size={72}
              color={stats.avgCognitiveLoad > 0.7 ? 'error' : stats.avgCognitiveLoad > 0.4 ? 'warning' : 'success'}
            />
            <GaugeRadial
              value={stats.avgConsistency * 100}
              label="CONSISTENCY"
              size={72}
            />
            <GaugeRadial
              value={stats.avgUncertaintyAwareness * 100}
              label="UNCERTAINTY"
              size={72}
              color="info"
            />
            <GaugeRadial
              value={Math.max(0, 100 - stats.driftCount * 10)}
              label="STABILITY"
              sublabel={`${stats.driftCount} drifts`}
              size={72}
              color={stats.driftCount > 3 ? 'error' : stats.driftCount > 0 ? 'warning' : 'success'}
            />
          </div>
        </div>
      )}

      {/* Trend Sparklines Row */}
      {snapshots.length >= 3 && (
        <div className="grid grid-cols-4 gap-2">
          <TrendCard label="Cog Load" data={loadTrend} color="warning" />
          <TrendCard label="Consistency" data={consistencyTrend} color="success" />
          <TrendCard label="Depth" data={depthTrend} color="info" />
          <TrendCard label="Drift" data={driftTrend} color="error" />
        </div>
      )}

      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Left: Timeline */}
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-engraved">COGNITIVE TIMELINE</span>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {snapshots.map(snap => (
                <div key={snap.id} className="p-2 surface-well rounded">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16">
                      <Progress value={snap.cognitive_load * 100} className="h-1" />
                      <span className="text-[8px] text-label-muted font-mono">{(snap.cognitive_load * 100).toFixed(0)}% load</span>
                    </div>
                    <Badge className={`${ATTENTION_COLORS[snap.attention_breadth]} text-[8px] px-1 py-0 h-3 border-0`}>
                      {snap.attention_breadth}
                    </Badge>
                    {snap.drift_detected && (
                      <Badge className="bg-status-warning/20 text-status-warning text-[8px] px-1 py-0 h-3 border-0">
                        <AlertTriangle className="h-2 w-2 mr-0.5" /> drift
                      </Badge>
                    )}
                    {snap.failure_mode && (
                      <Badge className="bg-status-error/20 text-status-error text-[8px] px-1 py-0 h-3 border-0">
                        {FAILURE_LABELS[snap.failure_mode] || snap.failure_mode}
                      </Badge>
                    )}
                    <span className="flex-1" />
                    <span className="text-[9px] text-label-muted font-mono">
                      {new Date(snap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] text-label-muted font-mono">
                    <span>depth:{snap.reasoning_depth}</span>
                    <span>consistency:{(snap.self_consistency_score * 100).toFixed(0)}%</span>
                    <span>concepts:{snap.active_concepts.length}</span>
                    <span>churn:{snap.concept_churn_rate.toFixed(2)}</span>
                  </div>
                  {snap.active_concepts.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap mt-1">
                      {snap.active_concepts.slice(0, 6).map((c, i) => (
                        <span key={i} className="text-[8px] px-1 py-0 rounded bg-primary/10 text-primary font-mono">{c}</span>
                      ))}
                      {snap.active_concepts.length > 6 && (
                        <span className="text-[8px] text-label-muted">+{snap.active_concepts.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {snapshots.length === 0 && (
                <div className="text-center py-8">
                  <Brain className="w-5 h-5 text-label-engraved mx-auto mb-2" />
                  <span className="text-engraved">{loading ? 'LOADING...' : 'NO SNAPSHOTS'}</span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Drift alerts + Failure modes */}
        <div className="w-56 flex flex-col gap-2">
          <div className="panel flex-1">
            <div className="panel-header">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-status-warning" />
                <span className="text-engraved">DRIFT ALERTS ({driftAlerts.length})</span>
              </div>
            </div>
            <ScrollArea className="max-h-40 p-2">
              <div className="space-y-1">
                {driftAlerts.slice(0, 10).map(alert => (
                  <div key={alert.id} className="text-[9px] p-1.5 surface-well rounded">
                    <div className="font-mono font-semibold text-status-warning">Score: {(alert.drift_score * 100).toFixed(0)}%</div>
                    {alert.drift_details && <div className="text-label-muted mt-0.5">{alert.drift_details}</div>}
                  </div>
                ))}
                {driftAlerts.length === 0 && <span className="text-[9px] text-label-muted">No drift detected</span>}
              </div>
            </ScrollArea>
          </div>

          {stats && Object.keys(stats.failureModes).length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-status-error" />
                  <span className="text-engraved">FAILURE MODES</span>
                </div>
              </div>
              <div className="p-2 space-y-0.5">
                {Object.entries(stats.failureModes).map(([mode, count]) => (
                  <div key={mode} className="flex items-center gap-1 text-[9px]">
                    <span className="text-status-error">•</span>
                    <span className="text-label-secondary">{FAILURE_LABELS[mode as FailureMode] || mode}</span>
                    <span className="flex-1" />
                    <span className="font-mono text-label-primary">{count as number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats && (
            <div className="panel">
              <div className="panel-header">
                <span className="text-engraved">ATTENTION DISTRIBUTION</span>
              </div>
              <div className="p-2 space-y-0.5">
                {Object.entries(stats.attentionDistribution).map(([breadth, count]) => (
                  <div key={breadth} className="flex items-center gap-1 text-[9px]">
                    <Badge className={`${ATTENTION_COLORS[breadth] || ''} text-[8px] px-1 py-0 h-3 border-0`}>{breadth}</Badge>
                    <span className="flex-1" />
                    <span className="font-mono text-label-primary">{count as number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendCard({ label, data, color }: { label: string; data: number[]; color: 'primary' | 'success' | 'warning' | 'error' | 'info' }) {
  const latest = data.length > 0 ? data[data.length - 1] : 0;
  return (
    <div className="surface-well rounded p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-mono text-label-muted uppercase tracking-wider">{label}</span>
        <span className="text-[9px] font-mono font-bold text-label-primary">{latest.toFixed(0)}</span>
      </div>
      <Sparkline data={data} width={120} height={20} color={color} showDots fill />
    </div>
  );
}
