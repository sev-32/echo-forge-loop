import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send, Brain, CheckCircle2, XCircle, Clock, Zap, ChevronDown, ChevronRight,
  Shield, Sparkles, Target, ArrowRight, Loader2, Trash2, User,
  Activity, Database, GitBranch, BarChart3, BookOpen, Network as NetworkIcon,
  RefreshCw, Lightbulb, TrendingUp, FlaskConical, Scale, Eye, MessageCircleQuestion,
  Cpu, HelpCircle, Layers, Gauge, Workflow, ScanEye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  runData?: RunData;
}

interface TaskPlan {
  id: string;
  index: number;
  title: string;
  status: 'queued' | 'running' | 'verifying' | 'done' | 'failed' | 'retrying';
  priority: number;
  criteriaCount: number;
  detailLevel: 'concise' | 'standard' | 'comprehensive' | 'exhaustive';
  expectedSections: number;
  output: string;
  reasoning?: string;
  depthGuidance?: string;
  acceptanceCriteria?: string[];
  verification?: { passed: boolean; score: number; summary: string; criteria_results?: Array<{ criterion: string; met: boolean; reasoning: string }> };
  retryDiagnosis?: string;
  retried?: boolean;
}

interface ProcessEvaluation {
  planning_score: number;
  complexity_calibration_accurate: boolean;
  tasks_well_scoped: boolean;
  detail_levels_appropriate: boolean;
  planning_notes: string;
}

interface StrategyAssessment {
  effectiveness_score: number;
  what_worked: string[];
  what_failed: string[];
  would_change: string;
}

interface ProcessRule {
  rule_text: string;
  category: string;
  confidence: number;
  id?: string;
}

interface ReflectionData {
  summary: string;
  internal_monologue?: string;
  lessons: string[];
  knowledge_nodes: Array<{ label: string; node_type: string }>;
  knowledge_edges?: Array<{ source_label: string; target_label: string; relation: string }>;
  improvements?: string[];
  process_evaluation?: ProcessEvaluation;
  strategy_assessment?: StrategyAssessment;
  detected_patterns?: string[];
  new_process_rules?: ProcessRule[];
  self_test_proposals?: string[];
}

interface MemoryLoaded {
  reflections: number;
  rules: number;
  knowledge: number;
}

interface MemoryDetail {
  reflections: Array<{ content: string; tags: string[]; planning_score?: number; strategy_score?: number }>;
  rules: Array<{ id: string; text: string; category: string; confidence: number; times_applied: number; times_helped: number }>;
  knowledge: Array<{ label: string; type: string }>;
}

interface ThoughtEntry {
  id: string;
  timestamp: number;
  phase: 'memory' | 'planning' | 'execute' | 'verify' | 'retry' | 'reflect' | 'evolve' | 'complete';
  content: string;
}

interface RunData {
  runId: string;
  goal: string;
  approach: string;
  planningReasoning: string;
  openQuestions: string[];
  overallComplexity: 'simple' | 'moderate' | 'complex' | 'research-grade';
  tasks: TaskPlan[];
  thoughts: ThoughtEntry[];
  reflection: ReflectionData | null;
  knowledgeUpdate: { nodes_added: number; edges_added: number } | null;
  status: 'planning' | 'executing' | 'reflecting' | 'complete' | 'error';
  totalTokens: number;
  memoryLoaded?: MemoryLoaded;
  memoryDetail?: MemoryDetail;
  lessonsIncorporated?: string[];
  generatedRules?: ProcessRule[];
  activePhase: ThoughtEntry['phase'];
}

// ─── System Activity Log ────────────────────────────────
export interface SystemEvent {
  id: string;
  timestamp: number;
  type: 'plan' | 'task_start' | 'task_done' | 'task_fail' | 'verify' | 'reflect' | 'knowledge' | 'complete' | 'error' | 'retry';
  content: string;
  metadata?: Record<string, unknown>;
}

let systemEvents: SystemEvent[] = [];
let systemEventListeners: Array<(events: SystemEvent[]) => void> = [];

function emitSystemEvent(type: SystemEvent['type'], content: string, metadata?: Record<string, unknown>) {
  const evt: SystemEvent = { id: crypto.randomUUID(), timestamp: Date.now(), type, content, metadata };
  systemEvents = [...systemEvents.slice(-99), evt];
  systemEventListeners.forEach(fn => fn(systemEvents));
}

export function useSystemEvents() {
  const [events, setEvents] = useState<SystemEvent[]>(systemEvents);
  useEffect(() => {
    systemEventListeners.push(setEvents);
    return () => { systemEventListeners = systemEventListeners.filter(fn => fn !== setEvents); };
  }, []);
  return events;
}

// ─── Stream Connection ──────────────────────────────────
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aim-chat`;

async function streamAIMOS({
  conversationHistory, onPlan, onTaskStart, onTaskDelta, onTaskVerifyStart, onTaskVerified,
  onTaskComplete, onTaskError, onReflectionStart, onReflection,
  onKnowledgeUpdate, onRunComplete, onError,
  onTaskRetryStart, onTaskRetryDiagnosis, onProcessEvaluation, onRulesGenerated,
  onThinking, onMemoryDetail, onOpenQuestions,
}: {
  conversationHistory: { role: string; content: string }[];
  onPlan: (data: any) => void;
  onTaskStart: (taskIndex: number, taskId: string, title: string) => void;
  onTaskDelta: (taskIndex: number, delta: string) => void;
  onTaskVerifyStart: (taskIndex: number) => void;
  onTaskVerified: (taskIndex: number, verification: any) => void;
  onTaskComplete: (taskIndex: number, status: string) => void;
  onTaskError: (taskIndex: number, error: string) => void;
  onReflectionStart: () => void;
  onReflection: (data: ReflectionData) => void;
  onKnowledgeUpdate: (data: { nodes_added: number; edges_added: number }) => void;
  onRunComplete: (data: { run_id: string; total_tokens: number; task_count: number }) => void;
  onError: (error: string) => void;
  onTaskRetryStart: (taskIndex: number, reason: string) => void;
  onTaskRetryDiagnosis: (taskIndex: number, diagnosis: string) => void;
  onProcessEvaluation: (data: any) => void;
  onRulesGenerated: (data: any) => void;
  onThinking: (phase: string, content: string) => void;
  onMemoryDetail: (data: MemoryDetail) => void;
  onOpenQuestions: (questions: string[]) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages: conversationHistory }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    onError(data.error || `Error ${resp.status}`);
    return;
  }
  if (!resp.body) { onError("No response body"); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") return;

      try {
        const evt = JSON.parse(json);
        switch (evt.type) {
          case 'thinking': onThinking(evt.phase, evt.content); break;
          case 'memory_detail': onMemoryDetail(evt); break;
          case 'open_questions': onOpenQuestions(evt.questions); break;
          case 'plan': onPlan(evt); break;
          case 'task_start': onTaskStart(evt.task_index, evt.task_id, evt.title); break;
          case 'task_delta': onTaskDelta(evt.task_index, evt.delta); break;
          case 'task_verify_start': onTaskVerifyStart(evt.task_index); break;
          case 'task_verified': onTaskVerified(evt.task_index, evt.verification); break;
          case 'task_complete': onTaskComplete(evt.task_index, evt.status); break;
          case 'task_error': onTaskError(evt.task_index, evt.error); break;
          case 'reflection_start': onReflectionStart(); break;
          case 'reflection': onReflection(evt.data); break;
          case 'knowledge_update': onKnowledgeUpdate(evt); break;
          case 'run_complete': onRunComplete(evt); break;
          case 'task_retry_start': onTaskRetryStart(evt.task_index, evt.reason); break;
          case 'task_retry_diagnosis': onTaskRetryDiagnosis(evt.task_index, evt.diagnosis); break;
          case 'process_evaluation': onProcessEvaluation(evt.data); break;
          case 'rules_generated': onRulesGenerated(evt); break;
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
}

// ─── Markdown Renderer ──────────────────────────────────
const mdComponents = {
  h1: ({ children }: any) => <h1 className="text-sm font-bold text-foreground mt-3 mb-1.5">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xs font-bold text-foreground mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-semibold text-foreground mt-2 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="text-xs text-secondary-foreground mb-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="text-xs text-secondary-foreground ml-3 mb-1.5 space-y-0.5 list-disc">{children}</ul>,
  ol: ({ children }: any) => <ol className="text-xs text-secondary-foreground ml-3 mb-1.5 space-y-0.5 list-decimal">{children}</ol>,
  li: ({ children }: any) => <li className="text-xs leading-relaxed">{children}</li>,
  code: ({ className, children }: any) => {
    const isBlock = className?.includes('language-');
    return isBlock
      ? <pre className="bg-[hsl(var(--code-bg))] text-[hsl(var(--code-fg))] p-2.5 rounded-md text-[10px] font-mono overflow-x-auto my-2 border border-border"><code>{children}</code></pre>
      : <code className="bg-secondary px-1 py-0.5 rounded text-[10px] font-mono text-accent">{children}</code>;
  },
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
  table: ({ children }: any) => <div className="overflow-x-auto my-2"><table className="text-[10px] border-collapse w-full">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-border px-2 py-1 bg-secondary text-left font-medium text-xs">{children}</th>,
  td: ({ children }: any) => <td className="border border-border px-2 py-1 text-xs">{children}</td>,
  hr: () => <hr className="border-border my-3" />,
};

// ─── Phase Config ───────────────────────────────────────
const phaseConfig: Record<string, { icon: any; label: string; color: string }> = {
  memory: { icon: Database, label: 'Memory', color: 'text-[hsl(var(--status-info))]' },
  planning: { icon: Target, label: 'Planning', color: 'text-primary' },
  execute: { icon: Zap, label: 'Execute', color: 'text-accent' },
  verify: { icon: Shield, label: 'Verify', color: 'text-[hsl(var(--status-warning))]' },
  retry: { icon: RefreshCw, label: 'Retry', color: 'text-[hsl(var(--status-blocked))]' },
  reflect: { icon: Sparkles, label: 'Reflect', color: 'text-[hsl(var(--status-pending))]' },
  evolve: { icon: TrendingUp, label: 'Evolve', color: 'text-primary' },
  complete: { icon: CheckCircle2, label: 'Complete', color: 'text-[hsl(var(--status-success))]' },
};

// ─── Phase Pipeline ─────────────────────────────────────
function PhasePipeline({ activePhase, status }: { activePhase: string; status: RunData['status'] }) {
  const phases = ['memory', 'planning', 'execute', 'verify', 'reflect', 'evolve', 'complete'];
  const activeIdx = phases.indexOf(activePhase);

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-card border-b border-border overflow-x-auto">
      {phases.map((phase, i) => {
        const cfg = phaseConfig[phase];
        const Icon = cfg.icon;
        const isActive = phase === activePhase;
        const isPast = i < activeIdx || status === 'complete';
        const isFuture = i > activeIdx && status !== 'complete';

        return (
          <div key={phase} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`w-4 h-px ${isPast ? 'bg-[hsl(var(--status-success))]' : isActive ? 'bg-accent' : 'bg-border'}`} />
            )}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-medium transition-all duration-300 ${
              isActive ? `bg-accent/10 border border-accent/30 ${cfg.color}` :
              isPast ? 'text-[hsl(var(--status-success))] bg-[hsl(var(--status-success))]/5' :
              'text-muted-foreground/40'
            }`}>
              <Icon className={`h-3 w-3 ${isActive ? 'animate-pulse' : ''}`} />
              {cfg.label}
              {isPast && !isActive && <CheckCircle2 className="h-2.5 w-2.5" />}
            </div>
          </div>
        );
      })}
      {status === 'complete' && (
        <Badge className="ml-auto text-[8px] h-4 bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))] border-[hsl(var(--status-success))]/20">
          ✓ Complete
        </Badge>
      )}
    </div>
  );
}

// ─── Thought Stream ─────────────────────────────────────
function ThoughtStream({ thoughts }: { thoughts: ThoughtEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thoughts.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card/50">
        <Eye className="h-3.5 w-3.5 text-accent" />
        <span className="text-[10px] font-bold text-accent">AI Consciousness</span>
        <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-auto">{thoughts.length}</Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {thoughts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40">
            <Brain className="h-5 w-5 mb-1" />
            <span className="text-[9px]">Awaiting thoughts...</span>
          </div>
        ) : thoughts.map((t) => {
          const cfg = phaseConfig[t.phase] || phaseConfig.execute;
          const Icon = cfg.icon;
          return (
            <div key={t.id} className="flex gap-1.5 text-[9px] leading-relaxed animate-in fade-in slide-in-from-left-1 duration-200">
              <div className="flex-shrink-0 mt-0.5">
                <Icon className={`h-3 w-3 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`font-mono font-medium ${cfg.color}`}>{cfg.label}</span>
                <span className="text-muted-foreground/50 mx-1">•</span>
                <span className="text-muted-foreground">{t.content}</span>
              </div>
              <span className="text-muted-foreground/30 font-mono text-[8px] flex-shrink-0">
                {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Context Sidebar ────────────────────────────────────
function ContextSidebar({ runData }: { runData: RunData }) {
  const [expandedSection, setExpandedSection] = useState<string | null>('metrics');
  const toggle = (s: string) => setExpandedSection(prev => prev === s ? null : s);

  const doneCount = runData.tasks.filter(t => t.status === 'done').length;
  const failedCount = runData.tasks.filter(t => t.status === 'failed').length;
  const scores = runData.tasks.filter(t => t.verification).map(t => t.verification!.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/30">
      {/* Metrics */}
      <SidebarSection icon={Gauge} title="Live Metrics" expanded={expandedSection === 'metrics'} onToggle={() => toggle('metrics')}>
        <div className="grid grid-cols-2 gap-1.5 p-2">
          <MetricCard label="Tasks" value={`${doneCount}/${runData.tasks.length}`} color={doneCount === runData.tasks.length ? 'success' : 'info'} />
          <MetricCard label="Failed" value={`${failedCount}`} color={failedCount > 0 ? 'error' : 'success'} />
          <MetricCard label="Avg Score" value={scores.length > 0 ? `${avgScore}` : '—'} color={avgScore >= 80 ? 'success' : avgScore >= 60 ? 'warning' : 'error'} />
          <MetricCard label="Tokens" value={runData.totalTokens > 0 ? `${(runData.totalTokens / 1000).toFixed(1)}k` : '—'} color="info" />
        </div>
      </SidebarSection>

      {/* Open Questions */}
      {runData.openQuestions?.length > 0 && (
        <SidebarSection icon={MessageCircleQuestion} title={`Open Questions (${runData.openQuestions.length})`} expanded={expandedSection === 'questions'} onToggle={() => toggle('questions')} highlight>
          <div className="p-2 space-y-1.5">
            {runData.openQuestions.map((q, i) => (
              <div key={i} className="flex gap-1.5 text-[9px] p-1.5 rounded bg-[hsl(var(--status-warning))]/5 border border-[hsl(var(--status-warning))]/20">
                <HelpCircle className="h-3 w-3 text-[hsl(var(--status-warning))] flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground leading-relaxed">{q}</span>
              </div>
            ))}
          </div>
        </SidebarSection>
      )}

      {/* Memory Bank */}
      <SidebarSection icon={Database} title={`Memory Bank${runData.memoryLoaded ? ` (${runData.memoryLoaded.reflections + runData.memoryLoaded.rules + runData.memoryLoaded.knowledge})` : ''}`} expanded={expandedSection === 'memory'} onToggle={() => toggle('memory')}>
        <div className="p-2 space-y-2">
          {runData.memoryDetail ? (
            <>
              {runData.memoryDetail.rules.length > 0 && (
                <div>
                  <div className="text-[8px] font-bold text-primary uppercase tracking-wider mb-1">Process Rules</div>
                  {runData.memoryDetail.rules.map((r, i) => (
                    <div key={i} className="text-[9px] p-1.5 rounded bg-secondary/50 mb-1 border border-border/50">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Badge variant="outline" className="text-[7px] h-3 px-1">{r.category}</Badge>
                        <span className="font-mono text-primary text-[8px]">{(r.confidence * 100).toFixed(0)}%</span>
                        <span className="text-muted-foreground/40 text-[8px] ml-auto">{r.times_applied}× applied</span>
                      </div>
                      <span className="text-muted-foreground">{r.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {runData.memoryDetail.reflections.length > 0 && (
                <div>
                  <div className="text-[8px] font-bold text-[hsl(var(--status-pending))] uppercase tracking-wider mb-1">Past Reflections</div>
                  {runData.memoryDetail.reflections.map((r, i) => (
                    <div key={i} className="text-[9px] text-muted-foreground p-1.5 rounded bg-secondary/50 mb-1 border border-border/50 leading-relaxed">
                      {r.content}
                      {r.planning_score && <span className="text-[8px] text-primary ml-1">(plan: {r.planning_score})</span>}
                    </div>
                  ))}
                </div>
              )}
              {runData.memoryDetail.knowledge.length > 0 && (
                <div>
                  <div className="text-[8px] font-bold text-accent uppercase tracking-wider mb-1">Known Concepts</div>
                  <div className="flex flex-wrap gap-1">
                    {runData.memoryDetail.knowledge.slice(0, 20).map((n, i) => (
                      <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">{n.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[9px] text-muted-foreground/40 text-center py-3">Loading memory...</div>
          )}
        </div>
      </SidebarSection>

      {/* Planning Reasoning */}
      {runData.planningReasoning && (
        <SidebarSection icon={Lightbulb} title="Planning Reasoning" expanded={expandedSection === 'reasoning'} onToggle={() => toggle('reasoning')}>
          <div className="p-2">
            <p className="text-[9px] text-muted-foreground leading-relaxed">{runData.planningReasoning}</p>
            {runData.lessonsIncorporated?.length ? (
              <div className="mt-2">
                <div className="text-[8px] font-bold text-[hsl(var(--status-warning))] uppercase tracking-wider mb-1">Lessons Applied</div>
                {runData.lessonsIncorporated.map((l, i) => (
                  <div key={i} className="text-[9px] text-muted-foreground flex gap-1 mb-0.5"><span className="text-[hsl(var(--status-warning))]">→</span> {l}</div>
                ))}
              </div>
            ) : null}
          </div>
        </SidebarSection>
      )}

      {/* Process Rules */}
      {runData.generatedRules?.length ? (
        <SidebarSection icon={Scale} title={`New Rules (${runData.generatedRules.length})`} expanded={expandedSection === 'rules'} onToggle={() => toggle('rules')}>
          <div className="p-2 space-y-1">
            {runData.generatedRules.map((r, i) => (
              <div key={i} className="text-[9px] p-1.5 rounded bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-1 mb-0.5">
                  <Badge variant="outline" className="text-[7px] h-3 px-1">{r.category}</Badge>
                  <span className="font-mono text-primary text-[8px]">{(r.confidence * 100).toFixed(0)}%</span>
                </div>
                <span className="text-muted-foreground">{r.rule_text}</span>
              </div>
            ))}
          </div>
        </SidebarSection>
      ) : null}

      {/* Reflection */}
      {runData.reflection && (
        <SidebarSection icon={Sparkles} title="Reflection" expanded={expandedSection === 'reflection'} onToggle={() => toggle('reflection')}>
          <div className="p-2 space-y-2">
            <p className="text-[9px] text-muted-foreground leading-relaxed">{runData.reflection.summary}</p>
            {runData.reflection.process_evaluation && (
              <div className="flex gap-3 justify-center py-1">
                <ScoreRing score={runData.reflection.process_evaluation.planning_score} label="Planning" />
                {runData.reflection.strategy_assessment && <ScoreRing score={runData.reflection.strategy_assessment.effectiveness_score} label="Strategy" />}
              </div>
            )}
            {runData.reflection.detected_patterns?.length ? (
              <div>
                <div className="text-[8px] font-bold text-foreground uppercase tracking-wider mb-1">Patterns</div>
                {runData.reflection.detected_patterns.map((p, i) => (
                  <div key={i} className="text-[9px] text-muted-foreground flex gap-1 mb-0.5"><span className="text-accent">◆</span> {p}</div>
                ))}
              </div>
            ) : null}
          </div>
        </SidebarSection>
      )}

      {/* Knowledge Graph */}
      {runData.knowledgeUpdate && (runData.knowledgeUpdate.nodes_added > 0 || runData.knowledgeUpdate.edges_added > 0) && (
        <div className="px-3 py-2 border-t border-border flex items-center gap-2 text-[9px] text-accent">
          <NetworkIcon className="h-3 w-3" />
          <span>+{runData.knowledgeUpdate.nodes_added} nodes, +{runData.knowledgeUpdate.edges_added} edges</span>
        </div>
      )}
    </div>
  );
}

function SidebarSection({ icon: Icon, title, children, expanded, onToggle, highlight }: {
  icon: any; title: string; children: React.ReactNode; expanded: boolean; onToggle: () => void; highlight?: boolean;
}) {
  return (
    <div className={`border-b border-border ${highlight ? 'bg-[hsl(var(--status-warning))]/3' : ''}`}>
      <button onClick={onToggle} className="flex items-center gap-1.5 w-full px-3 py-2 text-left hover:bg-secondary/30 transition-colors">
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-foreground flex-1">{title}</span>
      </button>
      {expanded && children}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClass = color === 'success' ? 'text-[hsl(var(--status-success))]' : color === 'error' ? 'text-destructive' : color === 'warning' ? 'text-[hsl(var(--status-warning))]' : 'text-[hsl(var(--status-info))]';
  return (
    <div className="p-1.5 rounded bg-secondary/50 border border-border/50 text-center">
      <div className={`text-sm font-mono font-bold ${colorClass}`}>{value}</div>
      <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ScoreRing({ score, size = 32, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'hsl(var(--status-success))' : score >= 60 ? 'hsl(var(--status-warning))' : 'hsl(var(--destructive))';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="text-[9px] font-mono font-bold" style={{ color }}>{score}</span>
      {label && <span className="text-[8px] text-muted-foreground">{label}</span>}
    </div>
  );
}

// ─── Task Status Badge ──────────────────────────────────
function TaskStatusBadge({ status }: { status: TaskPlan['status'] }) {
  const config: Record<string, { icon: any; label: string; className: string }> = {
    queued: { icon: Clock, label: 'Queued', className: 'bg-muted text-muted-foreground' },
    running: { icon: Loader2, label: 'Running', className: 'bg-accent/20 text-accent border-accent/30' },
    verifying: { icon: Shield, label: 'Verifying', className: 'bg-[hsl(var(--status-warning))]/20 text-[hsl(var(--status-warning))]' },
    done: { icon: CheckCircle2, label: 'Done', className: 'bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]' },
    failed: { icon: XCircle, label: 'Failed', className: 'bg-destructive/20 text-destructive' },
    retrying: { icon: RefreshCw, label: 'Retrying', className: 'bg-[hsl(var(--status-warning))]/20 text-[hsl(var(--status-warning))]' },
  };
  const c = config[status] || config.queued;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.className}`}>
      <Icon className={`h-3 w-3 ${status === 'running' || status === 'retrying' ? 'animate-spin' : status === 'verifying' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}

function DetailLevelBadge({ level }: { level: TaskPlan['detailLevel'] }) {
  const config: Record<string, { label: string; icon: string; className: string }> = {
    concise: { label: 'Brief', icon: '⚡', className: 'bg-muted text-muted-foreground' },
    standard: { label: 'Standard', icon: '📋', className: 'bg-primary/10 text-primary' },
    comprehensive: { label: 'Deep', icon: '🔬', className: 'bg-accent/15 text-accent' },
    exhaustive: { label: 'Research', icon: '🧠', className: 'bg-[hsl(var(--status-warning))]/15 text-[hsl(var(--status-warning))]' },
  };
  const c = config[level] || config.standard;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${c.className}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ─── Task Card (Enhanced) ───────────────────────────────
function TaskCard({ task, isExpanded, onToggle }: { task: TaskPlan; isExpanded: boolean; onToggle: () => void }) {
  const borderClass = task.status === 'running' ? 'border-accent/40 shadow-[0_0_8px_hsl(var(--accent)/0.15)]' :
    task.status === 'retrying' ? 'border-[hsl(var(--status-warning))]/40 shadow-[0_0_8px_hsl(var(--status-warning)/0.15)]' :
    task.status === 'done' ? 'border-[hsl(var(--status-success))]/30' :
    task.status === 'failed' ? 'border-destructive/30' :
    task.status === 'verifying' ? 'border-[hsl(var(--status-warning))]/30' : 'border-border';

  return (
    <div className={`rounded-lg border bg-card transition-all duration-300 ${borderClass}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition-colors rounded-lg">
        {task.output || task.reasoning ? (
          isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : <div className="w-3" />}
        <TaskStatusBadge status={task.status} />
        <span className="text-[11px] font-medium text-foreground flex-1 truncate">{task.title}</span>
        {task.retried && <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-[hsl(var(--status-warning))]/40 text-[hsl(var(--status-warning))]">⟳ Retried</Badge>}
        <DetailLevelBadge level={task.detailLevel} />
        {task.verification && (
          <Badge variant={task.verification.passed ? 'default' : 'destructive'} className="text-[9px] h-4 px-1.5 font-mono">
            {task.verification.score}/100
          </Badge>
        )}
        <span className="text-[9px] text-muted-foreground font-mono">P{task.priority}</span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/50 mt-0">
          {/* Task reasoning */}
          {task.reasoning && (
            <div className="mt-2 p-2 rounded-md bg-primary/5 border border-primary/15 text-[9px]">
              <div className="flex items-center gap-1 font-semibold text-primary mb-0.5">
                <Lightbulb className="h-3 w-3" /> Task Rationale
              </div>
              <p className="text-muted-foreground leading-relaxed">{task.reasoning}</p>
            </div>
          )}

          {/* Acceptance Criteria */}
          {task.acceptanceCriteria?.length ? (
            <div className="mt-2 p-2 rounded-md bg-secondary/50 border border-border/50 text-[9px]">
              <div className="flex items-center gap-1 font-semibold text-muted-foreground mb-1">
                <Target className="h-3 w-3" /> Acceptance Criteria
              </div>
              {task.acceptanceCriteria.map((c, j) => {
                const result = task.verification?.criteria_results?.find(cr => cr.criterion === c);
                return (
                  <div key={j} className="flex items-start gap-1.5 mt-0.5">
                    {result ? (
                      result.met ? <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--status-success))] mt-0.5 flex-shrink-0" /> : <XCircle className="h-2.5 w-2.5 text-destructive mt-0.5 flex-shrink-0" />
                    ) : <div className="w-2.5 h-2.5 rounded-full border border-muted-foreground/30 mt-0.5 flex-shrink-0" />}
                    <span className="text-muted-foreground">{c}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Retry diagnosis */}
          {task.retryDiagnosis && (
            <div className="mt-2 p-2 rounded-md bg-[hsl(var(--status-warning))]/5 border border-[hsl(var(--status-warning))]/20 text-[10px]">
              <div className="flex items-center gap-1 font-semibold text-[hsl(var(--status-warning))] mb-1">
                <RefreshCw className="h-3 w-3" /> Retry Diagnosis
              </div>
              <p className="text-muted-foreground leading-relaxed">{task.retryDiagnosis}</p>
            </div>
          )}

          {/* Task output */}
          {task.output && (
            <div className="mt-2.5 max-h-[500px] overflow-y-auto pr-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {task.output}
              </ReactMarkdown>
            </div>
          )}

          {/* Verification result */}
          {task.verification && (
            <div className={`mt-3 p-2.5 rounded-md text-[10px] border ${
              task.verification.passed ? 'bg-[hsl(var(--status-success))]/5 border-[hsl(var(--status-success))]/20' : 'bg-destructive/5 border-destructive/20'
            }`}>
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                {task.verification.passed ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--status-success))]" /> : <XCircle className="h-3 w-3 text-destructive" />}
                <span>{task.verification.passed ? 'Passed' : 'Failed'}: {task.verification.summary}</span>
              </div>
              {task.verification.criteria_results?.map((cr, j) => (
                <div key={j} className="flex items-start gap-1.5 mt-1 ml-4">
                  {cr.met
                    ? <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--status-success))] mt-0.5 flex-shrink-0" />
                    : <XCircle className="h-2.5 w-2.5 text-destructive mt-0.5 flex-shrink-0" />}
                  <span className="text-muted-foreground"><strong className="text-foreground">{cr.criterion}:</strong> {cr.reasoning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mission Control (full run view) ────────────────────
function MissionControl({ runData }: { runData: RunData }) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  useEffect(() => {
    const running = runData.tasks.findIndex(t => t.status === 'running' || t.status === 'verifying' || t.status === 'retrying');
    if (running >= 0) setExpandedTasks(prev => new Set([...prev, running]));
  }, [runData.tasks]);

  const toggleTask = (i: number) => {
    setExpandedTasks(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Phase Pipeline */}
      <PhasePipeline activePhase={runData.activePhase} status={runData.status} />

      {/* Goal bar */}
      <div className="px-3 py-2 border-b border-border bg-card/50 flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-[11px] font-medium text-foreground truncate flex-1">{runData.goal}</span>
        <ComplexityBadge complexity={runData.overallComplexity} />
        {runData.totalTokens > 0 && <span className="text-[9px] text-muted-foreground font-mono">{runData.totalTokens.toLocaleString()} tok</span>}
        <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono">{runData.runId.slice(0, 12)}</Badge>
      </div>

      {/* Three-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Thought Stream */}
        <div className="w-64 flex-shrink-0 border-r border-border overflow-hidden">
          <ThoughtStream thoughts={runData.thoughts} />
        </div>

        {/* Center: Tasks */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {runData.approach && (
            <div className="text-[10px] text-muted-foreground italic px-1 mb-1">
              <span className="text-foreground font-medium">Approach:</span> {runData.approach}
            </div>
          )}

          {runData.tasks.length === 0 && runData.status === 'planning' && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Planning tasks...</span>
            </div>
          )}

          {runData.tasks.map((task, i) => (
            <TaskCard key={task.id || i} task={task} isExpanded={expandedTasks.has(i)} onToggle={() => toggleTask(i)} />
          ))}

          {/* Deep Reflection Panel */}
          {runData.reflection && (
            <DeepReflectionPanel reflection={runData.reflection} knowledgeUpdate={runData.knowledgeUpdate} generatedRules={runData.generatedRules} />
          )}
        </div>

        {/* Right: Context Sidebar */}
        <div className="w-56 flex-shrink-0 overflow-y-auto">
          <ContextSidebar runData={runData} />
        </div>
      </div>
    </div>
  );
}

function ComplexityBadge({ complexity }: { complexity: RunData['overallComplexity'] }) {
  const config: Record<string, { label: string; className: string; bars: number }> = {
    simple: { label: 'Simple', className: 'text-muted-foreground', bars: 1 },
    moderate: { label: 'Moderate', className: 'text-primary', bars: 2 },
    complex: { label: 'Complex', className: 'text-accent', bars: 3 },
    'research-grade': { label: 'Research', className: 'text-[hsl(var(--status-warning))]', bars: 4 },
  };
  const c = config[complexity] || config.moderate;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-medium ${c.className}`}>
      <span className="flex gap-0.5">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className={`w-1 rounded-full ${i < c.bars ? 'bg-current' : 'bg-muted'}`} style={{ height: `${6 + i * 2}px` }} />
        ))}
      </span>
      {c.label}
    </span>
  );
}

// ─── Deep Reflection Panel ──────────────────────────────
function DeepReflectionPanel({ reflection, knowledgeUpdate, generatedRules }: { reflection: ReflectionData; knowledgeUpdate: RunData['knowledgeUpdate']; generatedRules?: ProcessRule[] }) {
  const pe = reflection.process_evaluation;
  const sa = reflection.strategy_assessment;

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3.5 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
        <Sparkles className="h-3.5 w-3.5" /> Deep Self-Reflection
      </div>

      {/* Internal Monologue */}
      {reflection.internal_monologue && (
        <div className="p-2.5 rounded-md bg-[hsl(var(--terminal-bg))] border border-border/50 text-[9px] font-mono text-[hsl(var(--terminal-fg))] leading-relaxed max-h-48 overflow-y-auto">
          <div className="flex items-center gap-1 text-[8px] text-muted-foreground mb-1.5 uppercase tracking-wider">
            <ScanEye className="h-3 w-3" /> Internal Monologue
          </div>
          {reflection.internal_monologue}
        </div>
      )}

      <p className="text-xs text-secondary-foreground leading-relaxed">{reflection.summary}</p>

      {/* Scores */}
      {(pe || sa) && (
        <div className="flex items-center gap-4 p-2.5 rounded-md bg-card border border-border">
          {pe && <ScoreRing score={pe.planning_score} label="Planning" />}
          {sa && <ScoreRing score={sa.effectiveness_score} label="Strategy" />}
          <div className="flex-1 space-y-1 text-[9px]">
            {pe && (
              <div className="flex flex-wrap gap-1.5">
                <span className={`px-1.5 py-0.5 rounded ${pe.complexity_calibration_accurate ? 'bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))]' : 'bg-destructive/10 text-destructive'}`}>
                  {pe.complexity_calibration_accurate ? '✓' : '✗'} Complexity Cal.
                </span>
                <span className={`px-1.5 py-0.5 rounded ${pe.tasks_well_scoped ? 'bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))]' : 'bg-destructive/10 text-destructive'}`}>
                  {pe.tasks_well_scoped ? '✓' : '✗'} Task Scoping
                </span>
                <span className={`px-1.5 py-0.5 rounded ${pe.detail_levels_appropriate ? 'bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))]' : 'bg-destructive/10 text-destructive'}`}>
                  {pe.detail_levels_appropriate ? '✓' : '✗'} Detail Levels
                </span>
              </div>
            )}
            {pe?.planning_notes && <p className="text-muted-foreground italic">{pe.planning_notes}</p>}
          </div>
        </div>
      )}

      {/* Strategy */}
      {sa && (
        <div className="space-y-1.5">
          {sa.what_worked?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[hsl(var(--status-success))] flex items-center gap-1"><TrendingUp className="h-3 w-3" /> What Worked</div>
              <ul className="space-y-0.5 mt-0.5">
                {sa.what_worked.map((w, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-[hsl(var(--status-success))]">+</span> {w}</li>)}
              </ul>
            </div>
          )}
          {sa.what_failed?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> What Failed</div>
              <ul className="space-y-0.5 mt-0.5">
                {sa.what_failed.map((f, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-destructive">−</span> {f}</li>)}
              </ul>
            </div>
          )}
          {sa.would_change && <p className="text-[10px] text-muted-foreground italic">💡 Would change: {sa.would_change}</p>}
        </div>
      )}

      {/* Patterns */}
      {reflection.detected_patterns?.length ? (
        <div>
          <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1"><Activity className="h-3 w-3" /> Detected Patterns</div>
          <ul className="space-y-0.5">
            {reflection.detected_patterns.map((p, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-accent">◆</span> {p}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Lessons */}
      {reflection.lessons?.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Lessons</div>
          <ul className="space-y-0.5">
            {reflection.lessons.map((l, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-accent">•</span> {l}</li>)}
          </ul>
        </div>
      )}

      {/* Generated Rules */}
      {(generatedRules || reflection.new_process_rules)?.length ? (
        <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
          <div className="text-[10px] font-semibold text-primary mb-1 flex items-center gap-1"><Scale className="h-3 w-3" /> New Process Rules</div>
          <div className="space-y-1">
            {(generatedRules || reflection.new_process_rules || []).map((rule, i) => (
              <div key={i} className="flex items-start gap-2 text-[9px]">
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 flex-shrink-0">{rule.category}</Badge>
                <span className="text-muted-foreground flex-1">{rule.rule_text}</span>
                <span className="font-mono text-primary flex-shrink-0">{(rule.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Self-Tests */}
      {reflection.self_test_proposals?.length ? (
        <div>
          <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1"><FlaskConical className="h-3 w-3" /> Self-Test Proposals</div>
          <ul className="space-y-0.5">
            {reflection.self_test_proposals.map((t, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-primary">🧪</span> {t}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Knowledge */}
      {knowledgeUpdate && (knowledgeUpdate.nodes_added > 0 || knowledgeUpdate.edges_added > 0) && (
        <div className="flex items-center gap-3 pt-1 border-t border-accent/20 text-[9px] text-accent">
          <span className="flex items-center gap-1"><Database className="h-3 w-3" /> +{knowledgeUpdate.nodes_added} nodes</span>
          <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> +{knowledgeUpdate.edges_added} edges</span>
        </div>
      )}
      {reflection.knowledge_nodes?.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {reflection.knowledge_nodes.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-[9px] text-muted-foreground border border-border">
              <NetworkIcon className="h-2.5 w-2.5 text-accent" /> {n.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Example Goals ──────────────────────────────────────
const EXAMPLE_GOALS = [
  { icon: "🏗️", text: "Design a scalable microservices architecture for an e-commerce platform with 10M daily users" },
  { icon: "🔐", text: "Create a zero-trust security model for a healthcare API handling HIPAA-compliant data" },
  { icon: "📊", text: "Analyze trade-offs between event sourcing vs CRUD for a financial trading platform" },
  { icon: "🧪", text: "Build a comprehensive testing strategy for a real-time multiplayer game server" },
  { icon: "🤖", text: "Design an AI agent orchestration system that can self-improve and handle failures gracefully" },
  { icon: "⚡", text: "Optimize a Node.js API that's currently handling 100 req/s to handle 10,000 req/s" },
];

// ─── Main Chat ──────────────────────────────────────────
export function AIMChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get the active run (last assistant message with runData)
  const activeRun = [...messages].reverse().find(m => m.role === 'assistant' && m.runData)?.runData;
  const showMissionControl = activeRun && activeRun.status !== 'complete';

  useEffect(() => {
    if (scrollRef.current && !showMissionControl) {
      const el = scrollRef.current;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages, showMissionControl]);

  const executeGoal = useCallback(async (text: string) => {
    if (!text.trim() || isRunning) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim(), timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId, role: 'assistant', content: '', timestamp: Date.now(),
      runData: {
        runId: '', goal: text.trim(), approach: '', planningReasoning: '', openQuestions: [],
        overallComplexity: 'moderate', tasks: [], thoughts: [], reflection: null,
        knowledgeUpdate: null, status: 'planning', totalTokens: 0, activePhase: 'memory',
      },
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsRunning(true);

    emitSystemEvent('plan', `New goal: ${text.trim().slice(0, 80)}...`);

    const conversationHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    const updateRun = (updater: (rd: RunData) => RunData) => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, runData: updater(m.runData!) } : m));
    };

    const addThought = (phase: ThoughtEntry['phase'], content: string) => {
      updateRun(rd => ({
        ...rd,
        activePhase: phase,
        thoughts: [...rd.thoughts, { id: crypto.randomUUID(), timestamp: Date.now(), phase, content }],
      }));
    };

    try {
      await streamAIMOS({
        conversationHistory,
        onThinking: (phase, content) => addThought(phase as ThoughtEntry['phase'], content),
        onMemoryDetail: (data) => updateRun(rd => ({ ...rd, memoryDetail: data })),
        onOpenQuestions: (questions) => updateRun(rd => ({ ...rd, openQuestions: questions })),
        onPlan: (data) => {
          updateRun(rd => ({
            ...rd,
            runId: data.run_id || rd.runId,
            goal: data.goal,
            approach: data.approach || '',
            planningReasoning: data.planning_reasoning || '',
            openQuestions: data.open_questions || rd.openQuestions,
            overallComplexity: data.overall_complexity || 'moderate',
            memoryLoaded: data.memory_loaded,
            lessonsIncorporated: data.lessons_incorporated || [],
            activePhase: 'execute',
            tasks: data.tasks.map((t: any) => ({
              id: t.id, index: t.index, title: t.title, status: 'queued' as const,
              priority: t.priority, criteriaCount: t.criteria_count,
              detailLevel: t.detail_level || 'standard',
              expectedSections: t.expected_sections || 4,
              reasoning: t.reasoning || '',
              depthGuidance: t.depth_guidance || '',
              acceptanceCriteria: t.acceptance_criteria || [],
              output: '', verification: undefined,
            })),
            status: 'executing',
          }));
          emitSystemEvent('plan', `Plan: ${data.tasks.length} tasks (${data.overall_complexity})`, { task_count: data.tasks.length });
        },
        onTaskStart: (idx, taskId, title) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], id: taskId, status: 'running' };
            return { ...rd, tasks, activePhase: 'execute' };
          });
          emitSystemEvent('task_start', `▶ Task ${idx + 1}: ${title}`);
        },
        onTaskDelta: (idx, delta) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], output: tasks[idx].output + delta };
            return { ...rd, tasks };
          });
        },
        onTaskVerifyStart: (idx) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'verifying' };
            return { ...rd, tasks, activePhase: 'verify' };
          });
          emitSystemEvent('verify', `🛡️ Verifying task ${idx + 1}...`);
        },
        onTaskVerified: (idx, verification) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], verification };
            return { ...rd, tasks };
          });
          emitSystemEvent('verify', `${verification.passed ? '✅' : '❌'} Task ${idx + 1}: ${verification.score}/100`);
        },
        onTaskComplete: (idx, status) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: status as any };
            return { ...rd, tasks };
          });
          emitSystemEvent(status === 'done' ? 'task_done' : 'task_fail', `${status === 'done' ? '✓' : '✗'} Task ${idx + 1} ${status}`);
        },
        onTaskError: (idx, error) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'failed', output: tasks[idx].output + `\n\n❌ **Error:** ${error}` };
            return { ...rd, tasks };
          });
          emitSystemEvent('error', `Task ${idx + 1} failed: ${error}`);
        },
        onTaskRetryStart: (idx, reason) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'retrying', output: '', retried: true };
            return { ...rd, tasks, activePhase: 'retry' };
          });
          emitSystemEvent('retry', `🔄 Retrying task ${idx + 1}`);
        },
        onTaskRetryDiagnosis: (idx, diagnosis) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], retryDiagnosis: diagnosis };
            return { ...rd, tasks };
          });
        },
        onReflectionStart: () => {
          updateRun(rd => ({ ...rd, status: 'reflecting', activePhase: 'reflect' }));
          emitSystemEvent('reflect', '🔮 Deep self-reflecting...');
        },
        onReflection: (data) => {
          updateRun(rd => ({ ...rd, reflection: data }));
          emitSystemEvent('reflect', `Planning: ${data.process_evaluation?.planning_score}/100, Strategy: ${data.strategy_assessment?.effectiveness_score}/100`);
        },
        onKnowledgeUpdate: (data) => {
          updateRun(rd => ({ ...rd, knowledgeUpdate: data }));
          emitSystemEvent('knowledge', `+${data.nodes_added} nodes, +${data.edges_added} edges`);
        },
        onProcessEvaluation: () => {},
        onRulesGenerated: (data) => {
          updateRun(rd => ({ ...rd, generatedRules: data.rules, activePhase: 'evolve' }));
          emitSystemEvent('reflect', `Generated ${data.rules?.length || 0} new process rules`);
        },
        onRunComplete: (data) => {
          updateRun(rd => ({ ...rd, status: 'complete', totalTokens: data.total_tokens, activePhase: 'complete' }));
          setIsRunning(false);
          emitSystemEvent('complete', `Run complete: ${data.task_count} tasks, ${data.total_tokens?.toLocaleString()} tokens`);
        },
        onError: (error) => {
          toast.error(error);
          setIsRunning(false);
          setMessages(prev => prev.filter(m => m.id !== assistantId));
          emitSystemEvent('error', error);
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
      setIsRunning(false);
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    }
  }, [messages, isRunning]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); executeGoal(input); }
  };

  // ─── ACTIVE RUN: Mission Control ──────────────────────
  if (showMissionControl && activeRun) {
    return (
      <div className="flex flex-col h-full bg-background">
        <MissionControl runData={activeRun} />
        <div className="border-t border-border p-2 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 max-w-4xl mx-auto text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span>AIM-OS is executing... watching AI consciousness in real-time</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── CHAT VIEW (idle or completed runs) ───────────────
  return (
    <div className="flex flex-col h-full bg-background">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 px-4 py-8">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto pulse-glow">
                <Brain className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold gradient-text">AIM-OS</h2>
                <p className="text-xs text-muted-foreground mt-1">Autonomous Intelligence Machine • Self-Evolving Operating System</p>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                Give me any goal. I'll load memory from past runs, plan with learned process rules,
                execute with calibrated detail, verify & retry failures, then deeply reflect —
                showing you every thought and decision along the way.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
              {[
                { icon: Database, label: 'Memory', desc: 'Load past lessons' },
                { icon: Target, label: 'Plan', desc: 'Decompose + calibrate' },
                { icon: Zap, label: 'Execute', desc: 'AI runs each task' },
                { icon: Shield, label: 'Verify', desc: 'Check criteria' },
                { icon: RefreshCw, label: 'Retry', desc: 'Diagnose & fix' },
                { icon: Sparkles, label: 'Reflect', desc: 'Meta-cognition' },
                { icon: TrendingUp, label: 'Evolve', desc: 'Generate rules' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight className="h-3 w-3 text-border" />}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card">
                    <step.icon className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <div className="font-semibold text-foreground">{step.label}</div>
                      <div className="text-[9px] text-muted-foreground">{step.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-w-3xl w-full">
              {EXAMPLE_GOALS.map((goal, i) => (
                <button key={i} onClick={() => executeGoal(goal.text)}
                  className="group text-left text-xs p-3.5 rounded-lg border border-border bg-card hover:bg-secondary hover:border-primary/30 transition-all duration-200">
                  <span className="text-sm">{goal.icon}</span>
                  <p className="text-muted-foreground group-hover:text-foreground transition-colors mt-1 leading-relaxed line-clamp-2">{goal.text}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end mb-1">
                    <div className="flex items-start gap-2 max-w-[85%]">
                      <div className="bg-primary text-primary-foreground rounded-xl rounded-tr-sm px-4 py-2.5 shadow-sm">
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                        <div className="text-[9px] opacity-60 mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                      </div>
                      <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ) : msg.runData?.status === 'complete' ? (
                  <CompletedRunCard runData={msg.runData} />
                ) : msg.runData ? (
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Initializing AIM-OS...</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 bg-card/80 backdrop-blur-sm">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => setMessages([])} className="flex-shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground" title="New conversation">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRunning ? "AIM-OS is executing..." : "Describe your goal..."}
              rows={1}
              disabled={isRunning}
              className="w-full resize-none bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 transition-all"
              style={{ minHeight: '42px', maxHeight: '120px' }}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
            />
          </div>
          <Button onClick={() => executeGoal(input)} disabled={isRunning || !input.trim()} size="icon" className="flex-shrink-0 h-10 w-10">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Completed Run Card ─────────────────────────────────
function CompletedRunCard({ runData }: { runData: RunData }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const doneCount = runData.tasks.filter(t => t.status === 'done').length;
  const scores = runData.tasks.filter(t => t.verification).map(t => t.verification!.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const toggleTask = (i: number) => {
    setExpandedTasks(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  };

  return (
    <div className="bg-card border border-[hsl(var(--status-success))]/20 rounded-xl shadow-sm overflow-hidden">
      {/* Summary bar */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--status-success))]/10 flex items-center justify-center flex-shrink-0">
          <Brain className="h-4 w-4 text-[hsl(var(--status-success))]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-foreground">AIM-OS</span>
            <ComplexityBadge complexity={runData.overallComplexity} />
            <Badge className="text-[9px] h-4 px-1.5 bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))] border-[hsl(var(--status-success))]/20">
              ✅ {doneCount}/{runData.tasks.length} • avg {avgScore}/100
            </Badge>
            {runData.totalTokens > 0 && <span className="text-[9px] text-muted-foreground font-mono">{runData.totalTokens.toLocaleString()} tok</span>}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{runData.goal}</p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50">
          {/* Thoughts summary */}
          {runData.thoughts.length > 0 && (
            <details className="mt-3">
              <summary className="text-[10px] font-medium text-accent cursor-pointer flex items-center gap-1">
                <Eye className="h-3 w-3" /> View AI Consciousness ({runData.thoughts.length} thoughts)
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5 p-2 rounded-md bg-[hsl(var(--terminal-bg))] border border-border/50">
                {runData.thoughts.map(t => {
                  const cfg = phaseConfig[t.phase] || phaseConfig.execute;
                  return (
                    <div key={t.id} className="text-[8px] font-mono text-[hsl(var(--terminal-fg))]">
                      <span className={cfg.color}>[{cfg.label}]</span> {t.content}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {/* Tasks */}
          <div className="space-y-1.5 mt-2">
            {runData.tasks.map((task, i) => (
              <TaskCard key={task.id || i} task={task} isExpanded={expandedTasks.has(i)} onToggle={() => toggleTask(i)} />
            ))}
          </div>

          {/* Reflection */}
          {runData.reflection && (
            <DeepReflectionPanel reflection={runData.reflection} knowledgeUpdate={runData.knowledgeUpdate} generatedRules={runData.generatedRules} />
          )}
        </div>
      )}
    </div>
  );
}