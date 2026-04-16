import { useEffect, useMemo, useState } from 'react';
import { useIONKernel, IONState, IONWorkUnit, IONArtifact, IONOpenQuestion, IONDelta } from '@/hooks/use-ion-kernel';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileText,
  ListTodo,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  StepForward,
} from 'lucide-react';

type IONTab = 'overview' | 'tasks' | 'outputs' | 'questions' | 'reviews';
type PillTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const GOAL_PRESETS = [
  'Map this codebase and explain the current backend architecture in plain English.',
  'Review the current ION run, identify blockers, and tell me what needs human input.',
  'Analyze the ION backend and produce a clean system summary with open questions.',
];

const RUN_STATUS_COPY: Record<string, string> = {
  created: 'Just started',
  reconnaissance: 'Planning the work',
  evidence_pass: 'Gathering evidence',
  consolidation: 'Assembling results',
  review: 'Checking results',
  reconciliation: 'Resolving conflicts',
  densification: 'Filling gaps',
  expansion: 'Exploring follow-ups',
  blocked: 'Waiting for input',
  completed: 'Finished',
  failed: 'Failed',
  stopped: 'Stopped',
};

const TASK_STATUS_COPY: Record<string, string> = {
  pending: 'Queued',
  assigned: 'Assigned',
  dispatched: 'Dispatched',
  running: 'Running',
  validating: 'Validating',
  completed: 'Done',
  failed: 'Failed',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

const REVIEW_STATUS_COPY: Record<string, string> = {
  proposed: 'Needs review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  witness_only: 'Saved as note',
};

const PROTOCOL_COPY: Record<string, string> = {
  reconnaissance: 'Research / mapping',
  evidence: 'Evidence gathering',
  consolidation: 'Drafting result',
  review: 'Self-check',
  signal: 'Coordination',
  reflection: 'Reflection',
  system_map: 'System mapping',
  system_evolution: 'System evolution',
};

const AUTHORITY_COPY: Record<string, string> = {
  authority: 'Source of truth',
  witness: 'Observation',
  plan: 'Plan',
  audit: 'Audit trail',
  generated_state: 'Working state',
  stale_competitor: 'Outdated',
};

const PILL_STYLES: Record<PillTone, React.CSSProperties> = {
  neutral: {
    background: 'hsl(var(--surface-2))',
    color: 'hsl(var(--label-secondary))',
    borderColor: 'hsl(var(--border))',
  },
  primary: {
    background: 'hsl(var(--primary) / 0.14)',
    color: 'hsl(var(--primary))',
    borderColor: 'hsl(var(--primary) / 0.28)',
  },
  success: {
    background: 'hsl(var(--status-success) / 0.14)',
    color: 'hsl(var(--status-success))',
    borderColor: 'hsl(var(--status-success) / 0.28)',
  },
  warning: {
    background: 'hsl(var(--status-warning) / 0.14)',
    color: 'hsl(var(--status-warning))',
    borderColor: 'hsl(var(--status-warning) / 0.28)',
  },
  danger: {
    background: 'hsl(var(--destructive) / 0.14)',
    color: 'hsl(var(--destructive))',
    borderColor: 'hsl(var(--destructive) / 0.28)',
  },
};

function getRunTone(status: string): PillTone {
  if (status === 'completed') return 'success';
  if (status === 'blocked') return 'warning';
  if (status === 'failed' || status === 'stopped') return 'danger';
  return 'primary';
}

function getTaskTone(status: string): PillTone {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'blocked') return status === 'blocked' ? 'warning' : 'danger';
  if (status === 'running' || status === 'validating') return 'primary';
  return 'neutral';
}

function getReviewTone(status: string): PillTone {
  if (status === 'accepted') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'witness_only') return 'neutral';
  return 'warning';
}

function getAuthorityTone(authorityClass: string): PillTone {
  if (authorityClass === 'authority' || authorityClass === 'plan') return 'primary';
  if (authorityClass === 'witness') return 'warning';
  if (authorityClass === 'stale_competitor') return 'danger';
  return 'neutral';
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function safeCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function summarizeActivity(entry: any) {
  if (entry?.message) return entry.message;
  if (entry?.protocol) return `Ran ${PROTOCOL_COPY[entry.protocol] || entry.protocol}`;
  if (entry?.deltas_reviewed) return `Reviewed ${entry.deltas_reviewed} proposal(s)`;
  return 'Processed one step';
}

function getNextAction(state: IONState | null): { title: string; description: string; tab: IONTab; cta: string } {
  if (!state?.run) {
    return {
      title: 'Start a session',
      description: 'Describe the job you want ION to do, then start the run.',
      tab: 'overview',
      cta: 'Start',
    };
  }

  const openQuestions = state.questions.filter((question) => question.status === 'open').length;
  const pendingReviews = state.deltas.filter((delta) => delta.status === 'proposed').length;
  const pendingTasks = state.work_units.filter((task) => ['pending', 'assigned', 'dispatched', 'running', 'validating'].includes(task.status)).length;

  if (openQuestions > 0) {
    return {
      title: 'Answer questions',
      description: `ION is waiting on ${openQuestions} answer${openQuestions === 1 ? '' : 's'} from you before it can continue cleanly.`,
      tab: 'questions',
      cta: 'Open questions',
    };
  }

  if (pendingReviews > 0) {
    return {
      title: 'Review proposals',
      description: `ION has ${pendingReviews} proposal${pendingReviews === 1 ? '' : 's'} waiting for approval or rejection.`,
      tab: 'reviews',
      cta: 'Open reviews',
    };
  }

  if (state.run.status === 'completed') {
    return {
      title: 'Review outputs',
      description: 'This run is finished. Open Outputs to inspect what ION produced.',
      tab: 'outputs',
      cta: 'Open outputs',
    };
  }

  if (state.run.status === 'failed' || state.run.status === 'blocked') {
    return {
      title: 'Inspect blockers',
      description: 'Open Tasks and Questions to see what stalled the run and what needs attention.',
      tab: 'tasks',
      cta: 'Open tasks',
    };
  }

  if (pendingTasks > 0) {
    return {
      title: 'Let it continue',
      description: 'Click Run automatically to let ION process more steps, or Step once if you want to watch it progress manually.',
      tab: 'overview',
      cta: 'Stay on overview',
    };
  }

  return {
    title: 'Inspect the run',
    description: 'Use the tabs below to review tasks, outputs, questions, and approvals.',
    tab: 'overview',
    cta: 'Stay on overview',
  };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: 'hsl(var(--border))',
        background: 'hsl(var(--surface-2))',
      }}
    >
      <div className="text-lg font-semibold" style={{ color: 'hsl(var(--label-primary))' }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
        {label}
      </div>
    </div>
  );
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: PillTone }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={PILL_STYLES[tone]}
    >
      {children}
    </span>
  );
}

function EmptyNotice({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-lg border p-4 text-center"
      style={{
        borderColor: 'hsl(var(--border))',
        background: 'hsl(var(--surface-2))',
      }}
    >
      <p className="text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
        {title}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
        {body}
      </p>
    </div>
  );
}

export function IONPanel() {
  const kernel = useIONKernel();
  const [goalInput, setGoalInput] = useState('');
  const [subTab, setSubTab] = useState<IONTab>('overview');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    kernel.refreshRuns();
  }, [kernel.refreshRuns]);

  const activeRun = kernel.state?.run;

  const counts = useMemo(() => {
    const state = kernel.state;
    if (!state) {
      return { tasks: 0, completedTasks: 0, outputs: 0, openQuestions: 0, reviewQueue: 0 };
    }

    return {
      tasks: state.work_units.length,
      completedTasks: state.work_units.filter((unit) => unit.status === 'completed').length,
      outputs: state.artifacts.length,
      openQuestions: state.questions.filter((question) => question.status === 'open').length,
      reviewQueue: state.deltas.filter((delta) => delta.status === 'proposed').length,
    };
  }, [kernel.state]);

  const nextAction = useMemo(() => getNextAction(kernel.state), [kernel.state]);

  const handleStartRun = async () => {
    const goal = goalInput.trim();
    if (!goal) return;
    await kernel.startRun(goal);
    setGoalInput('');
    setSubTab('overview');
  };

  const handleAnswerQuestion = async (questionId: string) => {
    const answer = questionDrafts[questionId]?.trim();
    if (!answer) return;
    await kernel.answerQuestion(questionId, answer);
    setQuestionDrafts((current) => ({ ...current, [questionId]: '' }));
  };

  const recentRuns = kernel.runs.slice(0, 6);

  return (
    <div className="h-full flex flex-col" style={{ background: 'hsl(var(--surface-1))' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ background: 'hsl(var(--primary) / 0.14)' }}
              >
                <Sparkles className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold" style={{ color: 'hsl(var(--label-primary))' }}>
                    ION
                  </h1>
                  {activeRun && <Pill tone={getRunTone(activeRun.status)}>{RUN_STATUS_COPY[activeRun.status] || activeRun.status}</Pill>}
                </div>
                <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                  The new multi-step AI backend. Give it a job, then track tasks, outputs, questions, and approvals.
                </p>
              </div>
            </div>
          </div>

          {activeRun && (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Pill tone="neutral">{counts.completedTasks}/{counts.tasks} tasks done</Pill>
              <Pill tone="neutral">{counts.outputs} outputs</Pill>
              <Pill tone={counts.openQuestions > 0 ? 'warning' : 'neutral'}>{counts.openQuestions} questions</Pill>
              <Pill tone={counts.reviewQueue > 0 ? 'warning' : 'neutral'}>{counts.reviewQueue} reviews</Pill>
            </div>
          )}
        </div>
      </div>

      {kernel.error && (
        <div className="mx-4 mt-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'hsl(var(--destructive) / 0.28)', background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{kernel.error}</span>
          </div>
        </div>
      )}

      {!kernel.activeRunId && (
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
            >
              <div className="flex items-start gap-3">
                <Bot className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                <div className="space-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                      How to use ION
                    </p>
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                      ION is for big, multi-step jobs — not normal chat.
                    </p>
                  </div>
                  <p className="text-xs leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                    Give it one clear job. ION will break the job into smaller tasks, create outputs, ask questions if it gets blocked,
                    and ask for approval when it wants to save important results.
                  </p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {[
                      { title: '1. Start with a goal', body: 'Tell ION what outcome you want.' },
                      { title: '2. Let it work', body: 'Use Run automatically or Step once.' },
                      { title: '3. Check the right tab', body: 'Tasks = work, Outputs = results, Questions = waiting on you.' },
                    ].map((item) => (
                      <div
                        key={item.title}
                        className="rounded-lg border p-3"
                        style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-1))' }}
                      >
                        <p className="text-xs font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                          {item.title}
                        </p>
                        <p className="mt-1 text-[11px] leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                          {item.body}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {GOAL_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setGoalInput(preset)}
                        className="rounded-full border px-3 py-1.5 text-left text-[11px] transition-colors hover:border-primary/40 hover:bg-accent/40"
                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--label-primary))' }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border p-4"
              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                      Start a new ION session
                    </p>
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                      What do you want ION to do?
                    </p>
                  </div>
                  <textarea
                    value={goalInput}
                    onChange={(event) => setGoalInput(event.target.value)}
                    placeholder="Example: Analyze the backend, identify blockers, and write a clear summary I can review."
                    rows={4}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                    style={{
                      borderColor: 'hsl(var(--border))',
                      background: 'hsl(var(--surface-1))',
                      color: 'hsl(var(--label-primary))',
                    }}
                  />
                  <p className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                    Tip: ask for one outcome, not five. ION works best when the goal is specific.
                  </p>
                </div>
                <div className="flex gap-2 lg:flex-col">
                  <Button onClick={handleStartRun} disabled={kernel.loading || !goalInput.trim()} className="gap-2">
                    {kernel.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Start ION
                  </Button>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border p-4"
              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                    Previous sessions
                  </p>
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                    Re-open an earlier run
                  </p>
                </div>
              </div>

              {recentRuns.length === 0 ? (
                <EmptyNotice title="No previous ION sessions yet" body="Start your first run above and it will show up here." />
              ) : (
                <div className="space-y-2">
                  {recentRuns.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => kernel.selectRun(run.id)}
                      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/30"
                      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-1))' }}
                    >
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Pill tone={getRunTone(run.status)}>{RUN_STATUS_COPY[run.status] || run.status}</Pill>
                            <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                              {formatTimestamp(run.updated_at)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                            {run.goal}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'hsl(var(--label-secondary))' }}>
                          <span>{run.completed_work_units}/{run.total_work_units} tasks</span>
                          <span>•</span>
                          <span>{run.total_tokens.toLocaleString()} tokens</span>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      )}

      {kernel.activeRunId && kernel.state && activeRun && (
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
            >
              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                      Current job
                    </p>
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                      {activeRun.goal}
                    </p>
                    <p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                      Status: {RUN_STATUS_COPY[activeRun.status] || activeRun.status}. Use <strong>Tasks</strong> to see what ION is doing,
                      <strong> Outputs</strong> to see results, <strong>Questions</strong> if it needs you, and <strong>Review</strong> for approvals.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => kernel.step()} disabled={kernel.loading} className="gap-2">
                      <StepForward className="h-4 w-4" />
                      Step once
                    </Button>
                    <Button size="sm" onClick={() => kernel.runToCompletion()} disabled={kernel.loading} className="gap-2">
                      {kernel.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Run automatically
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => kernel.stopRun()} disabled={kernel.loading} className="gap-2">
                      <Square className="h-4 w-4" />
                      Stop
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => kernel.clearSelection()} disabled={kernel.loading} className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Back to setup
                    </Button>
                  </div>
                </div>

                <div
                  className="rounded-lg border p-3"
                  style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-1))' }}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                    <p className="text-xs font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                      What you should do next
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                    {nextAction.title}
                  </p>
                  <p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                    {nextAction.description}
                  </p>
                  <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={() => setSubTab(nextAction.tab)}>
                    {nextAction.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Tabs value={subTab} onValueChange={(value) => setSubTab(value as IONTab)} className="flex-1 min-h-0 flex flex-col">
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg p-1" style={{ background: 'hsl(var(--surface-2))' }}>
                <TabsTrigger value="overview" className="h-8 whitespace-nowrap px-3 text-[11px]">Overview</TabsTrigger>
                <TabsTrigger value="tasks" className="h-8 whitespace-nowrap px-3 text-[11px]">Tasks ({counts.tasks})</TabsTrigger>
                <TabsTrigger value="outputs" className="h-8 whitespace-nowrap px-3 text-[11px]">Outputs ({counts.outputs})</TabsTrigger>
                <TabsTrigger value="questions" className="h-8 whitespace-nowrap px-3 text-[11px]">Questions ({counts.openQuestions})</TabsTrigger>
                <TabsTrigger value="reviews" className="h-8 whitespace-nowrap px-3 text-[11px]">Review ({counts.reviewQueue})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-3 flex-1 min-h-0">
                <ScrollArea className="h-full pr-1">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <StatCard label="Tasks done" value={`${counts.completedTasks}/${counts.tasks}`} />
                      <StatCard label="Outputs" value={counts.outputs} />
                      <StatCard label="Questions waiting" value={counts.openQuestions} />
                      <StatCard label="Reviews waiting" value={counts.reviewQueue} />
                    </div>

                    <div
                      className="rounded-xl border p-4"
                      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <ListTodo className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                            What the tabs mean
                          </p>
                          <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                            Quick reference so the page is readable.
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {[
                          { label: 'Tasks', body: 'The smaller jobs ION created to finish your goal.' },
                          { label: 'Outputs', body: 'The actual documents, notes, or results it produced.' },
                          { label: 'Questions', body: 'Things ION needs you to answer before it can continue well.' },
                          { label: 'Review', body: 'Proposals waiting for your approval or rejection.' },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-lg border p-3"
                            style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-1))' }}
                          >
                            <p className="text-xs font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                              {item.label}
                            </p>
                            <p className="mt-1 text-[11px] leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                              {item.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      className="rounded-xl border p-4"
                      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                            Recent activity
                          </p>
                          <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                            The latest steps ION has taken in this session.
                          </p>
                        </div>
                      </div>

                      {kernel.stepLog.length === 0 ? (
                        <EmptyNotice title="No activity yet" body="Run a step to see the activity feed populate." />
                      ) : (
                        <div className="space-y-2">
                          {kernel.stepLog.slice(-8).reverse().map((entry, index) => (
                            <div
                              key={`${entry.timestamp || 'entry'}-${index}`}
                              className="rounded-lg border p-3"
                              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-1))' }}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Pill tone={entry.status === 'idle' ? 'neutral' : 'primary'}>{entry.status || 'step'}</Pill>
                                <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                  {formatTimestamp(entry.timestamp)}
                                </span>
                              </div>
                              <p className="mt-2 text-sm" style={{ color: 'hsl(var(--label-primary))' }}>
                                {summarizeActivity(entry)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="tasks" className="mt-3 flex-1 min-h-0">
                <ScrollArea className="h-full pr-1">
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                      Tasks are the smaller pieces of work ION created to complete your goal.
                    </p>

                    {kernel.state.work_units.length === 0 ? (
                      <EmptyNotice title="No tasks yet" body="Start the run or step it forward to let ION create work." />
                    ) : (
                      kernel.state.work_units.map((unit) => {
                        const expanded = expandedTaskId === unit.id;
                        return (
                          <div
                            key={unit.id}
                            className="rounded-xl border p-4"
                            style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Pill tone={getTaskTone(unit.status)}>{TASK_STATUS_COPY[unit.status] || unit.status}</Pill>
                                  <Pill tone="neutral">{PROTOCOL_COPY[unit.protocol] || unit.protocol}</Pill>
                                  <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                    Priority {unit.priority}
                                  </span>
                                </div>
                                <p className="mt-3 text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                                  {unit.title}
                                </p>
                                <p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                                  {unit.description}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                  Created {formatTimestamp(unit.created_at)}
                                </span>
                                <Button size="sm" variant="outline" onClick={() => setExpandedTaskId(expanded ? null : unit.id)}>
                                  {expanded ? 'Hide details' : 'Show details'}
                                </Button>
                              </div>
                            </div>

                            {expanded && (
                              <div
                                className="mt-3 space-y-3 rounded-lg border p-3"
                                style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-1))' }}
                              >
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                                      Timing
                                    </p>
                                    <p className="mt-1 text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                                      Started: {formatTimestamp(unit.assigned_at)}
                                    </p>
                                    <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                                      Finished: {formatTimestamp(unit.completed_at)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                                      Error
                                    </p>
                                    <p className="mt-1 text-xs" style={{ color: unit.error ? 'hsl(var(--destructive))' : 'hsl(var(--label-secondary))' }}>
                                      {unit.error || 'No error recorded.'}
                                    </p>
                                  </div>
                                </div>

                                {unit.result_data && (
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                                      Raw result
                                    </p>
                                    <pre
                                      className="mt-2 max-h-72 overflow-auto rounded-lg border p-3 text-[11px]"
                                      style={{
                                        borderColor: 'hsl(var(--border))',
                                        background: 'hsl(var(--surface-2))',
                                        color: 'hsl(var(--label-primary))',
                                      }}
                                    >
                                      {JSON.stringify(unit.result_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="outputs" className="mt-3 flex-1 min-h-0">
                <ScrollArea className="h-full pr-1">
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                      Outputs are the concrete things ION has produced so far: summaries, plans, notes, and other result objects.
                    </p>

                    {kernel.state.artifacts.length === 0 ? (
                      <EmptyNotice title="No outputs yet" body="ION has not produced saved outputs in this run yet." />
                    ) : (
                      kernel.state.artifacts.map((artifact) => {
                        const expanded = expandedOutputId === artifact.id;
                        return (
                          <div
                            key={artifact.id}
                            className="rounded-xl border p-4"
                            style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Pill tone={getAuthorityTone(artifact.authority_class)}>{AUTHORITY_COPY[artifact.authority_class] || artifact.authority_class}</Pill>
                                  <Pill tone="neutral">{artifact.artifact_type || 'output'}</Pill>
                                  <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                    Version {artifact.version}
                                  </span>
                                </div>
                                <p className="mt-3 text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                                  {artifact.name}
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                                  {expanded ? artifact.content : `${artifact.content.slice(0, 280)}${artifact.content.length > 280 ? '…' : ''}`}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                  {formatTimestamp(artifact.created_at)}
                                </span>
                                {artifact.content.length > 280 && (
                                  <Button size="sm" variant="outline" onClick={() => setExpandedOutputId(expanded ? null : artifact.id)}>
                                    {expanded ? 'Collapse' : 'Read more'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="questions" className="mt-3 flex-1 min-h-0">
                <ScrollArea className="h-full pr-1">
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                      If a question appears here, ION needs input from you. Answer it here, then continue the run.
                    </p>

                    {kernel.state.questions.length === 0 ? (
                      <EmptyNotice title="No questions waiting" body="ION does not currently need anything from you." />
                    ) : (
                      kernel.state.questions.map((question) => (
                        <div
                          key={question.id}
                          className="rounded-xl border p-4"
                          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Pill tone={question.status === 'open' ? 'warning' : 'success'}>
                                  {question.status === 'open' ? 'Waiting on you' : 'Answered'}
                                </Pill>
                                <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                  Priority {question.priority}
                                </span>
                              </div>
                              <p className="mt-3 text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                                {question.question}
                              </p>
                              <p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                Asked {formatTimestamp(question.created_at)}
                              </p>
                            </div>
                          </div>

                          {question.status === 'open' ? (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={questionDrafts[question.id] || ''}
                                onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                                rows={3}
                                placeholder="Type your answer here..."
                                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                                style={{
                                  borderColor: 'hsl(var(--border))',
                                  background: 'hsl(var(--surface-1))',
                                  color: 'hsl(var(--label-primary))',
                                }}
                              />
                              <div className="flex justify-end">
                                <Button size="sm" onClick={() => handleAnswerQuestion(question.id)} disabled={kernel.loading || !(questionDrafts[question.id] || '').trim()}>
                                  Submit answer
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="mt-3 rounded-lg border p-3"
                              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-1))' }}
                            >
                              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--label-muted))' }}>
                                Answer
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: 'hsl(var(--label-primary))' }}>
                                {question.answer || 'No answer stored.'}
                              </p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="reviews" className="mt-3 flex-1 min-h-0">
                <ScrollArea className="h-full pr-1">
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: 'hsl(var(--label-secondary))' }}>
                      Review is the approval queue. If ION proposes something important, it shows up here for accept / reject / save as note.
                    </p>

                    {kernel.state.deltas.length === 0 ? (
                      <EmptyNotice title="No review items" body="ION has not proposed anything for approval yet." />
                    ) : (
                      kernel.state.deltas.map((delta) => {
                        const relatedTask = kernel.state?.work_units.find((unit) => unit.id === delta.work_unit_id);
                        const artifactCount = safeCount(delta.artifacts_created);
                        const questionCount = safeCount(delta.questions_raised);
                        const signalCount = safeCount(delta.signals_emitted);
                        const contradictionCount = safeCount(delta.contradictions_found);

                        return (
                          <div
                            key={delta.id}
                            className="rounded-xl border p-4"
                            style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-2))' }}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Pill tone={getReviewTone(delta.status)}>{REVIEW_STATUS_COPY[delta.status] || delta.status}</Pill>
                                  <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                    Confidence {formatPercent(delta.confidence)}
                                  </span>
                                </div>
                                <p className="mt-3 text-sm font-medium" style={{ color: 'hsl(var(--label-primary))' }}>
                                  {relatedTask ? relatedTask.title : 'Proposed result'}
                                </p>
                                <p className="mt-1 text-xs leading-5" style={{ color: 'hsl(var(--label-secondary))' }}>
                                  ION wants to save {artifactCount} output{artifactCount === 1 ? '' : 's'}, raise {questionCount} question{questionCount === 1 ? '' : 's'},
                                  emit {signalCount} signal{signalCount === 1 ? '' : 's'}, and recorded {contradictionCount} contradiction{contradictionCount === 1 ? '' : 's'}.
                                </p>
                              </div>
                              <span className="text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                {formatTimestamp(delta.created_at)}
                              </span>
                            </div>

                            {delta.status === 'proposed' && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => kernel.reviewDelta(delta.id, 'accept')} disabled={kernel.loading}>
                                  Accept
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => kernel.reviewDelta(delta.id, 'reject')} disabled={kernel.loading}>
                                  Reject
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => kernel.reviewDelta(delta.id, 'witness_only')} disabled={kernel.loading}>
                                  Save as note
                                </Button>
                              </div>
                            )}

                            {delta.status === 'proposed' && (
                              <p className="mt-2 text-[11px]" style={{ color: 'hsl(var(--label-muted))' }}>
                                “Save as note” keeps the result as a record without promoting it as a final accepted output.
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
