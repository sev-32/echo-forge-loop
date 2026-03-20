// ============================================
// AI-Powered Orchestration Kernel
// Replaces stub logic with real AI inference
// ============================================

import { generateId, formatTimestamp } from '@/lib/utils';
import { eventStore } from '@/lib/event-store';
import { taskQueue } from '@/lib/task-queue';
import { governor } from '@/lib/autonomy-governor';
import { verifier } from '@/lib/verifier';
import { contextManager } from '@/lib/context-manager';
import { callAIStep, callAIVerify, callAIJournal } from '@/lib/ai-service';
import * as persistence from '@/lib/persistence';
import type { Task, Snapshot, KernelState } from '@/types/orchestration';

export type AIKernelStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export interface AIKernelConfig {
  projectId: string;
  useAI?: boolean; // true = real AI, false = stub
  persistToCloud?: boolean;
  onStateChange?: (state: KernelState) => void;
  onActivity?: (activity: ActivityEntry) => void;
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  type: 'plan' | 'execute' | 'verify' | 'reflect' | 'discover' | 'error' | 'checkpoint' | 'task_created' | 'budget';
  content: string;
  metadata?: Record<string, unknown>;
}

export class AIOrchestrationKernel {
  private state: KernelState;
  private config: AIKernelConfig;
  private activities: ActivityEntry[] = [];
  private actionsSinceCheckpoint = 0;
  private totalTokensUsed = 0;

  constructor(config: AIKernelConfig) {
    this.config = config;
    this.state = { run_id: '', status: 'idle', iteration: 0, last_checkpoint_at: 0, events: [], snapshot: null };
  }

  getActivities(): ActivityEntry[] { return [...this.activities]; }

  private emitActivity(type: ActivityEntry['type'], content: string, metadata?: Record<string, unknown>) {
    const entry: ActivityEntry = { id: generateId(), timestamp: Date.now(), type, content, metadata };
    this.activities.push(entry);
    if (this.activities.length > 200) this.activities = this.activities.slice(-150);
    this.config.onActivity?.(entry);
  }

  async startRun(initialTasks?: Partial<Task>[]): Promise<string> {
    const runId = generateId();
    this.state = { run_id: runId, status: 'running', iteration: 0, last_checkpoint_at: 0, events: [], snapshot: null };
    this.activities = [];
    this.actionsSinceCheckpoint = 0;
    this.totalTokensUsed = 0;

    governor.reset(undefined);
    governor.startRun(runId);

    const evt = { project_id: this.config.projectId, autonomy_mode: governor.getMode(), budgets: governor.getBudgetState(), timestamp: formatTimestamp(new Date()) };
    eventStore.appendEvent(runId, 'RUN_STARTED', evt);
    if (this.config.persistToCloud) await persistence.persistEvent(runId, 'RUN_STARTED', evt);

    this.emitActivity('checkpoint', `Run ${runId.slice(0, 8)} started`);

    if (initialTasks) {
      for (const t of initialTasks) {
        const task = taskQueue.createTask(runId, t.title || 'Untitled', t.prompt || '', {
          acceptance_criteria: t.acceptance_criteria, dependencies: t.dependencies, priority: t.priority,
        });
        if (this.config.persistToCloud) {
          await persistence.persistTask({ run_id: runId, title: task.title, prompt: task.prompt, priority: task.priority, acceptance_criteria: task.acceptance_criteria as unknown[], dependencies: task.dependencies });
        }
        this.emitActivity('task_created', `Task queued: ${task.title}`, { task_id: task.task_id });
      }
    }

    this.config.onStateChange?.(this.getState());
    return runId;
  }

  async step(): Promise<{ completed: boolean; task?: Task; error?: string }> {
    if (this.state.status !== 'running') return { completed: false, error: 'Not running' };
    if (governor.isStopRequested()) { await this.handleStop(); return { completed: true }; }
    if (!governor.canContinue()) { await this.handleBudgetExhausted(); return { completed: true }; }

    const task = taskQueue.getNextTask();
    if (!task) {
      const stats = taskQueue.getStats();
      if (stats.queued === 0 && stats.active === 0 && stats.blocked === 0) {
        this.state.status = 'stopped';
        eventStore.appendEvent(this.state.run_id, 'RUN_STOPPED', { reason: 'All tasks completed', stats });
        this.emitActivity('checkpoint', 'All tasks completed');
        return { completed: true };
      }
      return { completed: false, error: 'No ready tasks' };
    }

    this.state.current_task_id = task.task_id;
    this.state.iteration++;
    governor.recordIteration();
    taskQueue.updateStatus(this.state.run_id, task.task_id, 'active', 'Starting');

    try {
      if (this.config.useAI) {
        return await this.executeWithAI(task);
      } else {
        return await this.executeStub(task);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      taskQueue.updateStatus(this.state.run_id, task.task_id, 'failed', msg);
      eventStore.appendEvent(this.state.run_id, 'ERROR_RAISED', { task_id: task.task_id, error: msg });
      this.emitActivity('error', `Task failed: ${msg}`, { task_id: task.task_id });
      return { completed: false, task, error: msg };
    }
  }

  private async executeWithAI(task: Task): Promise<{ completed: boolean; task: Task }> {
    // Assemble context window
    const pinnedCtx = contextManager.getPinnedContext().map(c => ({ content: c.content }));
    const workingCtx = contextManager.getWorkingContext().map(c => ({ content: c.content }));
    const processNotes = contextManager.getWorkingContext().filter(c => c.source === 'process_note').map(c => c.content);

    this.emitActivity('plan', `Planning: ${task.title}`, { task_id: task.task_id });

    // AI Step: plan + execute
    const stepResult = await callAIStep(
      { title: task.title, prompt: task.prompt, acceptance_criteria: task.acceptance_criteria as unknown[], priority: task.priority },
      { pinned: pinnedCtx, working: workingCtx, process_notes: processNotes },
      governor.getMode()
    );

    const tokensUsed = stepResult.usage?.total_tokens || 500;
    this.totalTokensUsed += tokensUsed;
    governor.recordTokens(tokensUsed);

    const planPayload = { task_id: task.task_id, plan: stepResult.plan };
    const execPayload = { task_id: task.task_id, result: stepResult.result, confidence: stepResult.self_assessment.confidence };
    eventStore.appendEvent(this.state.run_id, 'PLAN_CREATED', planPayload);
    eventStore.appendEvent(this.state.run_id, 'ACTION_EXECUTED', execPayload);
    if (this.config.persistToCloud) {
      await persistence.persistEvent(this.state.run_id, 'PLAN_CREATED', planPayload);
      await persistence.persistEvent(this.state.run_id, 'ACTION_EXECUTED', execPayload);
    }

    this.emitActivity('execute', `Executed with ${stepResult.plan.steps.length} steps (confidence: ${Math.round(stepResult.self_assessment.confidence * 100)}%)`, { task_id: task.task_id, tokens: tokensUsed });

    // Handle discoveries
    if (stepResult.discoveries?.length) {
      for (const d of stepResult.discoveries) {
        this.emitActivity('discover', `[${d.type}] ${d.content}`, { priority: d.priority });
        if (this.config.persistToCloud) {
          await persistence.persistJournalEntry({ entry_type: 'discovery', title: d.type, content: d.content, priority: d.priority || 'medium', run_id: this.state.run_id, task_id: task.task_id });
        }
      }
    }

    // Handle new tasks from AI
    if (stepResult.new_tasks?.length) {
      for (const nt of stepResult.new_tasks) {
        const newTask = taskQueue.createTask(this.state.run_id, nt.title, nt.prompt, { priority: nt.priority || 50 });
        if (this.config.persistToCloud) {
          await persistence.persistTask({ run_id: this.state.run_id, title: nt.title, prompt: nt.prompt, priority: nt.priority || 50 });
        }
        this.emitActivity('task_created', `AI spawned task: ${nt.title}`);
      }
    }

    // AI Verify
    if (task.acceptance_criteria.length > 0) {
      this.emitActivity('verify', `Verifying: ${task.title}`);
      const verification = await callAIVerify(stepResult.result.output, task.acceptance_criteria as unknown[]);
      const verifyTokens = verification.usage?.total_tokens || 200;
      this.totalTokensUsed += verifyTokens;
      governor.recordTokens(verifyTokens);

      const verifyPayload = { task_id: task.task_id, score: verification.overall_score, summary: verification.summary };
      eventStore.appendEvent(this.state.run_id, verification.passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED', verifyPayload);
      if (this.config.persistToCloud) {
        await persistence.persistEvent(this.state.run_id, verification.passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED', verifyPayload);
      }

      if (!verification.passed) {
        const fixTask = taskQueue.createTask(this.state.run_id, `Fix: ${task.title}`, `Fix: ${verification.summary}. Details: ${verification.criteria_results.filter(r => !r.passed).map(r => r.fix_suggestion || r.reasoning).join('; ')}`, { priority: task.priority + 10 });
        taskQueue.updateStatus(this.state.run_id, task.task_id, 'failed', 'Verification failed');
        this.emitActivity('error', `Verification failed (${verification.overall_score}/100): ${verification.summary}`, { fix_task: fixTask.task_id });
      } else {
        taskQueue.updateStatus(this.state.run_id, task.task_id, 'done', 'Verified');
        this.emitActivity('verify', `✓ Verified (${verification.overall_score}/100)`, { task_id: task.task_id });
      }
    } else {
      taskQueue.updateStatus(this.state.run_id, task.task_id, 'done', 'Completed');
    }

    // AI Journal (self-reflection) every 2 tasks
    if (this.state.iteration % 2 === 0) {
      await this.reflect(task, stepResult);
    }

    // Checkpoint check
    this.actionsSinceCheckpoint++;
    if (governor.shouldCheckpoint(this.actionsSinceCheckpoint)) {
      await this.createCheckpoint(`After ${this.actionsSinceCheckpoint} actions`);
      this.actionsSinceCheckpoint = 0;
    }

    this.emitActivity('budget', `Tokens: ${this.totalTokensUsed} | Iteration: ${this.state.iteration}`, { budgets: governor.getBudgetState() });
    this.config.onStateChange?.(this.getState());
    return { completed: false, task };
  }

  private async reflect(task: Task, stepResult: unknown) {
    try {
      this.emitActivity('reflect', 'Self-reflecting on recent work...');
      const recentEvents = eventStore.getEvents().slice(-20);
      const journalHistory = this.config.persistToCloud ? await persistence.fetchJournalEntries({ run_id: this.state.run_id, limit: 10 }) : [];
      const kg = this.config.persistToCloud ? await persistence.fetchKnowledgeGraph() : { nodes: [], edges: [] };

      const reflection = await callAIJournal(recentEvents, stepResult, journalHistory, kg, 'post_task');
      const reflectTokens = reflection.usage?.total_tokens || 300;
      this.totalTokensUsed += reflectTokens;
      governor.recordTokens(reflectTokens);

      // Persist journal entries
      for (const je of reflection.journal_entries || []) {
        this.emitActivity('reflect', `[${je.entry_type}] ${je.title}`);
        if (this.config.persistToCloud) {
          await persistence.persistJournalEntry({ ...je, run_id: this.state.run_id, task_id: task.task_id });
        }
      }

      // Persist knowledge graph updates
      if (reflection.knowledge_updates?.new_nodes?.length && this.config.persistToCloud) {
        const nodeMap: Record<string, string> = {};
        for (const n of reflection.knowledge_updates.new_nodes) {
          const saved = await persistence.persistKnowledgeNode({ label: n.label, node_type: n.node_type });
          if (saved) nodeMap[n.label] = saved.id as string;
        }
        for (const e of reflection.knowledge_updates.new_edges || []) {
          const sourceId = nodeMap[e.source_label];
          const targetId = nodeMap[e.target_label];
          if (sourceId && targetId) {
            await persistence.persistKnowledgeEdge({ source_id: sourceId, target_id: targetId, relation: e.relation, weight: e.weight });
          }
        }
      }

      // Inject process improvements into working context
      for (const pi of reflection.process_improvements || []) {
        contextManager.addToWorking(`[PROCESS IMPROVEMENT] ${pi.area}: ${pi.suggested_improvement}`, 'ai-journal', 80);
        this.emitActivity('reflect', `Process improvement: ${pi.suggested_improvement}`);
      }

      // Update context banks
      for (const cbu of reflection.context_bank_updates || []) {
        if (this.config.persistToCloud) {
          const banks = await persistence.fetchContextBanks();
          let bank = banks.find(b => b.name === cbu.bank_name);
          if (!bank) {
            bank = await persistence.persistContextBank({ name: cbu.bank_name, description: `Auto-created by AI journal` });
          }
          if (bank) {
            await persistence.persistContextBankEntry({ bank_id: bank.id as string, content: cbu.content, source: 'ai-journal', priority: cbu.priority || 50 });
          }
        }
      }
    } catch (e) {
      console.error('Reflection failed:', e);
      this.emitActivity('error', `Reflection failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  private async executeStub(task: Task): Promise<{ completed: boolean; task: Task }> {
    // Original stub logic
    eventStore.appendEvent(this.state.run_id, 'ACTION_EXECUTED', { task_id: task.task_id, action: 'stub_execute' });
    governor.recordTokens(100);
    this.emitActivity('execute', `[Stub] Executed: ${task.title}`);

    if (task.acceptance_criteria.length > 0) {
      const verification = await verifier.verifyTask(this.state.run_id, task.task_id, task.acceptance_criteria, { success: true });
      if (!verification.passed) {
        taskQueue.createTask(this.state.run_id, `Fix: ${task.title}`, `Fix verification failures`, { priority: task.priority + 10 });
        taskQueue.updateStatus(this.state.run_id, task.task_id, 'failed', 'Verification failed');
      } else {
        taskQueue.updateStatus(this.state.run_id, task.task_id, 'done', 'Verified');
      }
    } else {
      taskQueue.updateStatus(this.state.run_id, task.task_id, 'done', 'Completed');
    }

    this.actionsSinceCheckpoint++;
    if (governor.shouldCheckpoint(this.actionsSinceCheckpoint)) {
      await this.createCheckpoint(`Periodic`);
      this.actionsSinceCheckpoint = 0;
    }

    this.config.onStateChange?.(this.getState());
    return { completed: false, task };
  }

  private async handleStop() {
    this.state.status = 'stopped';
    eventStore.appendEvent(this.state.run_id, 'RUN_STOPPED', { reason: governor.getStopReason(), budgets: governor.getBudgetState() });
    await this.createCheckpoint(`STOP: ${governor.getStopReason()}`);
    this.emitActivity('checkpoint', `STOPPED: ${governor.getStopReason()}`);
    this.config.onStateChange?.(this.getState());
  }

  private async handleBudgetExhausted() {
    this.state.status = 'stopped';
    eventStore.appendEvent(this.state.run_id, 'RUN_STOPPED', { reason: 'Budget exhausted', budgets: governor.getBudgetState() });
    await this.createCheckpoint('Budget exhausted');
    this.emitActivity('budget', 'Budget exhausted - halting');
    this.config.onStateChange?.(this.getState());
  }

  async createCheckpoint(reason: string): Promise<Snapshot | null> {
    const { pinned, working, artifacts } = contextManager.export();
    const { tasks, edges } = taskQueue.export();
    const snapshot = eventStore.createSnapshot(this.state.run_id, tasks, edges, pinned, working, artifacts, governor.getBudgetState(), governor.getRunMetadata(this.config.projectId));

    eventStore.appendEvent(this.state.run_id, 'CHECKPOINT_CREATED', { snapshot_id: snapshot.snapshot_id, reason, iteration: this.state.iteration });
    this.state.snapshot = snapshot;
    this.state.last_checkpoint_at = this.state.iteration;

    if (this.config.persistToCloud) {
      await persistence.persistSnapshot(this.state.run_id, reason, snapshot as unknown as Record<string, unknown>, eventStore.getEventCount());
      await persistence.persistEvent(this.state.run_id, 'CHECKPOINT_CREATED', { snapshot_id: snapshot.snapshot_id, reason });
    }

    this.emitActivity('checkpoint', `Checkpoint: ${reason}`);
    return snapshot;
  }

  requestStop(reason = 'User requested') { governor.requestStop(reason); }
  pause() { if (this.state.status === 'running') { this.state.status = 'paused'; this.config.onStateChange?.(this.getState()); } }
  resume() { if (this.state.status === 'paused') { this.state.status = 'running'; this.config.onStateChange?.(this.getState()); } }

  async runToCompletion(delayMs = 500) {
    while (this.state.status === 'running') {
      const r = await this.step();
      if (r.completed) break;
      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  getState(): KernelState { return { ...this.state }; }
  getStatus() { return this.state.status; }
  getRunId() { return this.state.run_id; }
  getTotalTokens() { return this.totalTokensUsed; }

  reset() {
    this.state = { run_id: '', status: 'idle', iteration: 0, last_checkpoint_at: 0, events: [], snapshot: null };
    this.activities = [];
    eventStore.clear();
    taskQueue.clear();
    contextManager.clear();
    governor.reset();
    verifier.clearAuditEntries();
  }
}

export function createAIKernel(config: AIKernelConfig): AIOrchestrationKernel {
  return new AIOrchestrationKernel(config);
}
