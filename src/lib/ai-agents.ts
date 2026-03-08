// ============================================
// Autonomous Agent System
// Self-running agents that audit, improve, and provide feedback
// ============================================

import { supabase } from '@/integrations/supabase/client';
import * as persistence from '@/lib/persistence';
import { generateId } from '@/lib/utils';

export interface AgentConfig {
  id: string;
  name: string;
  type: 'auditor' | 'improver' | 'monitor' | 'test_gen';
  intervalMs: number;
  enabled: boolean;
}

export interface AgentFeedback {
  id: string;
  agent_id: string;
  agent_name: string;
  timestamp: number;
  type: 'audit' | 'improvement' | 'alert' | 'suggestion' | 'metric';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  actionable?: boolean;
  action_taken?: boolean;
}

export interface AuditResult {
  health_score: number;
  evolution_score: number;
  findings: Array<{
    category: string;
    severity: string;
    title: string;
    description: string;
    evidence?: string;
    recommendation: string;
  }>;
  improvement_tasks: Array<{
    title: string;
    prompt: string;
    priority: number;
    rationale?: string;
  }>;
  summary: string;
  patterns_detected?: string[];
  risk_alerts?: Array<{
    risk: string;
    likelihood: string;
    impact: string;
    mitigation?: string;
  }>;
  usage?: { total_tokens: number };
  error?: string;
}

async function callAIAudit(params: {
  recent_events: unknown[];
  tasks: unknown[];
  journal_entries: unknown[];
  knowledge_graph: { nodes: unknown[]; edges: unknown[] };
  test_results: unknown[];
  budget_state: unknown;
  audit_type: string;
}): Promise<AuditResult> {
  const { data, error } = await supabase.functions.invoke('ai-audit', { body: params });
  if (error) throw new Error(`AI audit failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data as AuditResult;
}

export class AgentSystem {
  private agents: Map<string, AgentConfig> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private feedback: AgentFeedback[] = [];
  private running = false;
  private onFeedback?: (fb: AgentFeedback) => void;
  private lastAuditResult: AuditResult | null = null;

  constructor(onFeedback?: (fb: AgentFeedback) => void) {
    this.onFeedback = onFeedback;
    // Register default agents
    this.registerAgent({ id: 'auditor-main', name: 'System Auditor', type: 'auditor', intervalMs: 60_000, enabled: true });
    this.registerAgent({ id: 'monitor-health', name: 'Health Monitor', type: 'monitor', intervalMs: 30_000, enabled: true });
    this.registerAgent({ id: 'improver-auto', name: 'Auto Improver', type: 'improver', intervalMs: 90_000, enabled: true });
    this.registerAgent({ id: 'stagnation-detect', name: 'Stagnation Detector', type: 'stagnation' as any, intervalMs: 45_000, enabled: true });
  }

  registerAgent(config: AgentConfig) {
    this.agents.set(config.id, config);
  }

  private emitFeedback(agentId: string, type: AgentFeedback['type'], severity: AgentFeedback['severity'], title: string, content: string, metadata?: Record<string, unknown>, actionable = false): AgentFeedback {
    const agent = this.agents.get(agentId);
    const fb: AgentFeedback = {
      id: generateId(), agent_id: agentId, agent_name: agent?.name || agentId,
      timestamp: Date.now(), type, severity, title, content, metadata, actionable,
    };
    this.feedback.push(fb);
    if (this.feedback.length > 500) this.feedback = this.feedback.slice(-400);
    this.onFeedback?.(fb);
    return fb;
  }

  async startAll() {
    if (this.running) return;
    this.running = true;
    this.emitFeedback('system', 'alert', 'info', 'Agents Started', 'All autonomous agents are now running.');

    for (const [id, agent] of this.agents) {
      if (!agent.enabled) continue;
      // Run immediately then on interval
      this.runAgent(id);
      const timer = setInterval(() => this.runAgent(id), agent.intervalMs);
      this.timers.set(id, timer);
    }
  }

  stopAll() {
    this.running = false;
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.emitFeedback('system', 'alert', 'info', 'Agents Stopped', 'All autonomous agents have been stopped.');
  }

  private async runAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    try {
      switch (agent.type) {
        case 'auditor': await this.runAuditor(agent); break;
        case 'monitor': await this.runMonitor(agent); break;
        case 'improver': await this.runImprover(agent); break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.emitFeedback(agentId, 'alert', 'high', `Agent Error: ${agent.name}`, msg);
    }
  }

  private async runAuditor(agent: AgentConfig) {
    const [events, tasks, journal, kg, testRuns] = await Promise.all([
      persistence.fetchRecentEvents(30),
      persistence.fetchAllTasks(),
      persistence.fetchJournalEntries({ limit: 15 }),
      persistence.fetchKnowledgeGraph(),
      persistence.fetchTestRuns({ limit: 10 }),
    ]);

    const result = await callAIAudit({
      recent_events: events, tasks, journal_entries: journal,
      knowledge_graph: kg, test_results: testRuns, budget_state: {},
      audit_type: 'comprehensive',
    });

    this.lastAuditResult = result;

    // Emit health score
    this.emitFeedback(agent.id, 'metric', 'info', 'System Health', `Health: ${result.health_score}/100 | Evolution: ${result.evolution_score}/100`, { health_score: result.health_score, evolution_score: result.evolution_score });

    // Emit findings
    for (const f of result.findings || []) {
      this.emitFeedback(agent.id, 'audit', f.severity as AgentFeedback['severity'], f.title, `${f.description}\n\nRecommendation: ${f.recommendation}`, { category: f.category, evidence: f.evidence }, true);
    }

    // Emit risk alerts
    for (const r of result.risk_alerts || []) {
      this.emitFeedback(agent.id, 'alert', r.likelihood === 'high' ? 'high' : 'medium', `Risk: ${r.risk}`, `Impact: ${r.impact}\nMitigation: ${r.mitigation || 'None suggested'}`, { likelihood: r.likelihood, impact: r.impact });
    }

    // Persist audit as journal entry
    await persistence.persistJournalEntry({
      entry_type: 'audit', title: `System Audit: ${result.health_score}/100`,
      content: result.summary, tags: ['audit', 'self-audit', 'agent'],
      priority: result.health_score < 50 ? 'critical' : result.health_score < 70 ? 'high' : 'medium',
      metadata: { health_score: result.health_score, evolution_score: result.evolution_score, findings_count: result.findings?.length || 0, patterns: result.patterns_detected },
    });

    this.emitFeedback(agent.id, 'audit', 'info', 'Audit Complete', result.summary, { tokens: result.usage?.total_tokens });
  }

  private async runMonitor(agent: AgentConfig) {
    // Quick health check - read from DB directly
    const [events, tasks] = await Promise.all([
      persistence.fetchRecentEvents(10),
      persistence.fetchAllTasks(),
    ]);

    const failedTasks = tasks.filter(t => t.status === 'failed');
    const queuedTasks = tasks.filter(t => t.status === 'queued');
    const doneTasks = tasks.filter(t => t.status === 'done');
    const totalTasks = tasks.length;

    const failRate = totalTasks > 0 ? failedTasks.length / totalTasks : 0;
    const completionRate = totalTasks > 0 ? doneTasks.length / totalTasks : 0;

    if (failRate > 0.5) {
      this.emitFeedback(agent.id, 'alert', 'critical', 'High Failure Rate', `${Math.round(failRate * 100)}% of tasks are failing (${failedTasks.length}/${totalTasks}). System may be stuck.`, { failRate, failedTasks: failedTasks.length }, true);
    }

    this.emitFeedback(agent.id, 'metric', 'info', 'Task Metrics', `Total: ${totalTasks} | Done: ${doneTasks.length} | Failed: ${failedTasks.length} | Queued: ${queuedTasks.length} | Completion: ${Math.round(completionRate * 100)}%`, { totalTasks, done: doneTasks.length, failed: failedTasks.length, queued: queuedTasks.length });
  }

  private async runImprover(agent: AgentConfig) {
    if (!this.lastAuditResult?.improvement_tasks?.length) return;

    // Take top 2 improvement tasks and queue them for the next run
    const topTasks = this.lastAuditResult.improvement_tasks.slice(0, 2);
    for (const task of topTasks) {
      this.emitFeedback(agent.id, 'suggestion', 'medium', `Improvement: ${task.title}`, `${task.prompt}\n\nRationale: ${task.rationale || 'AI-identified improvement'}`, { priority: task.priority }, true);
    }

    // Persist improvement tasks to DB for the kernel to pick up
    for (const task of topTasks) {
      // Find the latest run_id from recent events
      const events = await persistence.fetchRecentEvents(1);
      const runId = events[0]?.run_id || 'agent-improvements';
      await persistence.persistTask({ run_id: runId, title: `[Auto] ${task.title}`, prompt: task.prompt, priority: task.priority, status: 'queued' });
      this.emitFeedback(agent.id, 'improvement', 'info', `Task Created: ${task.title}`, `Automatically queued improvement task with priority ${task.priority}`);
    }
  }

  isRunning() { return this.running; }
  getFeedback() { return [...this.feedback]; }
  getAgents() { return Array.from(this.agents.values()); }
  getLastAudit() { return this.lastAuditResult; }

  toggleAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.enabled = !agent.enabled;
    if (!agent.enabled && this.timers.has(agentId)) {
      clearInterval(this.timers.get(agentId)!);
      this.timers.delete(agentId);
    } else if (agent.enabled && this.running) {
      this.runAgent(agentId);
      const timer = setInterval(() => this.runAgent(agentId), agent.intervalMs);
      this.timers.set(agentId, timer);
    }
  }

  clearFeedback() { this.feedback = []; }
}
