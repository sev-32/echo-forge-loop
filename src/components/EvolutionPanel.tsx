// ============================================
// Evolution Panel — SDF-CVF Quartet Parity + DORA Metrics
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { sdfCvf, type QuartetTrace, type DORAMetrics } from '@/lib/sdf-cvf';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  GitBranch, RefreshCw, TrendingUp, Shield, Layers, BarChart3,
  CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';

const GATE_COLORS: Record<string, string> = {
  pass: 'text-emerald-400 bg-emerald-500/20',
  fail: 'text-red-400 bg-red-500/20',
  warn: 'text-amber-400 bg-amber-500/20',
  abstain: 'text-slate-400 bg-slate-500/20',
};

const TIER_COLORS: Record<string, string> = {
  elite: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
  high: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
  medium: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
  low: 'text-red-400 bg-red-500/20 border-red-500/30',
};

export function EvolutionPanel() {
  const [traces, setTraces] = useState<QuartetTrace[]>([]);
  const [doraMetrics, setDoraMetrics] = useState<DORAMetrics[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, d, s] = await Promise.all([
      sdfCvf.getTraces(30),
      sdfCvf.getDORAMetrics(10),
      sdfCvf.getStats(),
    ]);
    setTraces(t);
    setDoraMetrics(d);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold gradient-text">SDF-CVF — Evolution</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={refresh}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-card rounded border border-border/50 p-1.5 text-center">
            <Layers className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
            <div className="text-[11px] font-bold">{stats.totalTraces}</div>
            <div className="text-[9px] text-muted-foreground">Traces</div>
          </div>
          <div className="bg-card rounded border border-border/50 p-1.5 text-center">
            <Shield className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
            <div className="text-[11px] font-bold">{(stats.avgParity * 100).toFixed(0)}%</div>
            <div className="text-[9px] text-muted-foreground">Avg Parity</div>
          </div>
          <div className="bg-card rounded border border-border/50 p-1.5 text-center">
            <TrendingUp className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
            <Badge className={`${TIER_COLORS[stats.latestTier]} text-[8px] px-1 py-0 h-3 border`}>
              {stats.latestTier}
            </Badge>
            <div className="text-[9px] text-muted-foreground">DORA Tier</div>
          </div>
          <div className="bg-card rounded border border-border/50 p-1.5 text-center">
            <BarChart3 className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
            <div className="text-[11px] font-bold">{stats.gateResults.pass || 0}/{stats.totalTraces}</div>
            <div className="text-[9px] text-muted-foreground">Gates Passed</div>
          </div>
        </div>
      )}

      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Quartet traces */}
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Quartet Parity Traces</span>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {traces.map(trace => (
                <div key={trace.id} className="p-2 rounded border border-border/50 bg-card/50">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <Progress value={trace.parity_score * 100} className="h-1.5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold">
                      {(trace.parity_score * 100).toFixed(0)}%
                    </span>
                    <Badge className={`${GATE_COLORS[trace.gate_result]} text-[8px] px-1 py-0 h-3`}>
                      {trace.gate_result}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-1 text-[8px] font-mono">
                    <div className="text-center">
                      <div className="text-muted-foreground">code</div>
                      <div>{trace.code_hash.slice(0, 6)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground">docs</div>
                      <div>{trace.docs_hash.slice(0, 6)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground">tests</div>
                      <div>{trace.tests_hash.slice(0, 6)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground">trace</div>
                      <div>{trace.trace_hash.slice(0, 6)}</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    {new Date(trace.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
              {traces.length === 0 && (
                <div className="text-center text-muted-foreground text-xs py-8">
                  {loading ? 'Loading…' : 'No quartet traces yet.'}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* DORA metrics */}
        <div className="w-56 flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground">DORA Metrics</span>
          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {doraMetrics.map(m => (
                <Card key={m.id}>
                  <CardContent className="p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge className={`${TIER_COLORS[m.tier]} text-[8px] px-1 py-0 h-3 border`}>{m.tier}</Badge>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-[9px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deploy Freq</span>
                        <span className="font-mono">{m.deployment_frequency.toFixed(2)}/day</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lead Time</span>
                        <span className="font-mono">{(m.lead_time_seconds / 3600).toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Restore Time</span>
                        <span className="font-mono">{(m.restore_time_seconds / 3600).toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Failure Rate</span>
                        <span className="font-mono">{(m.change_failure_rate * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {doraMetrics.length === 0 && (
                <div className="text-center text-muted-foreground text-[9px] py-4">No DORA data yet</div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
