// ============================================
// Orchestration Panel — APOE Typed Plans + Roles + Gates
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { apoe, type ExecutionPlan, type PlanStep, ROLE_DESCRIPTIONS, type APOERole, type GateResult } from '@/lib/apoe';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Workflow, RefreshCw, ChevronRight, ShieldCheck, AlertTriangle,
  CheckCircle, XCircle, MinusCircle, Clock, Zap
} from 'lucide-react';

const ROLE_COLORS: Record<APOERole, string> = {
  planner: 'bg-violet-500/20 text-violet-400',
  retriever: 'bg-blue-500/20 text-blue-400',
  reasoner: 'bg-cyan-500/20 text-cyan-400',
  verifier: 'bg-green-500/20 text-green-400',
  builder: 'bg-amber-500/20 text-amber-400',
  critic: 'bg-red-500/20 text-red-400',
  operator: 'bg-slate-500/20 text-slate-400',
  witness: 'bg-emerald-500/20 text-emerald-400',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-muted-foreground',
  active: 'text-cyan-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
  skipped: 'text-slate-400',
  blocked: 'text-amber-400',
  draft: 'text-muted-foreground',
};

const GATE_ICONS: Record<string, typeof CheckCircle> = {
  pass: CheckCircle,
  fail: XCircle,
  warn: AlertTriangle,
  abstain: MinusCircle,
};

export function OrchestrationPanel() {
  const [plans, setPlans] = useState<ExecutionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ExecutionPlan | null>(null);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([apoe.getRecentPlans(30), apoe.getStats()]);
    setPlans(p);
    setStats(s);
    if (p.length > 0 && !selectedPlan) {
      setSelectedPlan(p[0]);
      const stepsData = await apoe.getStepsByPlan(p[0].id);
      setSteps(stepsData);
    }
    setLoading(false);
  }, [selectedPlan]);

  useEffect(() => { refresh(); }, [refresh]);

  const selectPlan = async (plan: ExecutionPlan) => {
    setSelectedPlan(plan);
    const stepsData = await apoe.getStepsByPlan(plan.id);
    setSteps(stepsData);
  };

  return (
    <div className="h-full flex gap-3 p-3">
      {/* Left: Plan list */}
      <div className="w-64 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold gradient-text">APOE — Plans</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={refresh}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-1 text-[9px]">
            <div className="bg-card rounded border border-border/50 p-1 text-center">
              <div className="font-bold text-[11px]">{stats.totalPlans}</div>
              <div className="text-muted-foreground">Plans</div>
            </div>
            <div className="bg-card rounded border border-border/50 p-1 text-center">
              <div className="font-bold text-[11px]">{stats.totalSteps}</div>
              <div className="text-muted-foreground">Steps</div>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {plans.map(plan => (
              <button
                key={plan.id}
                className={`w-full text-left p-2 rounded border transition-colors ${
                  selectedPlan?.id === plan.id ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-border bg-card/50'
                }`}
                onClick={() => selectPlan(plan)}
              >
                <div className="text-[10px] font-medium truncate">{plan.goal || 'Untitled plan'}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="outline" className={`text-[8px] px-1 py-0 h-3 ${STATUS_COLORS[plan.status]}`}>
                    {plan.status}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground">
                    {plan.completed_steps}/{plan.total_steps} steps
                  </span>
                </div>
              </button>
            ))}
            {plans.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-8">
                {loading ? 'Loading…' : 'No execution plans yet.'}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Plan DAG / Steps */}
      <div className="flex-1 flex flex-col gap-2">
        {selectedPlan ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold truncate">{selectedPlan.goal}</span>
              <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[selectedPlan.status]}`}>
                {selectedPlan.status}
              </Badge>
              <Badge variant="outline" className="text-[9px]">{selectedPlan.complexity}</Badge>
            </div>

            {selectedPlan.total_steps > 0 && (
              <Progress value={(selectedPlan.completed_steps / selectedPlan.total_steps) * 100} className="h-1" />
            )}

            {/* Step pipeline */}
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {steps.map((step, i) => {
                  const GateIcon = step.gate_result ? GATE_ICONS[step.gate_result] || MinusCircle : null;
                  return (
                    <div
                      key={step.id}
                      className="p-2 rounded border border-border/50 bg-card/50"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-muted-foreground font-mono w-4">{i + 1}</span>
                        <Badge className={`${ROLE_COLORS[step.assigned_role]} text-[8px] px-1 py-0 h-3`}>
                          {step.assigned_role}
                        </Badge>
                        <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] font-medium flex-1 truncate">{step.title || step.step_type}</span>
                        <Badge variant="outline" className={`text-[8px] px-1 py-0 h-3 ${STATUS_COLORS[step.status]}`}>
                          {step.status}
                        </Badge>
                        {GateIcon && (
                          <GateIcon className={`h-3 w-3 ${
                            step.gate_result === 'pass' ? 'text-emerald-400' :
                            step.gate_result === 'fail' ? 'text-red-400' :
                            step.gate_result === 'warn' ? 'text-amber-400' : 'text-muted-foreground'
                          }`} />
                        )}
                      </div>
                      {step.description && (
                        <div className="text-[9px] text-muted-foreground mt-0.5 ml-5 truncate">
                          {step.description}
                        </div>
                      )}
                      {step.error && (
                        <div className="text-[9px] text-red-400 mt-0.5 ml-5 truncate">
                          ✗ {step.error}
                        </div>
                      )}
                    </div>
                  );
                })}
                {steps.length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-8">
                    No steps in this plan.
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-muted-foreground text-xs">Select a plan to view its typed execution DAG</span>
          </div>
        )}

        {/* Role legend */}
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(ROLE_COLORS) as APOERole[]).map(role => (
            <Badge key={role} className={`${ROLE_COLORS[role]} text-[8px] px-1.5 py-0`}>
              {role}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
