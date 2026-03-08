import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send, Brain, CheckCircle2, XCircle, Clock, Zap, ChevronDown, ChevronRight,
  Shield, Sparkles, Target, ArrowRight, Loader2, Trash2, User,
  Activity, Database, GitBranch, BarChart3, BookOpen, Network as NetworkIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  status: 'queued' | 'running' | 'verifying' | 'done' | 'failed';
  priority: number;
  criteriaCount: number;
  detailLevel: 'concise' | 'standard' | 'comprehensive' | 'exhaustive';
  expectedSections: number;
  output: string;
  verification?: { passed: boolean; score: number; summary: string; criteria_results?: Array<{ criterion: string; met: boolean; reasoning: string }> };
}

interface ReflectionData {
  summary: string;
  lessons: string[];
  knowledge_nodes: Array<{ label: string; node_type: string }>;
  knowledge_edges?: Array<{ source_label: string; target_label: string; relation: string }>;
  improvements?: string[];
}

interface RunData {
  runId: string;
  goal: string;
  approach: string;
  overallComplexity: 'simple' | 'moderate' | 'complex' | 'research-grade';
  tasks: TaskPlan[];
  reflection: ReflectionData | null;
  knowledgeUpdate: { nodes_added: number; edges_added: number } | null;
  status: 'planning' | 'executing' | 'reflecting' | 'complete' | 'error';
  totalTokens: number;
}

// ─── System Activity Log (shared across runs) ───────────
export interface SystemEvent {
  id: string;
  timestamp: number;
  type: 'plan' | 'task_start' | 'task_done' | 'task_fail' | 'verify' | 'reflect' | 'knowledge' | 'complete' | 'error';
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
  conversationHistory,
  onPlan, onTaskStart, onTaskDelta, onTaskVerifyStart, onTaskVerified,
  onTaskComplete, onTaskError, onReflectionStart, onReflection,
  onKnowledgeUpdate, onRunComplete, onError,
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
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
}

// ─── Markdown Components ────────────────────────────────
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

// ─── Task Status ────────────────────────────────────────
function TaskStatusBadge({ status }: { status: TaskPlan['status'] }) {
  const config: Record<string, { icon: any; label: string; className: string }> = {
    queued: { icon: Clock, label: 'Queued', className: 'bg-muted text-muted-foreground' },
    running: { icon: Loader2, label: 'Running', className: 'bg-accent/20 text-accent border-accent/30' },
    verifying: { icon: Shield, label: 'Verifying', className: 'bg-[hsl(var(--status-warning))]/20 text-[hsl(var(--status-warning))]' },
    done: { icon: CheckCircle2, label: 'Done', className: 'bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]' },
    failed: { icon: XCircle, label: 'Failed', className: 'bg-destructive/20 text-destructive' },
  };
  const c = config[status] || config.queued;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.className}`}>
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : status === 'verifying' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}

// ─── Task Card ──────────────────────────────────────────
function TaskCard({ task, isExpanded, onToggle }: { task: TaskPlan; isExpanded: boolean; onToggle: () => void }) {
  const borderClass = task.status === 'running' ? 'border-accent/40 shadow-[0_0_8px_hsl(var(--accent)/0.15)]' :
    task.status === 'done' ? 'border-[hsl(var(--status-success))]/30' :
    task.status === 'failed' ? 'border-destructive/30' :
    task.status === 'verifying' ? 'border-[hsl(var(--status-warning))]/30' : 'border-border';

  return (
    <div className={`rounded-lg border bg-card transition-all duration-300 ${borderClass}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors rounded-lg">
        {task.output ? (
          isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : <div className="w-3" />}
        <TaskStatusBadge status={task.status} />
        <span className="text-xs font-medium text-foreground flex-1 truncate">{task.title}</span>
        {task.verification && (
          <Badge variant={task.verification.passed ? 'default' : 'destructive'} className="text-[9px] h-4 px-1.5 font-mono">
            {task.verification.score}/100
          </Badge>
        )}
        <span className="text-[9px] text-muted-foreground font-mono">P{task.priority}</span>
      </button>

      {isExpanded && task.output && (
        <div className="px-3 pb-3 border-t border-border/50 mt-0">
          <div className="mt-2.5 max-h-[400px] overflow-y-auto pr-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {task.output}
            </ReactMarkdown>
          </div>

          {task.verification && (
            <div className={`mt-3 p-2.5 rounded-md text-[10px] border ${
              task.verification.passed ? 'bg-[hsl(var(--status-success))]/5 border-[hsl(var(--status-success))]/20' : 'bg-destructive/5 border-destructive/20'
            }`}>
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                {task.verification.passed ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--status-success))]" /> : <XCircle className="h-3 w-3 text-destructive" />}
                <span>{task.verification.passed ? 'Passed' : 'Failed'}: {task.verification.summary}</span>
              </div>
              {task.verification.criteria_results?.map((cr, j) => (
                <div key={j} className="flex items-start gap-1.5 mt-1 ml-4.5">
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

// ─── Run Visualization ──────────────────────────────────
function RunVisualization({ runData }: { runData: RunData }) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  useEffect(() => {
    const running = runData.tasks.findIndex(t => t.status === 'running' || t.status === 'verifying');
    if (running >= 0) setExpandedTasks(prev => new Set([...prev, running]));
  }, [runData.tasks]);

  const toggleTask = (i: number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const doneCount = runData.tasks.filter(t => t.status === 'done').length;
  const failedCount = runData.tasks.filter(t => t.status === 'failed').length;
  const totalCount = runData.tasks.length;
  const scores = runData.tasks.filter(t => t.verification).map(t => t.verification!.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="space-y-3">
      {/* Run header */}
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          runData.status === 'complete' ? 'bg-[hsl(var(--status-success))]/20' :
          runData.status === 'error' ? 'bg-destructive/20' :
          'bg-primary/20 pulse-glow'
        }`}>
          <Brain className={`h-4 w-4 ${
            runData.status === 'complete' ? 'text-[hsl(var(--status-success))]' :
            runData.status === 'error' ? 'text-destructive' : 'text-primary'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-foreground">AIM-OS</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono">{runData.runId.slice(0, 12)}</Badge>
            {runData.status === 'complete' && (
              <Badge className="text-[9px] h-4 px-1.5 bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))] border-[hsl(var(--status-success))]/30">
                ✅ {doneCount}/{totalCount} tasks • avg {avgScore}/100
              </Badge>
            )}
            {runData.totalTokens > 0 && (
              <span className="text-[9px] text-muted-foreground font-mono">{runData.totalTokens.toLocaleString()} tokens</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{runData.goal}</p>
          {runData.approach && <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{runData.approach}</p>}
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${((doneCount + failedCount) / Math.max(totalCount, 1)) * 100}%`,
              background: failedCount > 0
                ? `linear-gradient(90deg, hsl(var(--status-success)) ${(doneCount/(doneCount+failedCount))*100}%, hsl(var(--destructive)) ${(doneCount/(doneCount+failedCount))*100}%)`
                : 'hsl(var(--status-success))'
            }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground font-mono">{doneCount + failedCount}/{totalCount}</span>
      </div>

      {/* Pipeline status */}
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <Target className={`h-3 w-3 ${runData.status === 'planning' ? 'text-primary animate-pulse' : runData.tasks.length > 0 ? 'text-[hsl(var(--status-success))]' : ''}`} />
        <span>Plan</span>
        <ArrowRight className="h-2 w-2" />
        <Zap className={`h-3 w-3 ${runData.status === 'executing' ? 'text-accent animate-pulse' : doneCount > 0 ? 'text-[hsl(var(--status-success))]' : ''}`} />
        <span>Execute</span>
        <ArrowRight className="h-2 w-2" />
        <Shield className={`h-3 w-3 ${runData.tasks.some(t => t.status === 'verifying') ? 'text-[hsl(var(--status-warning))] animate-pulse' : scores.length > 0 ? 'text-[hsl(var(--status-success))]' : ''}`} />
        <span>Verify</span>
        <ArrowRight className="h-2 w-2" />
        <Sparkles className={`h-3 w-3 ${runData.status === 'reflecting' ? 'text-accent animate-pulse' : runData.reflection ? 'text-[hsl(var(--status-success))]' : ''}`} />
        <span>Reflect</span>
      </div>

      {/* Task cards */}
      <div className="space-y-1.5">
        {runData.tasks.map((task, i) => (
          <TaskCard key={task.id || i} task={task} isExpanded={expandedTasks.has(i)} onToggle={() => toggleTask(i)} />
        ))}
      </div>

      {/* Reflection */}
      {runData.reflection && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Self-Reflection
          </div>
          <p className="text-xs text-secondary-foreground leading-relaxed">{runData.reflection.summary}</p>

          {runData.reflection.lessons?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> Lessons Learned
              </div>
              <ul className="space-y-0.5">
                {runData.reflection.lessons.map((l, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                    <span className="text-accent mt-0.5">•</span> {l}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {runData.reflection.improvements?.length ? (
            <div>
              <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Process Improvements
              </div>
              <ul className="space-y-0.5">
                {runData.reflection.improvements.map((imp, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                    <span className="text-[hsl(var(--status-warning))] mt-0.5">↑</span> {imp}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {runData.knowledgeUpdate && (runData.knowledgeUpdate.nodes_added > 0 || runData.knowledgeUpdate.edges_added > 0) && (
            <div className="flex items-center gap-3 pt-1 border-t border-accent/20 text-[9px] text-accent">
              <span className="flex items-center gap-1"><Database className="h-3 w-3" /> +{runData.knowledgeUpdate.nodes_added} nodes</span>
              <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> +{runData.knowledgeUpdate.edges_added} edges</span>
              <span className="text-muted-foreground">added to knowledge graph</span>
            </div>
          )}

          {runData.reflection.knowledge_nodes?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {runData.reflection.knowledge_nodes.map((n, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-[9px] text-muted-foreground border border-border">
                  <NetworkIcon className="h-2.5 w-2.5 text-accent" /> {n.label}
                </span>
              ))}
            </div>
          )}
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

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      // Only auto-scroll if user is near the bottom
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages]);

  const executeGoal = useCallback(async (text: string) => {
    if (!text.trim() || isRunning) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim(), timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId, role: 'assistant', content: '', timestamp: Date.now(),
      runData: { runId: '', goal: text.trim(), approach: '', overallComplexity: 'moderate', tasks: [], reflection: null, knowledgeUpdate: null, status: 'planning', totalTokens: 0 },
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsRunning(true);

    emitSystemEvent('plan', `New goal: ${text.trim().slice(0, 80)}...`);

    const conversationHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    const updateRun = (updater: (rd: RunData) => RunData) => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, runData: updater(m.runData!) } : m));
    };

    try {
      await streamAIMOS({
        conversationHistory,
        onPlan: (data) => {
          updateRun(rd => ({
            ...rd,
            runId: data.run_id || rd.runId,
            goal: data.goal,
            approach: data.approach || '',
            tasks: data.tasks.map((t: any) => ({
              id: t.id, index: t.index, title: t.title, status: 'queued' as const,
              priority: t.priority, criteriaCount: t.criteria_count, output: '', verification: undefined,
            })),
            status: 'executing',
          }));
          emitSystemEvent('plan', `Plan created: ${data.tasks.length} tasks for "${data.goal?.slice(0, 50)}..."`, { task_count: data.tasks.length });
        },
        onTaskStart: (idx, taskId, title) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], id: taskId, status: 'running' };
            return { ...rd, tasks };
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
            return { ...rd, tasks };
          });
          emitSystemEvent('verify', `🛡️ Verifying task ${idx + 1}...`);
        },
        onTaskVerified: (idx, verification) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], verification };
            return { ...rd, tasks };
          });
          emitSystemEvent('verify', `${verification.passed ? '✅' : '❌'} Task ${idx + 1}: ${verification.score}/100 — ${verification.summary?.slice(0, 60)}`, { score: verification.score });
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
        onReflectionStart: () => {
          updateRun(rd => ({ ...rd, status: 'reflecting' }));
          emitSystemEvent('reflect', '🔮 Self-reflecting on run...');
        },
        onReflection: (data) => {
          updateRun(rd => ({ ...rd, reflection: data }));
          emitSystemEvent('reflect', `Reflection: ${data.summary?.slice(0, 80)}...`, { lessons: data.lessons?.length, nodes: data.knowledge_nodes?.length });
        },
        onKnowledgeUpdate: (data) => {
          updateRun(rd => ({ ...rd, knowledgeUpdate: data }));
          emitSystemEvent('knowledge', `Knowledge graph: +${data.nodes_added} nodes, +${data.edges_added} edges`);
        },
        onRunComplete: (data) => {
          updateRun(rd => ({ ...rd, status: 'complete', totalTokens: data.total_tokens }));
          setIsRunning(false);
          emitSystemEvent('complete', `Run complete: ${data.task_count} tasks, ${data.total_tokens?.toLocaleString()} tokens`, data);
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

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 px-4 py-8">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto pulse-glow">
                <Brain className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold gradient-text">AIM-OS</h2>
                <p className="text-xs text-muted-foreground mt-1">Autonomous Intelligence Machine • Operating System</p>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                Give me any goal. I'll decompose it into tasks, execute each with AI, 
                verify results against acceptance criteria, reflect on what I learned, 
                and persist everything — tasks, events, knowledge graph, and journal — to the database.
              </p>
            </div>

            {/* Pipeline visualization */}
            <div className="flex items-center gap-2 text-xs">
              {[
                { icon: Target, label: 'Plan', desc: 'Decompose goal' },
                { icon: Zap, label: 'Execute', desc: 'AI runs each task' },
                { icon: Shield, label: 'Verify', desc: 'Check criteria' },
                { icon: Sparkles, label: 'Reflect', desc: 'Learn & persist' },
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

            {/* Example goals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-w-3xl w-full">
              {EXAMPLE_GOALS.map((goal, i) => (
                <button
                  key={i}
                  onClick={() => executeGoal(goal.text)}
                  className="group text-left text-xs p-3.5 rounded-lg border border-border bg-card hover:bg-secondary hover:border-primary/30 transition-all duration-200"
                >
                  <span className="text-sm">{goal.icon}</span>
                  <p className="text-muted-foreground group-hover:text-foreground transition-colors mt-1 leading-relaxed line-clamp-2">
                    {goal.text}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><Database className="h-3 w-3" /> Persisted to DB</span>
              <span className="flex items-center gap-1"><NetworkIcon className="h-3 w-3" /> Knowledge Graph</span>
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> AI Journal</span>
              <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Auditable</span>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
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
                ) : msg.runData ? (
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <RunVisualization runData={msg.runData} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Initializing AIM-OS...</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
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
              className="w-full resize-none bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 min-h-[42px] max-h-[120px] transition-all"
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
              disabled={isRunning}
            />
          </div>
          <Button onClick={() => executeGoal(input)} disabled={!input.trim() || isRunning} size="icon" className="flex-shrink-0 h-10 w-10 rounded-xl">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
