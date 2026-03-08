// ============================================
// Cognition Panel — CAS Meta-Cognitive Monitor
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { cas, type CognitiveSnapshot, type FailureMode } from '@/lib/cas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Brain, RefreshCw, AlertTriangle, Activity, Eye, TrendingDown,
  Gauge, Focus, Zap
} from 'lucide-react';

const ATTENTION_COLORS: Record<string, string> = {
  narrow: 'bg-red-500/20 text-red-400',
  normal: 'bg-emerald-500/20 text-emerald-400',
  wide: 'bg-blue-500/20 text-blue-400',
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

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold gradient-text">CAS — Cognitive Analysis</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={refresh}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-2">
          <MetricCard icon={Activity} label="Snapshots" value={stats.totalSnapshots.toString()} />
          <MetricCard icon={Gauge} label="Avg Load" value={`${(stats.avgCognitiveLoad * 100).toFixed(0)}%`}
            color={stats.avgCognitiveLoad > 0.7 ? 'text-red-400' : stats.avgCognitiveLoad > 0.4 ? 'text-amber-400' : 'text-emerald-400'} />
          <MetricCard icon={TrendingDown} label="Drift Alerts" value={stats.driftCount.toString()}
            color={stats.driftCount > 0 ? 'text-amber-400' : 'text-emerald-400'} />
          <MetricCard icon={Eye} label="Consistency" value={`${(stats.avgConsistency * 100).toFixed(0)}%`} />
          <MetricCard icon={Focus} label="Uncertainty" value={`${(stats.avgUncertaintyAwareness * 100).toFixed(0)}%`} />
        </div>
      )}

      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Left: Timeline */}
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Cognitive Timeline</span>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {snapshots.map(snap => (
                <div key={snap.id} className="p-2 rounded border border-border/50 bg-card/50">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16">
                      <Progress value={snap.cognitive_load * 100} className="h-1" />
                      <span className="text-[8px] text-muted-foreground">{(snap.cognitive_load * 100).toFixed(0)}% load</span>
                    </div>
                    <Badge className={`${ATTENTION_COLORS[snap.attention_breadth]} text-[8px] px-1 py-0 h-3`}>
                      {snap.attention_breadth}
                    </Badge>
                    {snap.drift_detected && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-[8px] px-1 py-0 h-3">
                        <AlertTriangle className="h-2 w-2 mr-0.5" /> drift
                      </Badge>
                    )}
                    {snap.failure_mode && (
                      <Badge className="bg-red-500/20 text-red-400 text-[8px] px-1 py-0 h-3">
                        {FAILURE_LABELS[snap.failure_mode] || snap.failure_mode}
                      </Badge>
                    )}
                    <span className="flex-1" />
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(snap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                    <span>depth:{snap.reasoning_depth}</span>
                    <span>consistency:{(snap.self_consistency_score * 100).toFixed(0)}%</span>
                    <span>concepts:{snap.active_concepts.length}</span>
                    <span>churn:{snap.concept_churn_rate.toFixed(2)}</span>
                  </div>
                  {snap.active_concepts.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap mt-1">
                      {snap.active_concepts.slice(0, 6).map((c, i) => (
                        <span key={i} className="text-[8px] px-1 py-0 rounded bg-primary/10 text-primary">{c}</span>
                      ))}
                      {snap.active_concepts.length > 6 && (
                        <span className="text-[8px] text-muted-foreground">+{snap.active_concepts.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {snapshots.length === 0 && (
                <div className="text-center text-muted-foreground text-xs py-8">
                  {loading ? 'Loading…' : 'No cognitive snapshots yet.'}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Drift alerts + Failure modes */}
        <div className="w-56 flex flex-col gap-2">
          <Card className="flex-1">
            <CardHeader className="p-2 pb-1">
              <CardTitle className="text-[10px] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-400" /> Drift Alerts ({driftAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <ScrollArea className="max-h-40">
                <div className="space-y-1">
                  {driftAlerts.slice(0, 10).map(alert => (
                    <div key={alert.id} className="text-[9px] p-1 rounded bg-amber-500/5 border border-amber-500/20">
                      <div className="font-medium text-amber-400">Score: {(alert.drift_score * 100).toFixed(0)}%</div>
                      {alert.drift_details && <div className="text-muted-foreground mt-0.5">{alert.drift_details}</div>}
                    </div>
                  ))}
                  {driftAlerts.length === 0 && <span className="text-[9px] text-muted-foreground">No drift detected</span>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {stats && Object.keys(stats.failureModes).length > 0 && (
            <Card>
              <CardHeader className="p-2 pb-1">
                <CardTitle className="text-[10px] flex items-center gap-1">
                  <Zap className="h-3 w-3 text-red-400" /> Failure Modes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                <div className="space-y-0.5">
                  {Object.entries(stats.failureModes).map(([mode, count]) => (
                    <div key={mode} className="flex items-center gap-1 text-[9px]">
                      <span className="text-red-400">•</span>
                      <span>{FAILURE_LABELS[mode as FailureMode] || mode}</span>
                      <span className="flex-1" />
                      <span className="font-mono">{count as number}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stats && (
            <Card>
              <CardHeader className="p-2 pb-1">
                <CardTitle className="text-[10px]">Attention Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                <div className="space-y-0.5">
                  {Object.entries(stats.attentionDistribution).map(([breadth, count]) => (
                    <div key={breadth} className="flex items-center gap-1 text-[9px]">
                      <Badge className={`${ATTENTION_COLORS[breadth] || ''} text-[8px] px-1 py-0 h-3`}>{breadth}</Badge>
                      <span className="flex-1" />
                      <span className="font-mono">{count as number}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: typeof Activity; label: string; value: string; color?: string }) {
  return (
    <div className="bg-card rounded border border-border/50 p-1.5 text-center">
      <Icon className={`h-3 w-3 mx-auto mb-0.5 ${color || 'text-muted-foreground'}`} />
      <div className={`text-[11px] font-bold ${color || ''}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}
