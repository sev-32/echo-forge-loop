import { useState, useEffect } from 'react';
import { useIONKernel, IONState, IONWorkUnit, IONArtifact, IONOpenQuestion, IONDelta } from '@/hooks/use-ion-kernel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Lock, Eye, Compass, Shield, Settings, AlertTriangle,
  Play, StepForward, Square, RotateCcw, Zap, HelpCircle,
  Radio, FileText, CheckCircle, XCircle, Clock, Loader2,
  ChevronRight, AlertCircle
} from 'lucide-react';

// ─── Authority class visual config ───
const AUTHORITY_CONFIG: Record<string, { icon: typeof Lock; color: string; border: string; label: string }> = {
  authority:       { icon: Lock,           color: 'text-blue-400',   border: 'border-blue-500',        label: 'Authority' },
  witness:         { icon: Eye,            color: 'text-amber-400',  border: 'border-amber-500/50 border-dashed', label: 'Witness' },
  plan:            { icon: Compass,        color: 'text-emerald-400',border: 'border-emerald-500/50',  label: 'Plan' },
  audit:           { icon: Shield,         color: 'text-purple-400', border: 'border-purple-500/50',   label: 'Audit' },
  generated_state: { icon: Settings,       color: 'text-muted-foreground', border: 'border-border',   label: 'Generated' },
  stale_competitor:{ icon: AlertTriangle,  color: 'text-destructive',border: 'border-destructive/50 line-through', label: 'Stale' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  assigned: 'bg-blue-500/20 text-blue-400',
  running: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-destructive/20 text-destructive',
  blocked: 'bg-orange-500/20 text-orange-400',
  proposed: 'bg-amber-500/20 text-amber-400',
  accepted: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-destructive/20 text-destructive',
  witness_only: 'bg-purple-500/20 text-purple-400',
  open: 'bg-amber-500/20 text-amber-400',
  answered: 'bg-emerald-500/20 text-emerald-400',
  deferred: 'bg-muted text-muted-foreground',
};

export function IONPanel() {
  const kernel = useIONKernel();
  const [goalInput, setGoalInput] = useState('');
  const [subTab, setSubTab] = useState('daemon');

  useEffect(() => { kernel.refreshRuns(); }, []);

  const handleStartRun = async () => {
    if (!goalInput.trim()) return;
    await kernel.startRun(goalInput.trim());
    setGoalInput('');
  };

  const activeRun = kernel.state?.run;

  return (
    <div className="h-full flex flex-col" style={{ background: 'hsl(var(--surface-1))' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.15)' }}>
            <Zap className="w-3.5 h-3.5" style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--label-primary))' }}>ION Kernel</span>
          {activeRun && (
            <Badge variant="outline" className="text-[9px]">{activeRun.status}</Badge>
          )}
        </div>
        {activeRun && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--label-muted))' }}>
            <span>{activeRun.total_tokens.toLocaleString()} tokens</span>
            <span>•</span>
            <span>{activeRun.completed_work_units}/{activeRun.total_work_units} units</span>
          </div>
        )}
      </div>

      {/* New Run Input */}
      {!kernel.activeRunId && (
        <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex gap-2">
            <input
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStartRun()}
              placeholder="Enter cognitive goal..."
              className="flex-1 px-3 py-2 text-xs rounded-md border bg-transparent"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--label-primary))' }}
            />
            <Button size="sm" onClick={handleStartRun} disabled={kernel.loading || !goalInput.trim()}>
              {kernel.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            </Button>
          </div>
          {/* Recent runs */}
          {kernel.runs.length > 0 && (
            <div className="mt-2 space-y-1">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: 'hsl(var(--label-muted))' }}>Recent Runs</span>
              {kernel.runs.slice(0, 5).map(run => (
                <button
                  key={run.id}
                  onClick={() => kernel.selectRun(run.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-accent/50 transition-colors"
                >
                  <Badge variant="outline" className={`text-[8px] ${STATUS_COLORS[run.status] || ''}`}>{run.status}</Badge>
                  <span className="text-[10px] truncate flex-1" style={{ color: 'hsl(var(--label-primary))' }}>{run.goal}</span>
                  <span className="text-[9px]" style={{ color: 'hsl(var(--label-muted))' }}>{run.total_tokens}t</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      {kernel.activeRunId && activeRun && (
        <div className="px-3 py-2 border-b flex items-center gap-1" style={{ borderColor: 'hsl(var(--border))' }}>
          <Button size="sm" variant="outline" onClick={() => kernel.step()} disabled={kernel.loading} className="h-7 text-[10px] gap-1">
            <StepForward className="w-3 h-3" /> Step
          </Button>
          <Button size="sm" variant="outline" onClick={() => kernel.runToCompletion()} disabled={kernel.loading} className="h-7 text-[10px] gap-1">
            <Play className="w-3 h-3" /> Run
          </Button>
          <Button size="sm" variant="outline" onClick={() => kernel.stopRun()} disabled={kernel.loading} className="h-7 text-[10px] gap-1">
            <Square className="w-3 h-3" /> Stop
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => { kernel.selectRun(''); }} className="h-7 text-[10px]">
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Error */}
      {kernel.error && (
        <div className="mx-3 mt-2 px-2 py-1.5 rounded text-[10px] bg-destructive/10 text-destructive flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {kernel.error}
        </div>
      )}

      {/* Sub-tabs */}
      {kernel.activeRunId && kernel.state && (
        <Tabs value={subTab} onValueChange={setSubTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-3 mt-2 h-7 p-0.5 rounded-md" style={{ background: 'hsl(var(--surface-2))' }}>
            <TabsTrigger value="daemon" className="text-[9px] h-6 px-2">Daemon</TabsTrigger>
            <TabsTrigger value="units" className="text-[9px] h-6 px-2">Units ({kernel.state.work_units.length})</TabsTrigger>
            <TabsTrigger value="artifacts" className="text-[9px] h-6 px-2">Registry ({kernel.state.artifacts.length})</TabsTrigger>
            <TabsTrigger value="questions" className="text-[9px] h-6 px-2">Questions ({kernel.state.questions.length})</TabsTrigger>
            <TabsTrigger value="deltas" className="text-[9px] h-6 px-2">Deltas ({kernel.state.deltas.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="daemon" className="flex-1 min-h-0 m-0 p-3">
            <DaemonView state={kernel.state} stepLog={kernel.stepLog} />
          </TabsContent>
          <TabsContent value="units" className="flex-1 min-h-0 m-0 p-3">
            <WorkUnitList units={kernel.state.work_units} />
          </TabsContent>
          <TabsContent value="artifacts" className="flex-1 min-h-0 m-0 p-3">
            <ArtifactRegistry artifacts={kernel.state.artifacts} />
          </TabsContent>
          <TabsContent value="questions" className="flex-1 min-h-0 m-0 p-3">
            <OpenQuestionsList questions={kernel.state.questions} />
          </TabsContent>
          <TabsContent value="deltas" className="flex-1 min-h-0 m-0 p-3">
            <DeltaList deltas={kernel.state.deltas} onReview={kernel.reviewDelta} loading={kernel.loading} />
          </TabsContent>
        </Tabs>
      )}

      {/* Empty state */}
      {!kernel.activeRunId && kernel.runs.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <Zap className="w-8 h-8 mx-auto" style={{ color: 'hsl(var(--primary) / 0.3)' }} />
            <p className="text-xs" style={{ color: 'hsl(var(--label-muted))' }}>No ION runs yet. Enter a goal to begin.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function DaemonView({ state, stepLog }: { state: IONState; stepLog: any[] }) {
  const run = state.run;
  if (!run) return null;

  const pending = state.work_units.filter(wu => wu.status === 'pending').length;
  const running = state.work_units.filter(wu => wu.status === 'running').length;
  const completed = state.work_units.filter(wu => wu.status === 'completed').length;
  const failed = state.work_units.filter(wu => wu.status === 'failed').length;
  const openQ = state.questions.filter(q => q.status === 'open').length;
  const proposedDeltas = state.deltas.filter(d => d.status === 'proposed').length;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3">
        {/* Goal */}
        <div className="p-2 rounded-md border" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
          <span className="text-[9px] uppercase tracking-wider" style={{ color: 'hsl(var(--label-muted))' }}>Goal</span>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--label-primary))' }}>{run.goal}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Pending', value: pending, color: 'hsl(var(--label-muted))' },
            { label: 'Running', value: running, color: 'hsl(var(--amber, 45 90% 55%))' },
            { label: 'Completed', value: completed, color: 'hsl(145 70% 55%)' },
            { label: 'Failed', value: failed, color: 'hsl(var(--destructive))' },
            { label: 'Open Qs', value: openQ, color: 'hsl(var(--primary))' },
            { label: 'Pending Δ', value: proposedDeltas, color: 'hsl(280 70% 65%)' },
          ].map(s => (
            <div key={s.label} className="p-1.5 rounded border text-center" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}>
              <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[8px] uppercase tracking-wider" style={{ color: 'hsl(var(--label-muted))' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Step log */}
        {stepLog.length > 0 && (
          <div>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'hsl(var(--label-muted))' }}>Step Log</span>
            <div className="mt-1 space-y-1">
              {stepLog.slice(-10).map((entry, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] px-1.5 py-1 rounded" style={{ background: 'hsl(var(--surface-2))' }}>
                  <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(var(--label-muted))' }} />
                  <Badge variant="outline" className={`text-[8px] ${STATUS_COLORS[entry.status] || ''}`}>{entry.status}</Badge>
                  <span className="truncate" style={{ color: 'hsl(var(--label-primary))' }}>
                    {entry.message || entry.protocol || `${entry.deltas_reviewed || 0} deltas`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function WorkUnitList({ units }: { units: IONWorkUnit[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1">
        {units.map(wu => (
          <div key={wu.id}>
            <button
              onClick={() => setExpanded(expanded === wu.id ? null : wu.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-accent/30 transition-colors"
            >
              {wu.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin text-amber-400" /> :
               wu.status === 'completed' ? <CheckCircle className="w-3 h-3 text-emerald-400" /> :
               wu.status === 'failed' ? <XCircle className="w-3 h-3 text-destructive" /> :
               <Clock className="w-3 h-3" style={{ color: 'hsl(var(--label-muted))' }} />}
              <Badge variant="outline" className="text-[8px] font-mono">{wu.protocol}</Badge>
              <span className="text-[10px] truncate flex-1" style={{ color: 'hsl(var(--label-primary))' }}>{wu.title}</span>
              <span className="text-[9px]" style={{ color: 'hsl(var(--label-muted))' }}>P{wu.priority}</span>
            </button>
            {expanded === wu.id && (
              <div className="ml-6 p-2 rounded text-[10px] space-y-1" style={{ background: 'hsl(var(--surface-2))', color: 'hsl(var(--label-primary))' }}>
                <p>{wu.description}</p>
                {wu.error && <p className="text-destructive">Error: {wu.error}</p>}
                {wu.result_data && (
                  <pre className="text-[9px] overflow-auto max-h-40 p-1 rounded" style={{ background: 'hsl(var(--surface-1))' }}>
                    {JSON.stringify(wu.result_data, null, 2).substring(0, 1000)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
        {units.length === 0 && (
          <p className="text-center text-[10px] py-4" style={{ color: 'hsl(var(--label-muted))' }}>No work units yet</p>
        )}
      </div>
    </ScrollArea>
  );
}

function ArtifactRegistry({ artifacts }: { artifacts: IONArtifact[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1">
        {artifacts.map(art => {
          const cfg = AUTHORITY_CONFIG[art.authority_class] || AUTHORITY_CONFIG.witness;
          const Icon = cfg.icon;
          return (
            <div key={art.id}>
              <button
                onClick={() => setExpanded(expanded === art.id ? null : art.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left hover:bg-accent/20 transition-colors ${cfg.border}`}
              >
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color}`} />
                <span className="text-[10px] truncate flex-1" style={{ color: 'hsl(var(--label-primary))' }}>{art.name}</span>
                <Badge variant="outline" className={`text-[8px] ${cfg.color}`}>{cfg.label}</Badge>
              </button>
              {expanded === art.id && (
                <div className="ml-6 mt-1 p-2 rounded text-[10px]" style={{ background: 'hsl(var(--surface-2))' }}>
                  <pre className="whitespace-pre-wrap overflow-auto max-h-60" style={{ color: 'hsl(var(--label-primary))' }}>
                    {art.content.substring(0, 2000)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
        {artifacts.length === 0 && (
          <p className="text-center text-[10px] py-4" style={{ color: 'hsl(var(--label-muted))' }}>No artifacts yet</p>
        )}
      </div>
    </ScrollArea>
  );
}

function OpenQuestionsList({ questions }: { questions: IONOpenQuestion[] }) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-1">
        {questions.map(q => (
          <div key={q.id} className="flex items-start gap-2 px-2 py-1.5 rounded border" style={{ borderColor: 'hsl(var(--border))' }}>
            <HelpCircle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${q.status === 'open' ? 'text-amber-400' : 'text-emerald-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px]" style={{ color: 'hsl(var(--label-primary))' }}>{q.question}</p>
              {q.answer && <p className="text-[9px] mt-0.5" style={{ color: 'hsl(var(--label-muted))' }}>→ {q.answer}</p>}
            </div>
            <Badge variant="outline" className={`text-[8px] ${STATUS_COLORS[q.status] || ''}`}>{q.status}</Badge>
          </div>
        ))}
        {questions.length === 0 && (
          <p className="text-center text-[10px] py-4" style={{ color: 'hsl(var(--label-muted))' }}>No open questions</p>
        )}
      </div>
    </ScrollArea>
  );
}

function DeltaList({ deltas, onReview, loading }: { deltas: IONDelta[]; onReview: (id: string, verdict: string, notes?: string) => Promise<any>; loading: boolean }) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-1.5">
        {deltas.map(d => (
          <div key={d.id} className="px-2 py-1.5 rounded border" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[8px] ${STATUS_COLORS[d.status] || ''}`}>{d.status}</Badge>
              <span className="text-[10px]" style={{ color: 'hsl(var(--label-primary))' }}>
                {d.artifacts_created.length} artifacts • {(d.questions_raised || []).length} questions • {d.confidence.toFixed(2)} conf
              </span>
            </div>
            {d.status === 'proposed' && (
              <div className="flex gap-1 mt-1.5">
                <Button size="sm" variant="outline" className="h-6 text-[9px] text-emerald-400" onClick={() => onReview(d.id, 'accept')} disabled={loading}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-[9px] text-destructive" onClick={() => onReview(d.id, 'reject')} disabled={loading}>
                  Reject
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-[9px] text-purple-400" onClick={() => onReview(d.id, 'witness_only')} disabled={loading}>
                  Witness Only
                </Button>
              </div>
            )}
          </div>
        ))}
        {deltas.length === 0 && (
          <p className="text-center text-[10px] py-4" style={{ color: 'hsl(var(--label-muted))' }}>No commit deltas</p>
        )}
      </div>
    </ScrollArea>
  );
}
