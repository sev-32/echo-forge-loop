import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore - no type declarations available
import remarkGfm from 'remark-gfm';
import {
  Brain, CheckCircle2, XCircle, Zap, Shield, Sparkles, Target,
  ArrowRight, Loader2, User, Database, RefreshCw, Lightbulb, TrendingUp,
  Layers, ScanEye, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { IconAdd } from '@/components/icons';
import { AimOSLogo } from '@/components/icons/AimOSLogo';
import { SendButton } from '@/components/chat/SendButton';
import { PipelineStepIcon } from '@/components/icons/PipelineStepIcons';

// Extracted modules
import type { ChatMessage, RunData, ThoughtEntry } from '@/components/chat/types';
import { emitSystemEvent } from '@/components/chat/system-events';
import { streamAIMOS } from '@/components/chat/stream';
import { mdComponents } from '@/components/chat/md-components';
import { ConversationSidebar } from '@/components/chat/ConversationSidebar';
import { useConversations } from '@/hooks/use-conversations';
import { MissionControl, MissionControlArchive, ComplexityBadge, PhasePipeline, ThoughtStream, ContextSidebar } from '@/components/chat/RunDashboard';
import { TaskCard } from '@/components/chat/TaskExplorer';
import { DeepReflectionPanel } from '@/components/chat/ReflectionViewer';

// Re-export for backward compatibility
export { useSystemEvents } from '@/components/chat/system-events';
export type { SystemEvent } from '@/components/chat/types';

// ─── Main Chat ──────────────────────────────────────────
export function AIMChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const {
    conversations, activeConversationId,
    loadConversation, createConversation, updateConversation,
    deleteConversation, newConversation,
  } = useConversations();

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

  const handleSelectConversation = useCallback(async (id: string) => {
    const msgs = await loadConversation(id);
    setMessages(msgs);
  }, [loadConversation]);

  const handleNewConversation = useCallback(() => {
    newConversation();
    setMessages([]);
  }, [newConversation]);

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

    const newMessages = [...messages, userMsg, assistantMsg];
    setMessages(newMessages);
    setInput('');
    setIsRunning(true);

    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation(text.trim().slice(0, 80), [userMsg, assistantMsg]);
    } else {
      await updateConversation(convId, newMessages);
    }

    emitSystemEvent('plan', `New goal: ${text.trim().slice(0, 80)}...`);

    const conversationHistory = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    const updateRun = (updater: (rd: RunData) => RunData) => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, runData: updater(m.runData!) } : m));
    };

    const addThought = (phase: ThoughtEntry['phase'], content: string) => {
      updateRun(rd => ({
        ...rd, activePhase: phase,
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
            goal: data.goal, approach: data.approach || '', planningReasoning: data.planning_reasoning || '',
            openQuestions: data.open_questions || rd.openQuestions, overallComplexity: data.overall_complexity || 'moderate',
            memoryLoaded: data.memory_loaded, lessonsIncorporated: data.lessons_incorporated || [],
            activePhase: 'execute',
            tasks: data.tasks.map((t: any) => ({
              id: t.id, index: t.index, title: t.title, status: 'queued' as const,
              priority: t.priority, criteriaCount: t.criteria_count, detailLevel: t.detail_level || 'standard',
              expectedSections: t.expected_sections || 4, reasoning: t.reasoning || '', depthGuidance: t.depth_guidance || '',
              acceptanceCriteria: t.acceptance_criteria || [], output: '', verification: undefined,
            })),
            status: 'executing',
          }));
          emitSystemEvent('plan', `Plan: ${data.tasks.length} tasks (${data.overall_complexity})`, { task_count: data.tasks.length });
        },
        onTaskStart: (idx, taskId, title, isAuditTask) => {
          updateRun(rd => {
            const tasks = [...rd.tasks];
            if (tasks[idx]) { tasks[idx] = { ...tasks[idx], id: taskId, status: 'running' }; }
            else { tasks.push({ id: taskId, index: idx, title, status: 'running', priority: 90, criteriaCount: 0, detailLevel: 'standard', expectedSections: 4, output: '' }); }
            return { ...rd, tasks };
          });
          emitSystemEvent('task_start', `Task ${idx + 1}: ${title}`);
        },
        onTaskDelta: (idx, delta) => { updateRun(rd => { const tasks = [...rd.tasks]; if (tasks[idx]) tasks[idx] = { ...tasks[idx], output: tasks[idx].output + delta }; return { ...rd, tasks }; }); },
        onTaskVerifyStart: (idx) => { updateRun(rd => { const tasks = [...rd.tasks]; if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'verifying' }; return { ...rd, tasks, activePhase: 'verify' }; }); },
        onTaskVerified: (idx, verification) => { updateRun(rd => { const tasks = [...rd.tasks]; if (tasks[idx]) tasks[idx] = { ...tasks[idx], verification }; return { ...rd, tasks }; }); emitSystemEvent('verify', `Task ${idx + 1}: ${verification.passed ? '✓' : '✗'} ${verification.score}/100`); },
        onTaskComplete: (idx, status) => { updateRun(rd => { const tasks = [...rd.tasks]; if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: status === 'done' ? 'done' : 'failed' }; return { ...rd, tasks, activePhase: 'execute' }; }); emitSystemEvent(status === 'done' ? 'task_done' : 'task_fail', `Task ${idx + 1}: ${status}`); },
        onTaskError: (idx, error) => { updateRun(rd => { const tasks = [...rd.tasks]; if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'failed', output: error }; return { ...rd, tasks }; }); emitSystemEvent('error', `Task ${idx + 1} error: ${error}`); },
        onTaskRetryStart: (idx) => { updateRun(rd => { const tasks = [...rd.tasks]; if (tasks[idx]) tasks[idx] = { ...tasks[idx], status: 'retrying', output: '', retried: true }; return { ...rd, tasks, activePhase: 'retry' }; }); emitSystemEvent('retry', `🔄 Retrying task ${idx + 1}`); },
        onTaskRetryDiagnosis: (idx, diagnosis) => { updateRun(rd => { const tasks = [...rd.tasks]; if (tasks[idx]) tasks[idx] = { ...tasks[idx], retryDiagnosis: diagnosis }; return { ...rd, tasks }; }); },
        onReflectionStart: () => { updateRun(rd => ({ ...rd, status: 'reflecting', activePhase: 'reflect' })); emitSystemEvent('reflect', '🔮 Deep self-reflecting...'); },
        onReflection: (data) => { updateRun(rd => ({ ...rd, reflection: data })); emitSystemEvent('reflect', `Planning: ${data.process_evaluation?.planning_score}/100, Strategy: ${data.strategy_assessment?.effectiveness_score}/100`); },
        onKnowledgeUpdate: (data) => { updateRun(rd => ({ ...rd, knowledgeUpdate: data })); emitSystemEvent('knowledge', `+${data.nodes_added} nodes, +${data.edges_added} edges`); },
        onProcessEvaluation: () => {},
        onRulesGenerated: (data) => { updateRun(rd => ({ ...rd, generatedRules: data.rules, activePhase: 'evolve' })); emitSystemEvent('reflect', `Generated ${data.rules?.length || 0} new process rules`); },
        onAuditStart: () => { updateRun(rd => ({ ...rd, status: 'auditing' as any, activePhase: 'audit' })); emitSystemEvent('verify', '🔍 Auditing outputs holistically...'); },
        onAuditDecision: (data) => {
          updateRun(rd => ({ ...rd, auditDecision: { verdict: data.verdict, confidence: data.confidence, reasoning: data.reasoning, style_analysis: data.style_analysis, next_actions: data.next_actions, synthesis_plan: data.synthesis_plan, additional_tasks_count: data.additional_tasks_count, loop: data.loop }, auditLoops: data.loop }));
          emitSystemEvent('verify', `Audit: ${data.verdict} (conf: ${(data.confidence * 100).toFixed(0)}%)${data.additional_tasks_count ? ` +${data.additional_tasks_count} tasks` : ''}`);
        },
        onAuditLoopStart: (loop, tasks) => { addThought('audit', `Loop ${loop}: executing ${tasks.length} deepening task(s): ${tasks.join(', ')}`); },
        onSynthesisStart: () => { updateRun(rd => ({ ...rd, status: 'synthesizing' as any, activePhase: 'synthesize' })); emitSystemEvent('task_done', '✨ Synthesizing final response...'); },
        onSynthesisComplete: (data) => { updateRun(rd => ({ ...rd, synthesizedResponse: data.response, synthesisFollowUps: data.follow_up_suggestions || [], synthesisCaveats: data.caveats || [] })); emitSystemEvent('task_done', `Synthesis complete (conf: ${((data.confidence || 0) * 100).toFixed(0)}%)`); },
        onRunComplete: (data) => {
          updateRun(rd => ({ ...rd, status: 'complete', totalTokens: data.total_tokens, activePhase: 'complete' }));
          setIsRunning(false);
          emitSystemEvent('complete', `Run complete: ${data.task_count} tasks, ${data.total_tokens?.toLocaleString()} tokens`);
          setMessages(prev => {
            if (convId) updateConversation(convId, prev, data.total_tokens);
            return prev;
          });
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
  }, [messages, isRunning, activeConversationId, createConversation, updateConversation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); executeGoal(input); }
  };

  // ─── ACTIVE RUN: Mission Control ──────────
  if (showMissionControl && activeRun) {
    return (
      <div className="flex h-full bg-background">
        {showSidebar && <ConversationSidebar conversations={conversations} activeId={activeConversationId} onSelect={handleSelectConversation} onNew={handleNewConversation} onDelete={deleteConversation} />}
        <div className="flex-1 flex flex-col">
          <MissionControl runData={activeRun} />
          <div className="border-t border-border p-2 surface-well">
            <div className="flex items-center gap-2 max-w-4xl mx-auto">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="text-engraved">AIM-OS EXECUTING • OBSERVING AI CONSCIOUSNESS</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── CHAT VIEW ───
  return (
    <div className="flex h-full bg-background">
      {showSidebar && <ConversationSidebar conversations={conversations} activeId={activeConversationId} onSelect={handleSelectConversation} onNew={handleNewConversation} onDelete={deleteConversation} />}
      <div className="flex-1 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-8 px-4 py-8">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 rounded-lg surface-bezel flex items-center justify-center mx-auto surface-glow overflow-hidden">
                  <AimOSLogo size={56} />
                </div>
                <div>
                  <h2 className="text-2xl font-mono font-bold tracking-[0.1em] text-label-primary">AIM-OS</h2>
                  <p className="text-engraved mt-1">AUTONOMOUS INTELLIGENCE MACHINE</p>
                </div>
                <p className="text-xs text-label-muted max-w-lg leading-relaxed">
                  Give me any goal. I'll load memory from past runs, plan with learned process rules,
                  execute with calibrated detail, verify & retry failures, then deeply reflect —
                  showing you every thought and decision along the way.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
                {[
                  { step: 'memory' as const, label: 'Memory', desc: 'Load past lessons' },
                  { step: 'plan' as const, label: 'Plan', desc: 'Decompose + calibrate' },
                  { step: 'execute' as const, label: 'Execute', desc: 'AI runs each task' },
                  { step: 'verify' as const, label: 'Verify', desc: 'Check criteria' },
                  { step: 'retry' as const, label: 'Retry', desc: 'Diagnose & fix' },
                  { step: 'audit' as const, label: 'Audit', desc: 'Review + decide' },
                  { step: 'synthesize' as const, label: 'Synthesize', desc: 'Polish response' },
                  { step: 'reflect' as const, label: 'Reflect', desc: 'Meta-cognition' },
                  { step: 'evolve' as const, label: 'Evolve', desc: 'Generate rules' },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-border" />}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 surface-well rounded">
                      <PipelineStepIcon step={step.step} size={14} />
                      <div>
                        <div className="font-mono font-semibold text-label-primary text-[10px] tracking-wide">{step.label.toUpperCase()}</div>
                        <div className="text-[9px] text-label-muted">{step.desc}</div>
                      </div>
                    </div>
                  </div>
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

        <div className="border-t border-border p-3 surface-well">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" onClick={handleNewConversation} className="flex-shrink-0 h-10 w-10 rail-icon" title="New conversation">
                <IconAdd size={16} />
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
                className="w-full resize-none surface-well rounded px-4 py-2.5 text-sm text-label-primary placeholder:text-label-engraved focus:outline-none focus:amber-ring disabled:opacity-50 transition-all font-mono"
                style={{ minHeight: '42px', maxHeight: '120px' }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
              />
            </div>
            <Button onClick={() => executeGoal(input)} disabled={isRunning || !input.trim()} size="icon" className="flex-shrink-0 h-10 w-10 control-button-primary">
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Completed Run Card ─────────
function CompletedRunCard({ runData }: { runData: RunData }) {
  const [viewMode, setViewMode] = useState<'summary' | 'full'>('summary');
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const doneCount = runData.tasks.filter(t => t.status === 'done').length;
  const scores = runData.tasks.filter(t => t.verification).map(t => t.verification!.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const toggleTask = (i: number) => { setExpandedTasks(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; }); };

  if (viewMode === 'full') {
    return (
      <div className="surface-well rounded overflow-hidden">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-status-success" />
            <span className="text-engraved">RUN ARCHIVE</span>
            <Badge className="text-[8px] h-4 px-1.5 bg-status-success/10 text-status-success border-0 font-mono">✓ COMPLETE</Badge>
          </div>
          <button onClick={() => setViewMode('summary')} className="rail-icon w-6 h-6"><XCircle className="w-3.5 h-3.5" /></button>
        </div>
        <div className="h-[500px]"><MissionControlArchive runData={runData} expandedTasks={expandedTasks} toggleTask={toggleTask} /></div>
      </div>
    );
  }

  return (
    <div className="surface-well rounded overflow-hidden border-status-success/20">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded surface-bezel flex items-center justify-center flex-shrink-0"><Brain className="h-4 w-4 text-status-success" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-label-primary">AIM-OS</span>
            <ComplexityBadge complexity={runData.overallComplexity} />
            <Badge className="text-[9px] h-4 px-1.5 bg-status-success/10 text-status-success border-0 font-mono">✓ {doneCount}/{runData.tasks.length} • avg {avgScore}</Badge>
            {runData.totalTokens > 0 && <span className="text-[9px] text-label-muted font-mono">{runData.totalTokens.toLocaleString()} tok</span>}
          </div>
          <p className="text-[11px] text-label-muted mt-0.5 truncate">{runData.goal}</p>
        </div>
        <button onClick={() => setViewMode('full')} className="control-button flex items-center gap-1.5" title="View full breakdown">
          <Eye className="h-3 w-3" /><span>View Breakdown</span>
        </button>
      </div>
      {runData.synthesizedResponse && (
        <div className="px-4 pt-2 pb-4 border-t border-border">
          <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{runData.synthesizedResponse}</ReactMarkdown></div>
          {(runData.synthesisFollowUps?.length ?? 0) > 0 && (
            <div className="mt-3 p-2.5 surface-well rounded">
              <div className="text-[10px] font-semibold text-primary mb-1.5 flex items-center gap-1"><Lightbulb className="h-3 w-3" /> Follow-up suggestions</div>
              <div className="space-y-1">{runData.synthesisFollowUps!.map((s, i) => (<div key={i} className="text-[10px] text-label-muted flex gap-1.5"><span className="text-primary">→</span> {s}</div>))}</div>
            </div>
          )}
          {(runData.synthesisCaveats?.length ?? 0) > 0 && (
            <div className="mt-2 space-y-0.5">{runData.synthesisCaveats!.map((c, i) => (<div key={i} className="text-[9px] text-label-muted flex items-center gap-1"><span className="text-status-warning">⚠</span> {c}</div>))}</div>
          )}
        </div>
      )}
      {runData.auditDecision && (
        <div className="mx-4 mb-4 p-2 surface-well rounded">
          <div className="flex items-center gap-2 text-[9px]">
            <ScanEye className="h-3 w-3 text-status-info" />
            <span className="font-mono font-medium text-status-info">Audit: {runData.auditDecision.verdict}</span>
            <span className="text-label-muted">• Conf: {((runData.auditDecision.confidence || 0) * 100).toFixed(0)}%</span>
            <span className="text-label-muted">• Tone: {runData.auditDecision.style_analysis?.tone || '?'}</span>
            {(runData.auditLoops || 0) > 1 && <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-border font-mono">{runData.auditLoops} loops</Badge>}
          </div>
        </div>
      )}
    </div>
  );
}
