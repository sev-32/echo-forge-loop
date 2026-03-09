// ============================================
// Evolution Panel — SDF-CVF Quartet Parity + DORA Metrics
// Upgraded with CNC instrument gauges & sparklines
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { sdfCvf, type QuartetTrace, type DORAMetrics } from '@/lib/sdf-cvf';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GaugeRadial, Sparkline, StatusBadge } from '@/components/ui/instruments';
import { RefreshCw } from 'lucide-react';
import {
  IconShield, IconActivity, IconGauge, IconRadio
} from '@/components/icons';

const TIER_COLORS: Record<string, string> = {
  elite: 'text-status-success',
  high: 'text-primary',
  medium: 'text-status-warning',
  low: 'text-status-error',
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

  // Derive sparkline data from traces
  const parityTrend = useMemo(() => 
    traces.slice(-20).map(t => t.parity_score * 100),
  [traces]);

  const deployFreqTrend = useMemo(() =>
    doraMetrics.slice(-10).map(m => m.deployment_frequency),
  [doraMetrics]);

  const failureRateTrend = useMemo(() =>
    doraMetrics.slice(-10).map(m => m.change_failure_rate * 100),
  [doraMetrics]);

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <IconRadio className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-mono font-bold text-label-primary tracking-widest uppercase">SDF-CVF — Evolution</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Gauge cluster */}
      {stats && (
        <div className="flex items-center justify-around py-2 px-4 border border-border/50 rounded-lg bg-card/50">
          <GaugeRadial
            value={stats.avgParity * 100}
            label="PARITY"
            sublabel={`${stats.totalTraces} traces`}
            size={72}
            color="primary"
          />
          <GaugeRadial
            value={stats.gateResults?.pass ? (stats.gateResults.pass / Math.max(stats.totalTraces, 1)) * 100 : 0}
            label="GATE PASS"
            sublabel={`${stats.gateResults?.pass || 0}/${stats.totalTraces}`}
            size={72}
            color="success"
          />
          <div className="flex flex-col items-center gap-1">
            <span className={`text-lg font-mono font-black ${TIER_COLORS[stats.latestTier] || 'text-muted-foreground'}`}>
              {(stats.latestTier || 'N/A').toUpperCase()}
            </span>
            <span className="text-[9px] font-mono font-semibold text-label-primary tracking-wide">DORA TIER</span>
          </div>
          {parityTrend.length >= 2 && (
            <div className="flex flex-col items-center gap-1">
              <Sparkline data={parityTrend} width={100} height={28} color="primary" showDots />
              <span className="text-[9px] font-mono font-semibold text-label-primary tracking-wide">PARITY TREND</span>
            </div>
          )}
        </div>
      )}

      <Tabs defaultValue="traces" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit">
          <TabsTrigger value="traces" className="text-[10px] gap-1">
            <IconShield className="h-3 w-3" />Quartet Traces
          </TabsTrigger>
          <TabsTrigger value="dora" className="text-[10px] gap-1">
            <IconGauge className="h-3 w-3" />DORA Metrics
          </TabsTrigger>
        </TabsList>

        {/* ═══ TRACES TAB ═══ */}
        <TabsContent value="traces" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full">
            <div className="space-y-1.5">
              {traces.map(trace => (
                <div key={trace.id} className="p-2 rounded border border-border/50 bg-card/50 hover:bg-card transition-colors">
                  <div className="flex items-center gap-2">
                    {/* Mini parity gauge */}
                    <div className="shrink-0">
                      <GaugeRadial value={trace.parity_score * 100} size={36} strokeWidth={3} showTicks={false} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold">
                          {(trace.parity_score * 100).toFixed(0)}% parity
                        </span>
                        <StatusBadge status={trace.gate_result} size="sm" />
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-1 text-[8px] font-mono text-label-muted">
                        <span title={trace.code_hash}>C:{trace.code_hash.slice(0, 5)}</span>
                        <span title={trace.docs_hash}>D:{trace.docs_hash.slice(0, 5)}</span>
                        <span title={trace.tests_hash}>T:{trace.tests_hash.slice(0, 5)}</span>
                        <span title={trace.trace_hash}>R:{trace.trace_hash.slice(0, 5)}</span>
                      </div>
                    </div>
                    <span className="text-[8px] text-label-muted font-mono shrink-0">
                      {new Date(trace.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {traces.length === 0 && (
                <div className="text-center text-label-muted text-[10px] font-mono py-12">
                  {loading ? 'LOADING…' : 'NO QUARTET TRACES RECORDED'}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ═══ DORA TAB ═══ */}
        <TabsContent value="dora" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {/* Trend sparklines */}
              {doraMetrics.length >= 2 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 rounded border border-border/50 bg-card/50">
                    <span className="text-[8px] font-mono text-label-muted">DEPLOY FREQUENCY</span>
                    <div className="mt-1">
                      <Sparkline data={deployFreqTrend} width={120} height={24} color="success" showDots />
                    </div>
                  </div>
                  <div className="p-2 rounded border border-border/50 bg-card/50">
                    <span className="text-[8px] font-mono text-label-muted">FAILURE RATE</span>
                    <div className="mt-1">
                      <Sparkline data={failureRateTrend} width={120} height={24} color="error" showDots />
                    </div>
                  </div>
                </div>
              )}

              {doraMetrics.map(m => (
                <div key={m.id} className="p-2.5 rounded border border-border/50 bg-card/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-mono font-black ${TIER_COLORS[m.tier]}`}>
                      {m.tier.toUpperCase()}
                    </span>
                    <span className="text-[9px] text-label-muted font-mono">
                      {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
                    <div className="flex justify-between">
                      <span className="text-label-muted font-mono">Deploy Freq</span>
                      <span className="font-mono font-bold">{m.deployment_frequency.toFixed(2)}/d</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-label-muted font-mono">Lead Time</span>
                      <span className="font-mono font-bold">{(m.lead_time_seconds / 3600).toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-label-muted font-mono">Restore</span>
                      <span className="font-mono font-bold">{(m.restore_time_seconds / 3600).toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-label-muted font-mono">Fail Rate</span>
                      <span className="font-mono font-bold">{(m.change_failure_rate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
              {doraMetrics.length === 0 && (
                <div className="text-center text-label-muted text-[10px] font-mono py-8">NO DORA DATA</div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
