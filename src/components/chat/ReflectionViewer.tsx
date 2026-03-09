import {
  Sparkles, CheckCircle2, XCircle, Activity, TrendingUp,
  BookOpen, Scale, FlaskConical, Database, GitBranch,
  Network as NetworkIcon, ScanEye
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScoreRing } from './RunDashboard';
import type { ReflectionData, RunData, ProcessRule } from './types';

export function DeepReflectionPanel({ reflection, knowledgeUpdate, generatedRules }: {
  reflection: ReflectionData;
  knowledgeUpdate: RunData['knowledgeUpdate'];
  generatedRules?: ProcessRule[];
}) {
  const pe = reflection.process_evaluation;
  const sa = reflection.strategy_assessment;
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3.5 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent"><Sparkles className="h-3.5 w-3.5" /> Deep Self-Reflection</div>
      {reflection.internal_monologue && (
        <div className="p-2.5 rounded-md bg-[hsl(var(--terminal-bg))] border border-border/50 text-[9px] font-mono text-[hsl(var(--terminal-fg))] leading-relaxed max-h-48 overflow-y-auto">
          <div className="flex items-center gap-1 text-[8px] text-muted-foreground mb-1.5 uppercase tracking-wider"><ScanEye className="h-3 w-3" /> Internal Monologue</div>
          {reflection.internal_monologue}
        </div>
      )}
      <p className="text-xs text-secondary-foreground leading-relaxed">{reflection.summary}</p>
      {(pe || sa) && (
        <div className="flex items-center gap-4 p-2.5 rounded-md bg-card border border-border">
          {pe && <ScoreRing score={pe.planning_score} label="Planning" />}
          {sa && <ScoreRing score={sa.effectiveness_score} label="Strategy" />}
          <div className="flex-1 space-y-1 text-[9px]">
            {pe && (
              <div className="flex flex-wrap gap-1.5">
                <span className={`px-1.5 py-0.5 rounded ${pe.complexity_calibration_accurate ? 'bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))]' : 'bg-destructive/10 text-destructive'}`}>{pe.complexity_calibration_accurate ? '✓' : '✗'} Complexity Cal.</span>
                <span className={`px-1.5 py-0.5 rounded ${pe.tasks_well_scoped ? 'bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))]' : 'bg-destructive/10 text-destructive'}`}>{pe.tasks_well_scoped ? '✓' : '✗'} Task Scoping</span>
                <span className={`px-1.5 py-0.5 rounded ${pe.detail_levels_appropriate ? 'bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))]' : 'bg-destructive/10 text-destructive'}`}>{pe.detail_levels_appropriate ? '✓' : '✗'} Detail Levels</span>
              </div>
            )}
            {pe?.planning_notes && <p className="text-muted-foreground italic">{pe.planning_notes}</p>}
          </div>
        </div>
      )}
      {sa && (
        <div className="space-y-1.5">
          {sa.what_worked?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[hsl(var(--status-success))] flex items-center gap-1"><TrendingUp className="h-3 w-3" /> What Worked</div>
              <ul className="space-y-0.5 mt-0.5">{sa.what_worked.map((w, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-[hsl(var(--status-success))]">+</span> {w}</li>)}</ul>
            </div>
          )}
          {sa.what_failed?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> What Failed</div>
              <ul className="space-y-0.5 mt-0.5">{sa.what_failed.map((f, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-destructive">−</span> {f}</li>)}</ul>
            </div>
          )}
          {sa.would_change && <p className="text-[10px] text-muted-foreground italic">💡 Would change: {sa.would_change}</p>}
        </div>
      )}
      {reflection.detected_patterns?.length ? (
        <div>
          <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1"><Activity className="h-3 w-3" /> Detected Patterns</div>
          <ul className="space-y-0.5">{reflection.detected_patterns.map((p, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-accent">◆</span> {p}</li>)}</ul>
        </div>
      ) : null}
      {reflection.lessons?.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Lessons</div>
          <ul className="space-y-0.5">{reflection.lessons.map((l, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-accent">•</span> {l}</li>)}</ul>
        </div>
      )}
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
      {reflection.self_test_proposals?.length ? (
        <div>
          <div className="text-[10px] font-semibold text-foreground mb-0.5 flex items-center gap-1"><FlaskConical className="h-3 w-3" /> Self-Test Proposals</div>
          <ul className="space-y-0.5">{reflection.self_test_proposals.map((t, i) => <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5"><span className="text-primary">🧪</span> {t}</li>)}</ul>
        </div>
      ) : null}
      {knowledgeUpdate && (knowledgeUpdate.nodes_added > 0 || knowledgeUpdate.edges_added > 0) && (
        <div className="flex items-center gap-3 pt-1 border-t border-accent/20 text-[9px] text-accent">
          <span className="flex items-center gap-1"><Database className="h-3 w-3" /> +{knowledgeUpdate.nodes_added} nodes</span>
          <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> +{knowledgeUpdate.edges_added} edges</span>
        </div>
      )}
      {reflection.knowledge_nodes?.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {reflection.knowledge_nodes.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-[9px] text-muted-foreground border border-border"><NetworkIcon className="h-2.5 w-2.5 text-accent" /> {n.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
