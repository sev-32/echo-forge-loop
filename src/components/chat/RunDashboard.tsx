import { useState, useRef, useEffect } from 'react';
import {
  Brain, CheckCircle2, ChevronDown, ChevronRight, Zap, Shield, Sparkles, Target,
  Loader2, Database, Network as NetworkIcon, RefreshCw, Lightbulb, TrendingUp,
  Scale, Eye, MessageCircleQuestion, Gauge, ScanEye, HelpCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RunData, ThoughtEntry, MemoryDetail, ProcessRule, ReflectionData } from './types';
import { TaskCard } from './TaskExplorer';
import { DeepReflectionPanel } from './ReflectionViewer';

// ─── Phase Config ───────────────────────────────────────
export const phaseConfig: Record<string, { icon: any; label: string; color: string }> = {
  memory: { icon: Database, label: 'Memory', color: 'text-[hsl(var(--status-info))]' },
  planning: { icon: Target, label: 'Planning', color: 'text-primary' },
  execute: { icon: Zap, label: 'Execute', color: 'text-accent' },
  verify: { icon: Shield, label: 'Verify', color: 'text-[hsl(var(--status-warning))]' },
  retry: { icon: RefreshCw, label: 'Retry', color: 'text-[hsl(var(--status-blocked))]' },
  audit: { icon: ScanEye, label: 'Audit', color: 'text-[hsl(var(--status-info))]' },
  synthesize: { icon: undefined, label: 'Synthesize', color: 'text-primary' },
  reflect: { icon: Sparkles, label: 'Reflect', color: 'text-[hsl(var(--status-pending))]' },
  evolve: { icon: TrendingUp, label: 'Evolve', color: 'text-primary' },
  complete: { icon: CheckCircle2, label: 'Complete', color: 'text-[hsl(var(--status-success))]' },
};
// Lazy-set the icon that causes circular issues
import { Layers } from 'lucide-react';
phaseConfig.synthesize.icon = Layers;

// ─── Phase Pipeline ─────────
export function PhasePipeline({ activePhase, status }: { activePhase: string; status: RunData['status'] }) {
  const phases = ['memory', 'planning', 'execute', 'verify', 'audit', 'synthesize', 'reflect', 'evolve', 'complete'];
  const activeIdx = phases.indexOf(activePhase);
  return (
    <div className="flex items-center gap-1 px-3 py-2 surface-well border-b border-border overflow-x-auto">
      {phases.map((phase, i) => {
        const cfg = phaseConfig[phase];
        const Icon = cfg.icon;
        const isActive = phase === activePhase;
        const isPast = i < activeIdx || status === 'complete';
        return (
          <div key={phase} className="flex items-center gap-1">
            {i > 0 && <div className={`w-4 h-px ${isPast ? 'bg-status-success' : isActive ? 'bg-primary' : 'bg-border'}`} />}
            <div className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-medium transition-all duration-300 ${
              isActive ? `surface-raised amber-glow ${cfg.color}` : isPast ? 'text-status-success bg-status-success/5' : 'text-label-engraved'
            }`}>
              <Icon className={`h-3 w-3 ${isActive ? 'animate-pulse' : ''}`} />
              <span className="tracking-wide">{cfg.label.toUpperCase()}</span>
              {isPast && !isActive && <CheckCircle2 className="h-2.5 w-2.5" />}
            </div>
          </div>
        );
      })}
      {status === 'complete' && (
        <Badge className="ml-auto text-[8px] h-4 bg-status-success/10 text-status-success border-status-success/20 font-mono">✓ COMPLETE</Badge>
      )}
    </div>
  );
}

// ─── Thought Stream ───────────
export function ThoughtStream({ thoughts }: { thoughts: ThoughtEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [thoughts.length]);
  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span className="text-engraved">AI CONSCIOUSNESS</span>
        </div>
        <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono border-border text-label-muted">{thoughts.length}</Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 bg-terminal-bg">
        {thoughts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <Brain className="h-5 w-5 mb-1 text-label-engraved" />
            <span className="text-engraved">AWAITING THOUGHTS</span>
          </div>
        ) : thoughts.map((t) => {
          const cfg = phaseConfig[t.phase] || phaseConfig.execute;
          const Icon = cfg.icon;
          return (
            <div key={t.id} className="flex gap-1.5 text-[9px] leading-relaxed animate-in fade-in slide-in-from-left-1 duration-200 font-mono">
              <div className="flex-shrink-0 mt-0.5"><Icon className={`h-3 w-3 ${cfg.color}`} /></div>
              <div className="flex-1 min-w-0">
                <span className={`font-semibold ${cfg.color}`}>[{cfg.label.toUpperCase()}]</span>
                <span className="text-terminal-fg ml-1">{t.content}</span>
              </div>
              <span className="text-label-engraved text-[8px] flex-shrink-0">
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
export function ContextSidebar({ runData }: { runData: RunData }) {
  const [expandedSection, setExpandedSection] = useState<string | null>('metrics');
  const toggle = (s: string) => setExpandedSection(prev => prev === s ? null : s);
  const doneCount = runData.tasks.filter(t => t.status === 'done').length;
  const failedCount = runData.tasks.filter(t => t.status === 'failed').length;
  const scores = runData.tasks.filter(t => t.verification).map(t => t.verification!.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/30">
      <SidebarSection icon={Gauge} title="Live Metrics" expanded={expandedSection === 'metrics'} onToggle={() => toggle('metrics')}>
        <div className="grid grid-cols-2 gap-1.5 p-2">
          <MetricCard label="Tasks" value={`${doneCount}/${runData.tasks.length}`} color={doneCount === runData.tasks.length ? 'success' : 'info'} />
          <MetricCard label="Failed" value={`${failedCount}`} color={failedCount > 0 ? 'error' : 'success'} />
          <MetricCard label="Avg Score" value={scores.length > 0 ? `${avgScore}` : '—'} color={avgScore >= 80 ? 'success' : avgScore >= 60 ? 'warning' : 'error'} />
          <MetricCard label="Tokens" value={runData.totalTokens > 0 ? `${(runData.totalTokens / 1000).toFixed(1)}k` : '—'} color="info" />
        </div>
      </SidebarSection>

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

export function ScoreRing({ score, size = 32, label }: { score: number; size?: number; label?: string }) {
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

// ─── Complexity Badge ──────────────
export function ComplexityBadge({ complexity }: { complexity: RunData['overallComplexity'] }) {
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
        {Array.from({ length: 4 }, (_, i) => (<span key={i} className={`w-1 rounded-full ${i < c.bars ? 'bg-current' : 'bg-muted'}`} style={{ height: `${6 + i * 2}px` }} />))}
      </span>
      {c.label}
    </span>
  );
}

// ─── Mission Control (Active Run) ──────────
export function MissionControl({ runData }: { runData: RunData }) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  useEffect(() => {
    const running = runData.tasks.findIndex(t => t.status === 'running' || t.status === 'verifying' || t.status === 'retrying');
    if (running >= 0) setExpandedTasks(prev => new Set([...prev, running]));
  }, [runData.tasks]);
  const toggleTask = (i: number) => { setExpandedTasks(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; }); };

  return (
    <div className="flex flex-col h-full">
      <PhasePipeline activePhase={runData.activePhase} status={runData.status} />
      <div className="px-3 py-2 border-b border-border surface-well flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-[11px] font-mono font-medium text-label-primary truncate flex-1">{runData.goal}</span>
        <ComplexityBadge complexity={runData.overallComplexity} />
        {runData.totalTokens > 0 && <span className="text-[9px] text-label-muted font-mono">{runData.totalTokens.toLocaleString()} tok</span>}
        <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono border-border text-label-muted">{runData.runId.slice(0, 12)}</Badge>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-border overflow-hidden"><ThoughtStream thoughts={runData.thoughts} /></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {runData.approach && <div className="text-[10px] text-label-muted italic px-1 mb-1"><span className="text-label-primary font-medium">Approach:</span> {runData.approach}</div>}
          {runData.tasks.length === 0 && runData.status === 'planning' && (
            <div className="flex items-center gap-2 text-sm p-8 justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-engraved">PLANNING TASKS</span></div>
          )}
          {runData.tasks.map((task, i) => (<TaskCard key={task.id || i} task={task} isExpanded={expandedTasks.has(i)} onToggle={() => toggleTask(i)} />))}
          {runData.reflection && <DeepReflectionPanel reflection={runData.reflection} knowledgeUpdate={runData.knowledgeUpdate} generatedRules={runData.generatedRules} />}
        </div>
        <div className="w-56 flex-shrink-0 overflow-y-auto"><ContextSidebar runData={runData} /></div>
      </div>
    </div>
  );
}

// ─── Mission Control Archive ───────
export function MissionControlArchive({ runData, expandedTasks, toggleTask }: { runData: RunData; expandedTasks: Set<number>; toggleTask: (i: number) => void }) {
  return (
    <div className="flex flex-col h-full">
      <PhasePipeline activePhase="complete" status="complete" />
      <div className="px-3 py-2 border-b border-border surface-well flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-[11px] font-mono font-medium text-label-primary truncate flex-1">{runData.goal}</span>
        <ComplexityBadge complexity={runData.overallComplexity} />
        {runData.totalTokens > 0 && <span className="text-[9px] text-label-muted font-mono">{runData.totalTokens.toLocaleString()} tok</span>}
        <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono border-border text-label-muted">{runData.runId.slice(0, 12)}</Badge>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-border overflow-hidden"><ThoughtStream thoughts={runData.thoughts} /></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {runData.approach && <div className="text-[10px] text-label-muted italic px-1 mb-1"><span className="text-label-primary font-medium">Approach:</span> {runData.approach}</div>}
          {runData.tasks.map((task, i) => (<TaskCard key={task.id || i} task={task} isExpanded={expandedTasks.has(i)} onToggle={() => toggleTask(i)} />))}
          {runData.reflection && <DeepReflectionPanel reflection={runData.reflection} knowledgeUpdate={runData.knowledgeUpdate} generatedRules={runData.generatedRules} />}
        </div>
        <div className="w-56 flex-shrink-0 overflow-y-auto"><ContextSidebar runData={runData} /></div>
      </div>
    </div>
  );
}
