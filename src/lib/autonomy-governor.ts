// ============================================
// Autonomy Governor - Budgets, modes, and STOP handling
// ============================================

import { formatTimestamp } from '@/lib/utils';
import { eventStore } from '@/lib/event-store';
import type { 
  BudgetConfig, 
  BudgetState, 
  AutonomyMode, 
  RiskPolicy,
  RunMetadata 
} from '@/types/orchestration';

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  max_wall_time_seconds: 300, // 5 minutes
  max_output_tokens: 50000,
  max_tool_calls: 100,
  max_iterations: 50,
  max_risk_budget: 10,
  checkpoint_interval: 5,
};

export const DEFAULT_RISK_POLICY: RiskPolicy = {
  allow_destructive_ops: false,
  allow_external_calls: true,
  allow_artifact_overwrite: false,
  require_approval_for: ['delete', 'overwrite', 'external_api'],
  secrets_redaction: true,
};

export class AutonomyGovernor {
  private budgetState: BudgetState;
  private autonomyMode: AutonomyMode = 'supervised';
  private riskPolicy: RiskPolicy;
  private stopRequested: boolean = false;
  private stopReason?: string;
  private startTime: number = 0;
  private runId: string = '';

  constructor(config?: Partial<BudgetConfig>, policy?: Partial<RiskPolicy>) {
    const fullConfig = { ...DEFAULT_BUDGET_CONFIG, ...config };
    this.riskPolicy = { ...DEFAULT_RISK_POLICY, ...policy };
    
    this.budgetState = {
      config: fullConfig,
      used: {
        wall_time_seconds: 0,
        output_tokens: 0,
        tool_calls: 0,
        iterations: 0,
        risk_budget: 0,
      },
      remaining: {
        wall_time_seconds: fullConfig.max_wall_time_seconds,
        output_tokens: fullConfig.max_output_tokens,
        tool_calls: fullConfig.max_tool_calls,
        iterations: fullConfig.max_iterations,
        risk_budget: fullConfig.max_risk_budget || 10,
      },
      status: 'ok',
    };
  }

  // Start tracking a run
  startRun(runId: string): void {
    this.runId = runId;
    this.startTime = Date.now();
    this.stopRequested = false;
    this.stopReason = undefined;
  }

  // Record token usage
  recordTokens(count: number): void {
    this.budgetState.used.output_tokens += count;
    this.budgetState.remaining.output_tokens = 
      this.budgetState.config.max_output_tokens - this.budgetState.used.output_tokens;
    this.updateStatus();
    this.logBudgetTick('tokens', count);
  }

  // Record tool call
  recordToolCall(): void {
    this.budgetState.used.tool_calls++;
    this.budgetState.remaining.tool_calls = 
      this.budgetState.config.max_tool_calls - this.budgetState.used.tool_calls;
    this.updateStatus();
    this.logBudgetTick('tool_calls', 1);
  }

  // Record iteration
  recordIteration(): void {
    this.budgetState.used.iterations++;
    this.budgetState.remaining.iterations = 
      this.budgetState.config.max_iterations - this.budgetState.used.iterations;
    this.updateStatus();
    this.logBudgetTick('iterations', 1);
  }

  // Record risk action
  recordRiskAction(weight: number = 1): void {
    this.budgetState.used.risk_budget += weight;
    this.budgetState.remaining.risk_budget = 
      (this.budgetState.config.max_risk_budget || 10) - this.budgetState.used.risk_budget;
    this.updateStatus();
    this.logBudgetTick('risk_budget', weight);
  }

  // Update wall time
  updateWallTime(): void {
    if (this.startTime > 0) {
      this.budgetState.used.wall_time_seconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.budgetState.remaining.wall_time_seconds = 
        this.budgetState.config.max_wall_time_seconds - this.budgetState.used.wall_time_seconds;
      this.updateStatus();
    }
  }

  // Update overall budget status
  private updateStatus(): void {
    const ratios = [
      this.budgetState.used.output_tokens / this.budgetState.config.max_output_tokens,
      this.budgetState.used.tool_calls / this.budgetState.config.max_tool_calls,
      this.budgetState.used.iterations / this.budgetState.config.max_iterations,
      this.budgetState.used.wall_time_seconds / this.budgetState.config.max_wall_time_seconds,
    ];

    const maxRatio = Math.max(...ratios);

    if (maxRatio >= 1) {
      this.budgetState.status = 'exhausted';
      if (this.runId) {
        eventStore.appendEvent(this.runId, 'BUDGET_EXHAUSTED', {
          budgets: this.budgetState,
        });
      }
    } else if (maxRatio >= 0.9) {
      this.budgetState.status = 'critical';
    } else if (maxRatio >= 0.75) {
      this.budgetState.status = 'warning';
    } else {
      this.budgetState.status = 'ok';
    }
  }

  // Log budget tick event
  private logBudgetTick(metric: string, delta: number): void {
    if (this.runId) {
      eventStore.appendEvent(this.runId, 'BUDGET_TICK', {
        metric,
        delta,
        current: this.budgetState.used,
        remaining: this.budgetState.remaining,
        status: this.budgetState.status,
      });
    }
  }

  // Check if budget allows continuing
  canContinue(): boolean {
    if (this.stopRequested) return false;
    this.updateWallTime();
    return this.budgetState.status !== 'exhausted';
  }

  // Check if action requires approval based on policy
  requiresApproval(actionType: string): boolean {
    if (this.autonomyMode === 'autonomous') return false;
    if (this.autonomyMode === 'manual') return true;
    return this.riskPolicy.require_approval_for.includes(actionType);
  }

  // Check if action is allowed by policy
  isActionAllowed(actionType: string): boolean {
    switch (actionType) {
      case 'delete':
      case 'destructive':
        return this.riskPolicy.allow_destructive_ops;
      case 'external_api':
      case 'external_call':
        return this.riskPolicy.allow_external_calls;
      case 'overwrite':
        return this.riskPolicy.allow_artifact_overwrite;
      default:
        return true;
    }
  }

  // Request STOP
  requestStop(reason: string): void {
    this.stopRequested = true;
    this.stopReason = reason;
    
    if (this.runId) {
      eventStore.appendEvent(this.runId, 'STOP_REQUESTED', {
        reason,
        timestamp: formatTimestamp(new Date()),
        budgets: this.budgetState,
      });
    }
  }

  // Check if STOP was requested
  isStopRequested(): boolean {
    return this.stopRequested;
  }

  // Get stop reason
  getStopReason(): string | undefined {
    return this.stopReason;
  }

  // Should checkpoint now?
  shouldCheckpoint(actionCount: number): boolean {
    return actionCount % this.budgetState.config.checkpoint_interval === 0;
  }

  // Get budget state
  getBudgetState(): BudgetState {
    this.updateWallTime();
    return { ...this.budgetState };
  }

  // Get autonomy mode
  getMode(): AutonomyMode {
    return this.autonomyMode;
  }

  // Set autonomy mode
  setMode(mode: AutonomyMode): void {
    this.autonomyMode = mode;
  }

  // Get risk policy
  getRiskPolicy(): RiskPolicy {
    return { ...this.riskPolicy };
  }

  // Update risk policy
  updateRiskPolicy(updates: Partial<RiskPolicy>): void {
    this.riskPolicy = { ...this.riskPolicy, ...updates };
  }

  // Get run metadata
  getRunMetadata(projectId: string): RunMetadata {
    return {
      run_id: this.runId,
      project_id: projectId,
      started_at: new Date(this.startTime).toISOString(),
      stopped_at: this.stopRequested ? formatTimestamp(new Date()) : undefined,
      autonomy_mode: this.autonomyMode,
      risk_policy: this.riskPolicy,
      stop_requested: this.stopRequested,
      stop_reason: this.stopReason,
    };
  }

  // Reset governor for new run
  reset(config?: Partial<BudgetConfig>): void {
    const fullConfig = { ...DEFAULT_BUDGET_CONFIG, ...config };
    
    this.budgetState = {
      config: fullConfig,
      used: {
        wall_time_seconds: 0,
        output_tokens: 0,
        tool_calls: 0,
        iterations: 0,
        risk_budget: 0,
      },
      remaining: {
        wall_time_seconds: fullConfig.max_wall_time_seconds,
        output_tokens: fullConfig.max_output_tokens,
        tool_calls: fullConfig.max_tool_calls,
        iterations: fullConfig.max_iterations,
        risk_budget: fullConfig.max_risk_budget || 10,
      },
      status: 'ok',
    };

    this.stopRequested = false;
    this.stopReason = undefined;
    this.startTime = 0;
    this.runId = '';
  }

  // Redact secrets from content
  redactSecrets(content: string): string {
    if (!this.riskPolicy.secrets_redaction) return content;
    
    // Common secret patterns
    const patterns = [
      /sk-[a-zA-Z0-9]{20,}/g, // OpenAI keys
      /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
      /[a-zA-Z0-9]{32,}/g, // Generic API keys (be careful with this)
    ];

    let redacted = content;
    for (const pattern of patterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
    
    return redacted;
  }
}

// Singleton instance
export const governor = new AutonomyGovernor();
