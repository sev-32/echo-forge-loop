import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
import {
  CheckCircle2, XCircle, Clock, Shield, Loader2, RefreshCw,
  Lightbulb, Target, ChevronDown, ChevronRight
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { mdComponents } from './md-components';
import type { TaskPlan } from './types';

// ─── Task Status Badge ──────────────────────────────────
export function TaskStatusBadge({ status }: { status: TaskPlan['status'] }) {
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

export function DetailLevelBadge({ level }: { level: TaskPlan['detailLevel'] }) {
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

// ─── Task Card ───────────────────────────────
export function TaskCard({ task, isExpanded, onToggle }: { task: TaskPlan; isExpanded: boolean; onToggle: () => void }) {
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
          {task.reasoning && (
            <div className="mt-2 p-2 rounded-md bg-primary/5 border border-primary/15 text-[9px]">
              <div className="flex items-center gap-1 font-semibold text-primary mb-0.5"><Lightbulb className="h-3 w-3" /> Task Rationale</div>
              <p className="text-muted-foreground leading-relaxed">{task.reasoning}</p>
            </div>
          )}
          {task.acceptanceCriteria?.length ? (
            <div className="mt-2 p-2 rounded-md bg-secondary/50 border border-border/50 text-[9px]">
              <div className="flex items-center gap-1 font-semibold text-muted-foreground mb-1"><Target className="h-3 w-3" /> Acceptance Criteria</div>
              {task.acceptanceCriteria.map((c, j) => {
                const result = task.verification?.criteria_results?.find(cr => cr.criterion === c);
                return (
                  <div key={j} className="flex items-start gap-1.5 mt-0.5">
                    {result ? (result.met ? <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--status-success))] mt-0.5 flex-shrink-0" /> : <XCircle className="h-2.5 w-2.5 text-destructive mt-0.5 flex-shrink-0" />) : <div className="w-2.5 h-2.5 rounded-full border border-muted-foreground/30 mt-0.5 flex-shrink-0" />}
                    <span className="text-muted-foreground">{c}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {task.retryDiagnosis && (
            <div className="mt-2 p-2 rounded-md bg-[hsl(var(--status-warning))]/5 border border-[hsl(var(--status-warning))]/20 text-[10px]">
              <div className="flex items-center gap-1 font-semibold text-[hsl(var(--status-warning))] mb-1"><RefreshCw className="h-3 w-3" /> Retry Diagnosis</div>
              <p className="text-muted-foreground leading-relaxed">{task.retryDiagnosis}</p>
            </div>
          )}
          {task.output && (
            <div className="mt-2.5 max-h-[500px] overflow-y-auto pr-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{task.output}</ReactMarkdown>
            </div>
          )}
          {task.verification && (
            <div className={`mt-3 p-2.5 rounded-md text-[10px] border ${task.verification.passed ? 'bg-[hsl(var(--status-success))]/5 border-[hsl(var(--status-success))]/20' : 'bg-destructive/5 border-destructive/20'}`}>
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                {task.verification.passed ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--status-success))]" /> : <XCircle className="h-3 w-3 text-destructive" />}
                <span>{task.verification.passed ? 'Passed' : 'Failed'}: {task.verification.summary}</span>
              </div>
              {task.verification.criteria_results?.map((cr, j) => (
                <div key={j} className="flex items-start gap-1.5 mt-1 ml-4">
                  {cr.met ? <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--status-success))] mt-0.5 flex-shrink-0" /> : <XCircle className="h-2.5 w-2.5 text-destructive mt-0.5 flex-shrink-0" />}
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
