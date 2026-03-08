// ============================================
// Trust Panel — VIF Witness Envelope Browser + κ-Gate + ECE
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { vif, type WitnessEnvelope, type ConfidenceBand, type KappaGateResult } from '@/lib/vif';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, RefreshCw, Eye, Target, TrendingUp, AlertTriangle, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

const BAND_COLORS: Record<ConfidenceBand, string> = {
  A: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  B: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  C: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const GATE_ICONS: Record<KappaGateResult, typeof CheckCircle> = {
  pass: CheckCircle,
  abstain: MinusCircle,
  fail: XCircle,
};

const GATE_COLORS: Record<KappaGateResult, string> = {
  pass: 'text-emerald-400',
  abstain: 'text-amber-400',
  fail: 'text-red-400',
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

  return (
    <div className="h-full flex gap-3 p-3">
      {/* Left: Witness list */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold gradient-text">VIF — Trust Layer</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={refresh}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Summary stats */}
        {stats && stats.totalWitnesses > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Witnesses" value={stats.totalWitnesses.toString()} icon={Eye} />
            <StatCard label="Avg Confidence" value={`${(stats.avgConfidence * 100).toFixed(0)}%`} icon={Target} />
            <StatCard label="κ-Pass Rate" value={`${stats.byGateResult.pass ? ((stats.byGateResult.pass / stats.totalWitnesses) * 100).toFixed(0) : 0}%`} icon={CheckCircle} />
            <StatCard label="Abstentions" value={(stats.byGateResult.abstain || 0).toString()} icon={AlertTriangle} />
          </div>
        )}

        {/* Band distribution */}
        {stats && stats.totalWitnesses > 0 && (
          <div className="flex gap-1">
            {(['A', 'B', 'C'] as ConfidenceBand[]).map(band => {
              const count = stats.byBand[band] || 0;
              const pct = (count / stats.totalWitnesses * 100).toFixed(0);
              return (
                <div key={band} className={`flex-1 text-center py-1 rounded border ${BAND_COLORS[band]}`}>
                  <div className="text-[10px] font-bold">Band {band}</div>
                  <div className="text-[9px]">{count} ({pct}%)</div>
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
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    selected?.id === w.id ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-border bg-card/50'
                  }`}
                  onClick={() => setSelected(w)}
                >
                  <div className="flex items-center gap-1.5">
                    <GateIcon className={`h-3 w-3 ${GATE_COLORS[w.kappa_gate_result]}`} />
                    <span className="text-[10px] font-medium">{w.operation_type}</span>
                    <Badge className={`${BAND_COLORS[w.confidence_band]} text-[8px] px-1 py-0 h-3 border`}>
                      {w.confidence_band} · {(w.confidence_score * 100).toFixed(0)}%
                    </Badge>
                    <span className="flex-1" />
                    <span className="text-[9px] text-muted-foreground font-mono">{w.model_id.split('/').pop()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground">
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
              <div className="text-center text-muted-foreground text-xs py-8">
                {loading ? 'Loading witnesses…' : 'No witness envelopes yet. Run a goal to generate trust data.'}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Detail */}
      <div className="w-72">
        {selected ? (
          <Card className="h-full overflow-hidden">
            <CardHeader className="p-2 pb-1">
              <CardTitle className="text-[11px] flex items-center gap-1">
                <Eye className="h-3 w-3" /> Witness Envelope
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <ScrollArea className="h-[calc(100%-2rem)]">
                <div className="space-y-2 text-[10px]">
                  <DetailRow label="Operation" value={selected.operation_type} />
                  <DetailRow label="Model" value={selected.model_id} />
                  <DetailRow label="Confidence" value={`${(selected.confidence_score * 100).toFixed(1)}% (Band ${selected.confidence_band})`} />
                  <DetailRow label="κ-Gate" value={`${selected.kappa_gate_result} (threshold: ${selected.kappa_threshold})`} />
                  <div>
                    <span className="text-muted-foreground">Hashes:</span>
                    <div className="mt-0.5 space-y-0.5 font-mono text-[9px]">
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
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <span className="text-muted-foreground text-xs">Select a witness envelope</span>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Eye }) {
  return (
    <div className="bg-card rounded border border-border/50 p-1.5 text-center">
      <Icon className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
      <div className="text-[11px] font-bold">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className={mono ? 'font-mono text-[9px]' : ''}>{value}</span>
    </div>
  );
}
