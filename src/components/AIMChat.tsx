import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send, Bot, User, Loader2, Trash2, Brain, CheckCircle2,
  XCircle, Clock, Zap, ChevronDown, ChevronRight, Shield,
  Sparkles, Target, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import * as persistence from '@/lib/persistence';

// ─── Types ──────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  runData?: RunData;
}

interface TaskPlan {
  id: number;
  title: string;
  status: 'queued' | 'running' | 'verifying' | 'done' | 'failed';
  output: string;
  verification?: { passed: boolean; score: number; summary: string; criteria_results?: Array<{ criterion: string; met: boolean; reasoning: string }> };
}

interface RunData {
  goal: string;
  tasks: TaskPlan[];
  reflection: string;
  status: 'planning' | 'executing' | 'reflecting' | 'complete' | 'error';
  currentTaskIndex: number;
}

// ─── Stream Parser ──────────────────────────────────────
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aim-chat`;

async function streamAIMOS({
  userMessage,
  conversationHistory,
  onPlan,
  onTaskStart,
  onTaskDelta,
  onTaskVerifyStart,
  onTaskVerified,
  onTaskComplete,
  onTaskError,
  onReflectionStart,
  onReflectionDelta,
  onRunComplete,
  onError,
}: {
  userMessage: string;
  conversationHistory: { role: string; content: string }[];
  onPlan: (data: { goal: string; tasks: { id: number; title: string; status: string }[] }) => void;
  onTaskStart: (taskIndex: number, title: string) => void;
  onTaskDelta: (taskIndex: number, delta: string) => void;
  onTaskVerifyStart: (taskIndex: number) => void;
  onTaskVerified: (taskIndex: number, verification: any) => void;
  onTaskComplete: (taskIndex: number) => void;
  onTaskError: (taskIndex: number, error: string) => void;
  onReflectionStart: () => void;
  onReflectionDelta: (delta: string) => void;
  onRunComplete: () => void;
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
          case 'task_start': onTaskStart(evt.task_index, evt.title); break;
          case 'task_delta': onTaskDelta(evt.task_index, evt.delta); break;
          case 'task_verify_start': onTaskVerifyStart(evt.task_index); break;
          case 'task_verified': onTaskVerified(evt.task_index, evt.verification); break;
          case 'task_complete': onTaskComplete(evt.task_index); break;
          case 'task_error': onTaskError(evt.task_index, evt.error); break;
          case 'reflection_start': onReflectionStart(); break;
          case 'reflection_delta': onReflectionDelta(evt.delta); break;
          case 'run_complete': onRunComplete(); break;
        }
      } catch {
        // partial JSON, put back
        buf = line + "\n" + buf;
        break;
      }
    }
  }
}

// ─── Task Status Indicator ──────────────────────────────
function TaskStatusIcon({ status }: { status: TaskPlan['status'] }) {
  switch (status) {
    case 'queued': return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'running': return <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" />;
    case 'verifying': return <Shield className="h-3.5 w-3.5 text-[hsl(var(--status-warning))] animate-pulse" />;
    case 'done': return <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--status-success))]" />;
    case 'failed': return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
}

// ─── Task Card ──────────────────────────────────────────
function TaskCard({ task, isExpanded, onToggle }: { task: TaskPlan; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-md border transition-all ${
      task.status === 'running' ? 'border-accent bg-accent/5' :
      task.status === 'done' ? 'border-[hsl(var(--status-success))]/30 bg-[hsl(var(--status-success))]/5' :
      task.status === 'failed' ? 'border-destructive/30 bg-destructive/5' :
      task.status === 'verifying' ? 'border-[hsl(var(--status-warning))]/30 bg-[hsl(var(--status-warning))]/5' :
      'border-border bg-card'
    }`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <TaskStatusIcon status={task.status} />
        <span className="text-xs font-medium text-foreground flex-1 truncate">{task.title}</span>
        {task.verification && (
          <Badge variant={task.verification.passed ? 'default' : 'destructive'} className="text-[10px] h-4 px-1.5">
            {task.verification.score}/100
          </Badge>
        )}
        {task.output ? (
          isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : null}
      </button>
      {isExpanded && task.output && (
        <div className="px-3 pb-3 border-t border-border/50">
          <div className="mt-2 text-xs prose-aim max-h-[300px] overflow-y-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              h1: ({children}) => <h1 className="text-sm font-bold text-foreground mt-3 mb-1">{children}</h1>,
              h2: ({children}) => <h2 className="text-xs font-bold text-foreground mt-2 mb-1">{children}</h2>,
              h3: ({children}) => <h3 className="text-xs font-semibold text-foreground mt-2 mb-1">{children}</h3>,
              p: ({children}) => <p className="text-xs text-secondary-foreground mb-1.5 leading-relaxed">{children}</p>,
              ul: ({children}) => <ul className="text-xs text-secondary-foreground ml-3 mb-1.5 space-y-0.5">{children}</ul>,
              ol: ({children}) => <ol className="text-xs text-secondary-foreground ml-3 mb-1.5 space-y-0.5 list-decimal">{children}</ol>,
              li: ({children}) => <li className="text-xs">{children}</li>,
              code: ({className, children}) => {
                const isBlock = className?.includes('language-');
                return isBlock
                  ? <pre className="bg-[hsl(var(--code-bg))] text-[hsl(var(--code-fg))] p-2 rounded text-[10px] font-mono overflow-x-auto my-1.5"><code>{children}</code></pre>
                  : <code className="bg-secondary px-1 py-0.5 rounded text-[10px] font-mono text-accent">{children}</code>;
              },
              strong: ({children}) => <strong className="font-semibold text-foreground">{children}</strong>,
              table: ({children}) => <table className="text-[10px] border-collapse my-1.5 w-full">{children}</table>,
              th: ({children}) => <th className="border border-border px-2 py-1 bg-secondary text-left font-medium">{children}</th>,
              td: ({children}) => <td className="border border-border px-2 py-1">{children}</td>,
            }}>{task.output}</ReactMarkdown>
          </div>
          {task.verification && (
            <div className={`mt-2 p-2 rounded text-[10px] ${task.verification.passed ? 'bg-[hsl(var(--status-success))]/10 border border-[hsl(var(--status-success))]/20' : 'bg-destructive/10 border border-destructive/20'}`}>
              <div className="flex items-center gap-1.5 font-medium">
                {task.verification.passed ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--status-success))]" /> : <XCircle className="h-3 w-3 text-destructive" />}
                Verification: {task.verification.summary}
              </div>
              {task.verification.criteria_results?.map((cr, i) => (
                <div key={i} className="flex items-start gap-1.5 mt-1 ml-4">
                  {cr.met ? <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--status-success))] mt-0.5" /> : <XCircle className="h-2.5 w-2.5 text-destructive mt-0.5" />}
                  <span className="text-muted-foreground">{cr.criterion}: {cr.reasoning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Run Visualization (the assistant message) ──────────
function RunVisualization({ runData }: { runData: RunData }) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  // Auto-expand the currently running task
  useEffect(() => {
    const running = runData.tasks.findIndex(t => t.status === 'running' || t.status === 'verifying');
    if (running >= 0) {
      setExpandedTasks(prev => new Set([...prev, running]));
    }
  }, [runData.tasks]);

  const toggleTask = (i: number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const doneCount = runData.tasks.filter(t => t.status === 'done').length;
  const totalCount = runData.tasks.length;
  const avgScore = runData.tasks.filter(t => t.verification).reduce((s, t) => s + (t.verification?.score || 0), 0) / (runData.tasks.filter(t => t.verification).length || 1);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center">
          <Brain className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
            AIM-OS
            <Badge variant="outline" className="text-[9px] h-3.5 px-1">
              {runData.status === 'planning' ? '📋 Planning' :
               runData.status === 'executing' ? `⚡ Executing ${doneCount}/${totalCount}` :
               runData.status === 'reflecting' ? '🔮 Reflecting' :
               runData.status === 'complete' ? `✅ Done (avg ${Math.round(avgScore)}/100)` :
               '❌ Error'}
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground">{runData.goal}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
          style={{ width: `${(doneCount / Math.max(totalCount, 1)) * 100}%` }}
        />
      </div>

      {/* Task cards */}
      <div className="space-y-1.5">
        {runData.tasks.map((task, i) => (
          <TaskCard
            key={i}
            task={task}
            isExpanded={expandedTasks.has(i)}
            onToggle={() => toggleTask(i)}
          />
        ))}
      </div>

      {/* Reflection */}
      {runData.reflection && (
        <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-accent mb-1.5">
            <Sparkles className="h-3 w-3" /> Self-Reflection
          </div>
          <div className="text-xs text-secondary-foreground leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              p: ({children}) => <p className="text-xs text-secondary-foreground mb-1">{children}</p>,
              strong: ({children}) => <strong className="font-semibold text-foreground">{children}</strong>,
            }}>{runData.reflection}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Chat Component ────────────────────────────────
const EXAMPLE_GOALS = [
  { icon: "🏗️", text: "Design a scalable microservices architecture for an e-commerce platform" },
  { icon: "🧪", text: "Create a comprehensive test strategy for a real-time collaboration app" },
  { icon: "📊", text: "Analyze the trade-offs between SQL and NoSQL for a social media feed" },
  { icon: "🔐", text: "Design a zero-trust security model for a fintech API" },
];

export function AIMChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const executeGoal = useCallback(async (text: string) => {
    if (!text.trim() || isRunning) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      runData: { goal: '', tasks: [], reflection: '', status: 'planning', currentTaskIndex: -1 },
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsRunning(true);

    const conversationHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    const updateRun = (updater: (rd: RunData) => RunData) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, runData: updater(m.runData!) } : m
      ));
    };

    try {
      await streamAIMOS({
        userMessage: text.trim(),
        conversationHistory,
        onPlan: (data) => {
          updateRun(rd => ({
            ...rd,
            goal: data.goal,
            tasks: data.tasks.map((t: any) => ({ id: t.id, title: t.title, status: 'queued' as const, output: '', verification: undefined })),
            status: 'executing',
          }));
          // Persist plan as event
          persistence.persistEvent('chat-run', 'PLAN_CREATED', { goal: data.goal, tasks: data.tasks }).catch(() => {});
        },
        onTaskStart: (idx, title) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'running' };
            return { ...rd, tasks, currentTaskIndex: idx };
          });
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
        },
        onTaskVerified: (idx, verification) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], verification };
            return { ...rd, tasks };
          });
          // Persist verification
          persistence.persistEvent('chat-run', verification.passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED', { task_index: idx, ...verification }).catch(() => {});
        },
        onTaskComplete: (idx) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'done' };
            return { ...rd, tasks };
          });
        },
        onTaskError: (idx, error) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'failed', output: tasks[idx].output + `\n\n❌ Error: ${error}` };
            return { ...rd, tasks };
          });
        },
        onReflectionStart: () => {
          updateRun(rd => ({ ...rd, status: 'reflecting' }));
        },
        onReflectionDelta: (delta) => {
          updateRun(rd => ({ ...rd, reflection: rd.reflection + delta }));
        },
        onRunComplete: () => {
          updateRun(rd => ({ ...rd, status: 'complete' }));
          setIsRunning(false);
          // Persist journal reflection
          persistence.persistJournalEntry({
            entry_type: 'reflection',
            title: 'Chat run completed',
            content: 'Run completed via chat interface',
            tags: ['chat', 'auto'],
            priority: 'medium',
          }).catch(() => {});
        },
        onError: (error) => {
          toast.error(error);
          setIsRunning(false);
          setMessages(prev => prev.filter(m => m.id !== assistantId));
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
      setIsRunning(false);
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    }
  }, [messages, isRunning]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeGoal(input);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 px-4">
            <div className="text-center space-y-3">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto pulse-glow">
                <Brain className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold gradient-text">AIM-OS</h2>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Give me any goal. I'll decompose it into tasks, execute each one with AI,
                verify the results, and reflect on what I learned. Everything is persisted and auditable.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
              {EXAMPLE_GOALS.map((goal, i) => (
                <button
                  key={i}
                  onClick={() => executeGoal(goal.text)}
                  className="group text-left text-xs p-4 rounded-lg border border-border bg-card hover:bg-secondary hover:border-primary/30 transition-all duration-200"
                >
                  <span className="text-base mr-2">{goal.icon}</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">{goal.text}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-primary group-hover:translate-x-0.5 transition-all inline-block ml-1" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Target className="h-3 w-3" /> Plan</span>
              <ArrowRight className="h-2.5 w-2.5" />
              <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Execute</span>
              <ArrowRight className="h-2.5 w-2.5" />
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Verify</span>
              <ArrowRight className="h-2.5 w-2.5" />
              <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Reflect</span>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="flex items-start gap-2 max-w-[85%]">
                      <div className="bg-primary text-primary-foreground rounded-xl rounded-tr-sm px-4 py-2.5">
                        <p className="text-sm">{msg.content}</p>
                      </div>
                      <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ) : msg.runData ? (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <RunVisualization runData={msg.runData} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Initializing...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 bg-card/80 backdrop-blur-sm">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => { setMessages([]); }} className="flex-shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground" title="New conversation">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRunning ? "AIM-OS is working..." : "Give AIM-OS a goal..."}
              rows={1}
              className="w-full resize-none bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 min-h-[42px] max-h-[120px] transition-all"
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
              disabled={isRunning}
            />
          </div>
          <Button
            onClick={() => executeGoal(input)}
            disabled={!input.trim() || isRunning}
            size="icon"
            className="flex-shrink-0 h-10 w-10 rounded-xl"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
