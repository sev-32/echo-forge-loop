import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import {
  Brain, ChevronDown, ChevronRight, Clock, Zap, Target, Shield, Sparkles,
  TrendingUp, Database, RefreshCw, CheckCircle2, XCircle, BarChart3,
  Eye, Gauge, Layers, HelpCircle, Loader2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RunTrace {
  id: string;
  run_id: string;
  goal: string;
  approach: string;
  overall_complexity: string;
  planning_reasoning: string;
  open_questions: string[];
  status: string;
  total_tokens: number;
  task_count: number;
  tasks_passed: number;
  avg_score: number | null;
  planning_score: number | null;
  strategy_score: number | null;
  memory_loaded: { reflections: number; rules: number; knowledge: number };
  tasks_detail: Array<{
    title: string;
    detail_level: string;
    priority: number;
    reasoning: string;
    acceptance_criteria: string[];
    output_length: number;
    output_excerpt: string;
    verification: { passed: boolean; score: number; summary: string; criteria_results?: Array<{ criterion: string; met: boolean; reasoning: string }> } | null;
    retried: boolean;
  }>;
  reflection: { content: string; metadata: Record<string, unknown> } | null;
  generated_rules: Array<{ rule_text: string; category: string; confidence: number }>;
  knowledge_update: { nodes_added: number; edges_added: number } | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

const complexityColors: Record<string, string> = {
  simple: 'bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))] border-[hsl(var(--status-success))]/20',
  moderate: 'bg-[hsl(var(--status-info))]/10 text-[hsl(var(--status-info))] border-[hsl(var(--status-info))]/20',
  complex: 'bg-[hsl(var(--status-warning))]/10 text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning))]/20',
  'research-grade': 'bg-[hsl(var(--status-pending))]/10 text-[hsl(var(--status-pending))] border-[hsl(var(--status-pending))]/20',
};

function ScoreRing({ score, size = 48, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'hsl(var(--status-success))' : score >= 60 ? 'hsl(var(--status-warning))' : 'hsl(var(--status-error))';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xs font-bold text-foreground">{score}</span>
      </div>
      <span className="text-[8px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function EffectivenessMetrics({ runs }: { runs: RunTrace[] }) {
  if (runs.length === 0) return null;

  const totalRuns = runs.length;
  const avgTokens = Math.round(runs.reduce((a, r) => a + r.total_tokens, 0) / totalRuns);
  const avgScore = runs.filter(r => r.avg_score != null).length > 0
    ? Math.round(runs.filter(r => r.avg_score != null).reduce((a, r) => a + (r.avg_score || 0), 0) / runs.filter(r => r.avg_score != null).length)
    : null;
  const avgPlanningScore = runs.filter(r => r.planning_score != null).length > 0
    ? Math.round(runs.filter(r => r.planning_score != null).reduce((a, r) => a + (r.planning_score || 0), 0) / runs.filter(r => r.planning_score != null).length)
    : null;
  const avgStrategyScore = runs.filter(r => r.strategy_score != null).length > 0
    ? Math.round(runs.filter(r => r.strategy_score != null).reduce((a, r) => a + (r.strategy_score || 0), 0) / runs.filter(r => r.strategy_score != null).length)
    : null;
  const totalTasksPassed = runs.reduce((a, r) => a + r.tasks_passed, 0);
  const totalTasks = runs.reduce((a, r) => a + r.task_count, 0);
  const passRate = totalTasks > 0 ? Math.round((totalTasksPassed / totalTasks) * 100) : 0;

  return (
    <div className="grid grid-cols-6 gap-2 p-3 bg-card border border-border rounded-lg">
      <MetricBox label="Total Runs" value={totalRuns.toString()} icon={BarChart3} />
      <MetricBox label="Pass Rate" value={`${passRate}%`} icon={CheckCircle2} color={passRate >= 80 ? 'text-[hsl(var(--status-success))]' : passRate >= 60 ? 'text-[hsl(var(--status-warning))]' : 'text-[hsl(var(--status-error))]'} />
      <MetricBox label="Avg Score" value={avgScore != null ? avgScore.toString() : '—'} icon={Target} />
      <MetricBox label="Avg Planning" value={avgPlanningScore != null ? avgPlanningScore.toString() : '—'} icon={Layers} />
      <MetricBox label="Avg Strategy" value={avgStrategyScore != null ? avgStrategyScore.toString() : '—'} icon={Sparkles} />
      <MetricBox label="Avg Tokens" value={avgTokens.toLocaleString()} icon={Zap} />
    </div>
  );
}

function MetricBox({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <Icon className={`h-3.5 w-3.5 ${color || 'text-muted-foreground'}`} />
      <span className={`text-sm font-bold ${color || 'text-foreground'}`}>{value}</span>
      <span className="text-[8px] text-muted-foreground">{label}</span>
    </div>
  );
}

function RunCard({ run, isSelected, onClick }: { run: RunTrace; isSelected: boolean; onClick: () => void }) {
  const passRate = run.task_count > 0 ? Math.round((run.tasks_passed / run.task_count) * 100) : 0;

  return (
    <button onClick={onClick} className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
      isSelected ? 'bg-accent/10 border-accent/30' : 'bg-card border-border hover:bg-secondary/50 hover:border-border'
    }`}>
      <div className="flex items-start gap-2">
        <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
          passRate >= 80 ? 'bg-[hsl(var(--status-success))]/10' : passRate >= 50 ? 'bg-[hsl(var(--status-warning))]/10' : 'bg-[hsl(var(--status-error))]/10'
        }`}>
          <Brain className={`h-3 w-3 ${
            passRate >= 80 ? 'text-[hsl(var(--status-success))]' : passRate >= 50 ? 'text-[hsl(var(--status-warning))]' : 'text-[hsl(var(--status-error))]'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground truncate">{run.goal}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge className={`text-[8px] h-3.5 px-1 ${complexityColors[run.overall_complexity] || complexityColors.moderate}`}>
              {run.overall_complexity}
            </Badge>
            <span className="text-[9px] text-muted-foreground">{run.tasks_passed}/{run.task_count} tasks</span>
            {run.avg_score != null && (
              <span className={`text-[9px] font-mono font-medium ${
                run.avg_score >= 80 ? 'text-[hsl(var(--status-success))]' : run.avg_score >= 60 ? 'text-[hsl(var(--status-warning))]' : 'text-[hsl(var(--status-error))]'
              }`}>{run.avg_score}/100</span>
            )}
            <span className="text-[9px] text-muted-foreground font-mono">{run.total_tokens.toLocaleString()} tok</span>
          </div>
          <div className="flex items-center gap-1 mt-1 text-[8px] text-muted-foreground/60">
            <Clock className="h-2.5 w-2.5" />
            {new Date(run.created_at).toLocaleString()}
          </div>
        </div>
      </div>
    </button>
  );
}

function RunDetail({ run }: { run: RunTrace }) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [showReasoning, setShowReasoning] = useState(false);
  const [showReflection, setShowReflection] = useState(false);

  const toggleTask = (i: number) => {
    setExpandedTasks(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Header */}
        <div>
          <h3 className="text-sm font-bold text-foreground">{run.goal}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={`text-[9px] ${complexityColors[run.overall_complexity] || complexityColors.moderate}`}>
              {run.overall_complexity}
            </Badge>
            <span className="text-[9px] text-muted-foreground">{run.approach}</span>
          </div>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-4 p-3 bg-secondary/30 rounded-lg border border-border justify-center">
          {run.avg_score != null && (
            <div className="relative"><ScoreRing score={run.avg_score} label="Avg Score" /></div>
          )}
          {run.planning_score != null && (
            <div className="relative"><ScoreRing score={run.planning_score} label="Planning" /></div>
          )}
          {run.strategy_score != null && (
            <div className="relative"><ScoreRing score={run.strategy_score} label="Strategy" /></div>
          )}
          <div className="flex flex-col items-center gap-1">
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold text-foreground">{run.total_tokens.toLocaleString()}</span>
            <span className="text-[8px] text-muted-foreground">Tokens</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-success))]" />
            <span className="text-xs font-bold text-foreground">{run.tasks_passed}/{run.task_count}</span>
            <span className="text-[8px] text-muted-foreground">Passed</span>
          </div>
        </div>

        {/* Memory loaded */}
        {run.memory_loaded && (run.memory_loaded.reflections > 0 || run.memory_loaded.rules > 0) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--status-info))]/5 border border-[hsl(var(--status-info))]/20 text-[10px]">
            <Database className="h-3 w-3 text-[hsl(var(--status-info))]" />
            <span className="text-[hsl(var(--status-info))]">
              Loaded {run.memory_loaded.reflections} reflections, {run.memory_loaded.rules} rules, {run.memory_loaded.knowledge} concepts
            </span>
          </div>
        )}

        {/* Open questions */}
        {run.open_questions?.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--status-warning))]">
              <HelpCircle className="h-3 w-3" /> Open Questions
            </div>
            {run.open_questions.map((q, i) => (
              <p key={i} className="text-[10px] text-muted-foreground pl-4">• {q}</p>
            ))}
          </div>
        )}

        {/* Planning reasoning */}
        {run.planning_reasoning && (
          <details open={showReasoning} onToggle={(e) => setShowReasoning((e.target as HTMLDetailsElement).open)}>
            <summary className="text-[10px] font-medium text-accent cursor-pointer flex items-center gap-1">
              <Eye className="h-3 w-3" /> Planning Reasoning
            </summary>
            <div className="mt-1 p-2 rounded-md bg-[hsl(var(--terminal-bg))] border border-border/50 text-[9px] font-mono text-[hsl(var(--terminal-fg))] whitespace-pre-wrap max-h-40 overflow-y-auto">
              {run.planning_reasoning}
            </div>
          </details>
        )}

        {/* Tasks */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-foreground flex items-center gap-1">
            <Layers className="h-3 w-3" /> Tasks ({run.task_count})
          </div>
          {(run.tasks_detail || []).map((task, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <button onClick={() => toggleTask(i)} className="w-full flex items-center gap-2 p-2 text-left hover:bg-secondary/30 transition-colors">
                {task.verification?.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--status-success))] flex-shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-[hsl(var(--status-error))] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-foreground">{task.title}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[8px] h-3 px-1">{task.detail_level}</Badge>
                    <Badge variant="outline" className="text-[8px] h-3 px-1">P{task.priority}</Badge>
                    {task.retried && <Badge className="text-[8px] h-3 px-1 bg-[hsl(var(--status-blocked))]/10 text-[hsl(var(--status-blocked))]">Retried</Badge>}
                    {task.verification && (
                      <span className={`text-[9px] font-mono ${
                        task.verification.score >= 80 ? 'text-[hsl(var(--status-success))]' : task.verification.score >= 60 ? 'text-[hsl(var(--status-warning))]' : 'text-[hsl(var(--status-error))]'
                      }`}>{task.verification.score}/100</span>
                    )}
                  </div>
                </div>
                {expandedTasks.has(i) ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </button>
              {expandedTasks.has(i) && (
                <div className="p-2 pt-0 space-y-2 border-t border-border/50">
                  {task.reasoning && (
                    <div className="text-[9px] text-muted-foreground italic">💡 {task.reasoning}</div>
                  )}
                  {task.acceptance_criteria?.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-medium text-muted-foreground">Criteria:</span>
                      {task.acceptance_criteria.map((c, j) => (
                        <div key={j} className="flex items-start gap-1 text-[9px]">
                          {task.verification?.criteria_results?.[j]?.met !== undefined ? (
                            task.verification.criteria_results[j].met
                              ? <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--status-success))] mt-0.5 flex-shrink-0" />
                              : <XCircle className="h-2.5 w-2.5 text-[hsl(var(--status-error))] mt-0.5 flex-shrink-0" />
                          ) : <span className="w-2.5 h-2.5 flex-shrink-0" />}
                          <span className="text-muted-foreground">{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {task.verification?.summary && (
                    <div className="text-[9px] p-1.5 rounded bg-secondary/50 text-muted-foreground">
                      <Shield className="h-2.5 w-2.5 inline mr-1" />
                      {task.verification.summary}
                    </div>
                  )}
                  {task.output_excerpt && (
                    <details>
                      <summary className="text-[9px] font-medium text-accent cursor-pointer">View Output ({task.output_length.toLocaleString()} chars)</summary>
                      <div className="mt-1 p-2 rounded bg-[hsl(var(--code-bg))] text-[hsl(var(--code-fg))] text-[9px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-border/50">
                        {task.output_excerpt}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Reflection */}
        {run.reflection && (
          <details open={showReflection} onToggle={(e) => setShowReflection((e.target as HTMLDetailsElement).open)}>
            <summary className="text-[10px] font-bold text-[hsl(var(--status-pending))] cursor-pointer flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" /> Deep Reflection
            </summary>
            <div className="mt-1 p-2 rounded-md bg-[hsl(var(--terminal-bg))] border border-border/50 text-[9px] font-mono text-[hsl(var(--terminal-fg))] whitespace-pre-wrap max-h-60 overflow-y-auto">
              {run.reflection.content}
            </div>
          </details>
        )}

        {/* Generated rules */}
        {run.generated_rules?.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-primary flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Generated Rules ({run.generated_rules.length})
            </div>
            {run.generated_rules.map((rule, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded bg-primary/5 border border-primary/10 text-[9px]">
                <Gauge className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-foreground">{rule.rule_text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[8px] h-3 px-1">{rule.category}</Badge>
                    <span className="text-muted-foreground">conf: {(rule.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export function RunHistoryPanel() {
  const [runs, setRuns] = useState<RunTrace[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunTrace | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('run_traces')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) {
      setRuns(data as unknown as RunTrace[]);
      if (data.length > 0 && !selectedRun) setSelectedRun(data[0] as unknown as RunTrace);
    }
    setLoading(false);
  }, [selectedRun]);

  useEffect(() => { fetchRuns(); }, []);
  useRealtimeRefresh(fetchRuns, { tables: ['run_traces'], debounceMs: 1000 });

  return (
    <div className="flex flex-col h-full gap-3 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Run History & Effectiveness</h2>
          <Badge variant="outline" className="text-[9px]">{runs.length} runs</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchRuns} className="h-6 text-[10px] gap-1">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <EffectivenessMetrics runs={runs} />

      {loading && runs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <Brain className="h-8 w-8 opacity-30" />
          <p className="text-xs">No runs yet. Start a goal in Chat to see results here.</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
          {/* Run list */}
          <div className="w-80 flex-shrink-0">
            <ScrollArea className="h-full">
              <div className="space-y-1.5 pr-2">
                {runs.map(run => (
                  <RunCard
                    key={run.id}
                    run={run}
                    isSelected={selectedRun?.id === run.id}
                    onClick={() => setSelectedRun(run)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Detail */}
          <div className="flex-1 border border-border rounded-lg bg-card overflow-hidden">
            {selectedRun ? (
              <RunDetail run={selectedRun} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                Select a run to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
