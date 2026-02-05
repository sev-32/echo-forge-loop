import { Panel, BudgetMeter, StatusIndicator, Icons } from '@/components/ui/status-indicators';
import { useBudget } from '@/hooks/use-orchestration';
import { formatDuration, formatTokens } from '@/lib/utils';

export function BudgetPanel() {
  const { budgetState } = useBudget();

  return (
    <Panel 
      title="Budget Status" 
      icon={<Icons.Zap className="w-4 h-4" />}
      actions={
        <StatusIndicator status={budgetState.status} showLabel pulse={budgetState.status === 'ok'} />
      }
    >
      <div className="space-y-4">
        <BudgetMeter 
          label="Output Tokens" 
          used={budgetState.used.output_tokens} 
          max={budgetState.config.max_output_tokens}
        />
        
        <BudgetMeter 
          label="Tool Calls" 
          used={budgetState.used.tool_calls} 
          max={budgetState.config.max_tool_calls}
        />
        
        <BudgetMeter 
          label="Iterations" 
          used={budgetState.used.iterations} 
          max={budgetState.config.max_iterations}
        />
        
        <BudgetMeter 
          label="Wall Time" 
          used={budgetState.used.wall_time_seconds} 
          max={budgetState.config.max_wall_time_seconds}
          unit="s"
        />

        {budgetState.config.max_risk_budget && (
          <BudgetMeter 
            label="Risk Budget" 
            used={budgetState.used.risk_budget} 
            max={budgetState.config.max_risk_budget}
          />
        )}

        <div className="pt-2 border-t border-border">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Checkpoint Interval</span>
              <p className="font-mono">{budgetState.config.checkpoint_interval} actions</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-mono capitalize">{budgetState.status}</p>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function BudgetSummaryBar() {
  const { budgetState } = useBudget();

  const items = [
    { 
      label: 'Tokens', 
      value: formatTokens(budgetState.used.output_tokens), 
      max: formatTokens(budgetState.config.max_output_tokens) 
    },
    { 
      label: 'Tools', 
      value: budgetState.used.tool_calls.toString(), 
      max: budgetState.config.max_tool_calls.toString() 
    },
    { 
      label: 'Iters', 
      value: budgetState.used.iterations.toString(), 
      max: budgetState.config.max_iterations.toString() 
    },
    { 
      label: 'Time', 
      value: `${budgetState.used.wall_time_seconds}s`, 
      max: `${budgetState.config.max_wall_time_seconds}s` 
    },
  ];

  return (
    <div className="flex items-center gap-6 text-xs font-mono">
      <StatusIndicator status={budgetState.status} size="sm" pulse />
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <span className="text-muted-foreground">{item.label}:</span>
          <span>{item.value}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{item.max}</span>
        </div>
      ))}
    </div>
  );
}
