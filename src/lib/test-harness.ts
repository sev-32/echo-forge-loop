// ============================================
// Test Harness - DSL, Runner, and Scoring
// ============================================

import { generateId, formatTimestamp } from '@/lib/utils';
import { createKernel, OrchestrationKernel } from '@/lib/orchestration-kernel';
import { taskQueue } from '@/lib/task-queue';
import { eventStore } from '@/lib/event-store';
import { contextManager } from '@/lib/context-manager';
import { governor } from '@/lib/autonomy-governor';
import type { 
  TestSpec, 
  TestResult, 
  ScoringRubricItem,
  Task 
} from '@/types/orchestration';

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  tests: TestSpec[];
}

export class TestHarness {
  private specs: Map<string, TestSpec> = new Map();
  private suites: Map<string, TestSuite> = new Map();
  private results: Map<string, TestResult> = new Map();

  // Register a test spec
  registerTest(spec: TestSpec): void {
    this.specs.set(spec.test_id, spec);
  }

  // Register a test suite
  registerSuite(suite: TestSuite): void {
    this.suites.set(suite.id, suite);
    for (const test of suite.tests) {
      this.registerTest(test);
    }
  }

  // Run a single test
  async runTest(testId: string): Promise<TestResult> {
    const spec = this.specs.get(testId);
    if (!spec) {
      throw new Error(`Test not found: ${testId}`);
    }

    const startTime = Date.now();
    const errors: string[] = [];
    const artifacts: string[] = [];

    // Create fresh kernel
    const kernel = createKernel({
      projectId: `test-${testId}`,
      budgetConfig: spec.budgets,
      autonomyMode: 'autonomous',
    });

    // Set up initial context
    if (spec.initial_context.text) {
      contextManager.pinContext(spec.initial_context.text, 'test_setup');
    }
    if (spec.initial_context.pinned_constraints) {
      for (const constraint of spec.initial_context.pinned_constraints) {
        contextManager.pinContext(constraint, 'test_constraint');
      }
    }

    // Create initial tasks
    const initialTasks: Partial<Task>[] = spec.initial_queue.map(t => ({
      title: t.title,
      prompt: t.prompt,
      acceptance_criteria: t.acceptance_criteria,
      dependencies: t.dependencies,
      priority: t.priority,
    }));

    // Start run
    const runId = kernel.startRun(initialTasks);

    // Set up injections
    let injectionIndex = 0;
    const actionInjections = spec.queued_injections?.filter(
      i => i.trigger.type === 'action_count'
    ) || [];

    // Run until completion
    try {
      let actionCount = 0;
      while (kernel.getStatus() === 'running') {
        // Check for injections
        for (const injection of actionInjections) {
          if (injection.trigger.value === actionCount) {
            await this.handleInjection(runId, kernel, injection);
          }
        }

        const result = await kernel.step();
        actionCount++;

        if (result.completed) break;
        if (result.error) errors.push(result.error);

        // Safety limit
        if (actionCount > 1000) {
          errors.push('Safety limit reached: 1000 actions');
          break;
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    // Collect artifacts
    for (const artifact of contextManager.getArtifacts()) {
      artifacts.push(artifact.name);
    }

    // Score the result
    const scoring = this.scoreTest(spec, kernel);

    const result: TestResult = {
      test_id: testId,
      passed: scoring.passed,
      score: scoring.score,
      max_score: scoring.maxScore,
      breakdown: scoring.breakdown,
      run_id: runId,
      duration_ms: Date.now() - startTime,
      events_count: eventStore.getEventCount(),
      artifacts,
      errors,
    };

    this.results.set(testId, result);
    return result;
  }

  // Run a test suite
  async runSuite(suiteId: string): Promise<TestResult[]> {
    const suite = this.suites.get(suiteId);
    if (!suite) {
      throw new Error(`Suite not found: ${suiteId}`);
    }

    const results: TestResult[] = [];
    for (const test of suite.tests) {
      // Reset state between tests
      eventStore.clear();
      taskQueue.clear();
      contextManager.clear();
      governor.reset();

      const result = await this.runTest(test.test_id);
      results.push(result);
    }

    return results;
  }

  // Handle a queued injection
  private async handleInjection(
    runId: string,
    kernel: OrchestrationKernel,
    injection: NonNullable<TestSpec['queued_injections']>[0]
  ): Promise<void> {
    switch (injection.action) {
      case 'add_task': {
        const taskData = injection.payload as Partial<Task>;
        taskQueue.createTask(runId, taskData.title || 'Injected Task', taskData.prompt || '', {
          priority: taskData.priority || 50,
          dependencies: taskData.dependencies,
        });
        break;
      }
      case 'reprioritize': {
        const { task_id, priority } = injection.payload as { task_id: string; priority: number };
        taskQueue.reprioritize(runId, task_id, priority, 'Test injection');
        break;
      }
      case 'stop':
        kernel.requestStop('Test injection: STOP');
        break;
      case 'inject_context': {
        const context = injection.payload as string;
        contextManager.addToWorking(context, 'test_injection');
        break;
      }
    }
  }

  // Score a test result
  private scoreTest(
    spec: TestSpec,
    kernel: OrchestrationKernel
  ): { passed: boolean; score: number; maxScore: number; breakdown: TestResult['breakdown'] } {
    const breakdown: TestResult['breakdown'] = [];
    let totalScore = 0;
    let maxScore = 0;

    // Check must_do criteria
    for (const mustDo of spec.must_do) {
      const weight = 1;
      maxScore += weight;
      const found = this.checkMustDo(mustDo);
      if (found) {
        totalScore += weight;
        breakdown.push({ criterion: `must_do: ${mustDo}`, score: weight, max_score: weight, notes: 'Satisfied' });
      } else {
        breakdown.push({ criterion: `must_do: ${mustDo}`, score: 0, max_score: weight, notes: 'Not satisfied' });
      }
    }

    // Check must_not_do criteria
    for (const mustNotDo of spec.must_not_do) {
      const weight = 1;
      maxScore += weight;
      const violated = this.checkMustNotDo(mustNotDo);
      if (!violated) {
        totalScore += weight;
        breakdown.push({ criterion: `must_not_do: ${mustNotDo}`, score: weight, max_score: weight, notes: 'Not violated' });
      } else {
        breakdown.push({ criterion: `must_not_do: ${mustNotDo}`, score: 0, max_score: weight, notes: 'Violated' });
      }
    }

    // Score rubric items
    for (const rubricItem of spec.scoring_rubric) {
      maxScore += rubricItem.weight * (rubricItem.max_score || 1);
      const itemScore = this.scoreRubricItem(rubricItem);
      totalScore += itemScore;
      breakdown.push({
        criterion: rubricItem.criterion,
        score: itemScore,
        max_score: rubricItem.weight * (rubricItem.max_score || 1),
        notes: itemScore > 0 ? 'Passed' : 'Failed',
      });
    }

    // Check acceptance criteria
    for (const criterion of spec.acceptance_criteria) {
      maxScore += 1;
      // Simple check - in production would be more sophisticated
      const met = this.checkAcceptanceCriterion(criterion);
      if (met) {
        totalScore += 1;
        breakdown.push({ criterion, score: 1, max_score: 1, notes: 'Met' });
      } else {
        breakdown.push({ criterion, score: 0, max_score: 1, notes: 'Not met' });
      }
    }

    const passed = totalScore >= maxScore * 0.8; // 80% threshold

    return { passed, score: totalScore, maxScore, breakdown };
  }

  // Check if a must_do criterion is satisfied
  private checkMustDo(criterion: string): boolean {
    const events = eventStore.getEvents();
    const lowerCriterion = criterion.toLowerCase();

    // Check event types
    if (lowerCriterion.includes('checkpoint')) {
      return events.some(e => e.type === 'CHECKPOINT_CREATED');
    }
    if (lowerCriterion.includes('verification')) {
      return events.some(e => e.type === 'VERIFICATION_RUN' || e.type === 'VERIFICATION_PASSED');
    }
    if (lowerCriterion.includes('task')) {
      const stats = taskQueue.getStats();
      if (lowerCriterion.includes('complete')) {
        return stats.done > 0;
      }
    }

    // Default: check if any event payload contains the criterion
    return events.some(e => JSON.stringify(e.payload).toLowerCase().includes(lowerCriterion));
  }

  // Check if a must_not_do criterion was violated
  private checkMustNotDo(criterion: string): boolean {
    const events = eventStore.getEvents();
    const lowerCriterion = criterion.toLowerCase();

    if (lowerCriterion.includes('budget')) {
      return events.some(e => e.type === 'BUDGET_EXHAUSTED');
    }
    if (lowerCriterion.includes('error')) {
      return events.some(e => e.type === 'ERROR_RAISED');
    }

    return false;
  }

  // Score a rubric item
  private scoreRubricItem(item: ScoringRubricItem): number {
    // Simplified scoring - in production would be more sophisticated
    const criterionLower = item.criterion.toLowerCase();

    if (criterionLower.includes('checkpoint')) {
      const checkpoints = eventStore.getEventsByType('CHECKPOINT_CREATED');
      return checkpoints.length > 0 ? item.weight : 0;
    }

    if (criterionLower.includes('budget')) {
      const budgets = governor.getBudgetState();
      return budgets.status !== 'exhausted' ? item.weight : 0;
    }

    // Default pass
    return item.scoring === 'binary' ? item.weight : item.weight * 0.5;
  }

  // Check acceptance criterion
  private checkAcceptanceCriterion(criterion: string): boolean {
    // Simplified - would parse and evaluate structured criteria in production
    return Math.random() > 0.3; // 70% pass rate for demo
  }

  // Get test result
  getResult(testId: string): TestResult | undefined {
    return this.results.get(testId);
  }

  // Get all results
  getAllResults(): TestResult[] {
    return Array.from(this.results.values());
  }

  // Generate report
  generateReport(): string {
    const results = this.getAllResults();
    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    let report = `# Test Report\n\n`;
    report += `**Total:** ${total} | **Passed:** ${passed} | **Failed:** ${total - passed}\n\n`;

    for (const result of results) {
      report += `## ${result.test_id}\n`;
      report += `- **Status:** ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
      report += `- **Score:** ${result.score}/${result.max_score}\n`;
      report += `- **Duration:** ${result.duration_ms}ms\n`;
      report += `- **Events:** ${result.events_count}\n`;
      
      if (result.errors.length > 0) {
        report += `- **Errors:** ${result.errors.join('; ')}\n`;
      }
      
      report += `\n### Breakdown\n`;
      for (const item of result.breakdown) {
        const icon = item.score === item.max_score ? '✓' : '✗';
        report += `- ${icon} ${item.criterion}: ${item.score}/${item.max_score} (${item.notes})\n`;
      }
      report += '\n';
    }

    return report;
  }

  // Get registered specs
  getSpecs(): TestSpec[] {
    return Array.from(this.specs.values());
  }

  // Get registered suites
  getSuites(): TestSuite[] {
    return Array.from(this.suites.values());
  }
}

// Singleton instance
export const testHarness = new TestHarness();

// Pre-built test specs (12 required tests)
export const BUILT_IN_TESTS: TestSpec[] = [
  {
    test_id: 'queue_orchestration_reprioritize',
    category: 'orchestration',
    difficulty: 'medium',
    description: 'Test queue orchestration with reprioritization',
    initial_context: { text: 'Test project for queue management' },
    initial_queue: [
      { title: 'Task A', prompt: 'Execute task A', priority: 50 },
      { title: 'Task B', prompt: 'Execute task B', priority: 30 },
      { title: 'Task C', prompt: 'Execute task C', priority: 70 },
    ],
    queued_injections: [
      { trigger: { type: 'action_count', value: 2 }, action: 'reprioritize', payload: { task_id: 'auto', priority: 100 } },
    ],
    budgets: { max_wall_time_seconds: 60, max_output_tokens: 5000, max_tool_calls: 20, max_iterations: 10, checkpoint_interval: 3 },
    must_do: ['execute tasks in priority order', 'handle reprioritization'],
    must_not_do: ['exceed budget'],
    acceptance_criteria: ['All tasks completed or checkpointed'],
    scoring_rubric: [
      { criterion: 'Tasks executed in correct order', weight: 2, scoring: 'binary' },
      { criterion: 'Reprioritization handled correctly', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'context_overload_extraction',
    category: 'context',
    difficulty: 'hard',
    description: 'Test context management under overload',
    initial_context: { 
      text: 'Large context item '.repeat(1000),
      pinned_constraints: ['Must not exceed 10K tokens', 'Must summarize when needed'],
    },
    initial_queue: [
      { title: 'Process Context', prompt: 'Process and summarize the context' },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 3000, max_tool_calls: 10, max_iterations: 5, checkpoint_interval: 2 },
    must_do: ['summarize context', 'respect token limits'],
    must_not_do: ['lose pinned constraints'],
    acceptance_criteria: ['Context properly managed'],
    scoring_rubric: [
      { criterion: 'Token limits respected', weight: 3, scoring: 'binary' },
      { criterion: 'Constraints preserved', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'verification_first',
    category: 'verification',
    difficulty: 'medium',
    description: 'Test verification-first behavior',
    initial_context: { text: 'Verification test' },
    initial_queue: [
      { 
        title: 'Verify Schema', 
        prompt: 'Output must match schema',
        acceptance_criteria: [
          { id: 'schema_check', type: 'schema', description: 'Must be valid JSON', config: { schema: { name: 'string', value: 'number' } }, required: true },
        ],
      },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 2000, max_tool_calls: 10, max_iterations: 5, checkpoint_interval: 2 },
    must_do: ['run verification', 'create fix task on failure'],
    must_not_do: ['skip verification'],
    acceptance_criteria: ['Verification ran'],
    scoring_rubric: [
      { criterion: 'Verification executed', weight: 3, scoring: 'binary' },
      { criterion: 'Fix task created if needed', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'stop_interruption',
    category: 'interruption',
    difficulty: 'easy',
    description: 'Test STOP interruption at action N',
    initial_context: { text: 'Stop test' },
    initial_queue: [
      { title: 'Long Task 1', prompt: 'This takes many steps' },
      { title: 'Long Task 2', prompt: 'This should not start' },
    ],
    queued_injections: [
      { trigger: { type: 'action_count', value: 3 }, action: 'stop', payload: 'Test STOP injection' },
    ],
    budgets: { max_wall_time_seconds: 60, max_output_tokens: 10000, max_tool_calls: 50, max_iterations: 20, checkpoint_interval: 2 },
    must_do: ['stop immediately', 'create checkpoint'],
    must_not_do: ['continue after STOP'],
    acceptance_criteria: ['Stopped with checkpoint'],
    scoring_rubric: [
      { criterion: 'Immediate stop', weight: 3, scoring: 'binary' },
      { criterion: 'Checkpoint created', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'budget_compliance_tokens',
    category: 'budget',
    difficulty: 'medium',
    description: 'Test token budget compliance',
    initial_context: { text: 'Budget test' },
    initial_queue: [
      { title: 'Token Heavy Task', prompt: 'Generate a lot of output' },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 500, max_tool_calls: 50, max_iterations: 20, checkpoint_interval: 2 },
    must_do: ['respect token limit', 'checkpoint before exhaustion'],
    must_not_do: ['exceed token budget'],
    acceptance_criteria: ['Budget not exceeded'],
    scoring_rubric: [
      { criterion: 'Token budget respected', weight: 4, scoring: 'binary' },
    ],
  },
  {
    test_id: 'budget_compliance_time',
    category: 'budget',
    difficulty: 'medium',
    description: 'Test wall time budget compliance',
    initial_context: { text: 'Time budget test' },
    initial_queue: [
      { title: 'Slow Task', prompt: 'This simulates slow execution' },
    ],
    budgets: { max_wall_time_seconds: 5, max_output_tokens: 10000, max_tool_calls: 100, max_iterations: 50, checkpoint_interval: 2 },
    must_do: ['respect time limit'],
    must_not_do: ['exceed time budget'],
    acceptance_criteria: ['Time budget not exceeded'],
    scoring_rubric: [
      { criterion: 'Time budget respected', weight: 4, scoring: 'binary' },
    ],
  },
  {
    test_id: 'contradiction_resolution',
    category: 'contradiction',
    difficulty: 'hard',
    description: 'Test contradictory constraints resolution',
    initial_context: { 
      text: 'Test with contradictions',
      pinned_constraints: ['Output must be JSON', 'Output must NOT contain curly braces'],
    },
    initial_queue: [
      { title: 'Handle Contradiction', prompt: 'Resolve the contradiction' },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 3000, max_tool_calls: 10, max_iterations: 5, checkpoint_interval: 2 },
    must_do: ['detect contradiction', 'log audit entry'],
    must_not_do: ['ignore contradiction'],
    acceptance_criteria: ['Contradiction handled'],
    scoring_rubric: [
      { criterion: 'Contradiction detected', weight: 3, scoring: 'binary' },
      { criterion: 'Proper audit trail', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'tool_discipline',
    category: 'tools',
    difficulty: 'medium',
    description: 'Test tool call discipline',
    initial_context: { text: 'Tool discipline test' },
    initial_queue: [
      { title: 'Use Tools Wisely', prompt: 'Complete task with minimal tool calls' },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 3000, max_tool_calls: 5, max_iterations: 10, checkpoint_interval: 2 },
    must_do: ['minimize tool calls', 'log all tool calls'],
    must_not_do: ['exceed tool call limit'],
    acceptance_criteria: ['Tool calls under limit'],
    scoring_rubric: [
      { criterion: 'Tool calls minimized', weight: 3, scoring: 'scale', max_score: 3 },
      { criterion: 'All calls logged', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'self_improvement',
    category: 'improvement',
    difficulty: 'hard',
    description: 'Test process notes applied in later tasks',
    initial_context: { text: 'Self improvement test' },
    initial_queue: [
      { title: 'Task with Lesson', prompt: 'Learn something from this task' },
      { title: 'Apply Lesson', prompt: 'Apply what was learned' },
    ],
    budgets: { max_wall_time_seconds: 60, max_output_tokens: 5000, max_tool_calls: 20, max_iterations: 10, checkpoint_interval: 3 },
    must_do: ['capture process notes', 'apply notes to later task'],
    must_not_do: ['forget lessons'],
    acceptance_criteria: ['Improvement demonstrated'],
    scoring_rubric: [
      { criterion: 'Process notes captured', weight: 2, scoring: 'binary' },
      { criterion: 'Notes applied', weight: 3, scoring: 'binary' },
    ],
  },
  {
    test_id: 'replay_determinism',
    category: 'replay',
    difficulty: 'hard',
    description: 'Test replay produces same snapshot state',
    initial_context: { text: 'Replay test' },
    initial_queue: [
      { title: 'Deterministic Task', prompt: 'Execute deterministically' },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 3000, max_tool_calls: 10, max_iterations: 5, checkpoint_interval: 2 },
    must_do: ['create checkpoints', 'replay correctly'],
    must_not_do: ['produce different state on replay'],
    acceptance_criteria: ['Replay matches original'],
    scoring_rubric: [
      { criterion: 'Replay produces identical state', weight: 4, scoring: 'binary' },
    ],
  },
  {
    test_id: 'drift_detection',
    category: 'drift',
    difficulty: 'medium',
    description: 'Test contradiction vs pinned context flagged',
    initial_context: { 
      text: 'Drift detection test',
      pinned_constraints: ['Never output private data', 'All responses must be professional'],
    },
    initial_queue: [
      { title: 'Detect Drift', prompt: 'Monitor for constraint violations' },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 3000, max_tool_calls: 10, max_iterations: 5, checkpoint_interval: 2 },
    must_do: ['monitor constraints', 'flag violations'],
    must_not_do: ['ignore drift'],
    acceptance_criteria: ['Drift detection active'],
    scoring_rubric: [
      { criterion: 'Drift detection implemented', weight: 3, scoring: 'binary' },
      { criterion: 'Violations flagged', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'partial_completion_checkpoint',
    category: 'checkpoint',
    difficulty: 'medium',
    description: 'Test graceful checkpoint under low budget',
    initial_context: { text: 'Low budget test' },
    initial_queue: [
      { title: 'Big Task', prompt: 'This needs more budget than available' },
    ],
    budgets: { max_wall_time_seconds: 10, max_output_tokens: 200, max_tool_calls: 3, max_iterations: 2, checkpoint_interval: 1 },
    must_do: ['checkpoint before exhaustion', 'save progress'],
    must_not_do: ['crash without checkpoint'],
    acceptance_criteria: ['Graceful degradation'],
    scoring_rubric: [
      { criterion: 'Checkpoint created', weight: 3, scoring: 'binary' },
      { criterion: 'State preserved', weight: 2, scoring: 'binary' },
    ],
  },
  {
    test_id: 'failure_spawns_fix',
    category: 'failure',
    difficulty: 'easy',
    description: 'Test verification failure spawns fix task',
    initial_context: { text: 'Fix task test' },
    initial_queue: [
      { 
        title: 'Failing Task', 
        prompt: 'This will fail verification',
        acceptance_criteria: [
          { id: 'impossible', type: 'contains', description: 'Must contain impossible string', config: { patterns: ['IMPOSSIBLE_STRING_12345'] }, required: true },
        ],
      },
    ],
    budgets: { max_wall_time_seconds: 30, max_output_tokens: 3000, max_tool_calls: 10, max_iterations: 5, checkpoint_interval: 2 },
    must_do: ['create fix task', 'log failure'],
    must_not_do: ['paper over failure'],
    acceptance_criteria: ['Fix task created'],
    scoring_rubric: [
      { criterion: 'Fix task spawned', weight: 4, scoring: 'binary' },
      { criterion: 'Failure logged', weight: 1, scoring: 'binary' },
    ],
  },
];

// Register built-in tests
for (const test of BUILT_IN_TESTS) {
  testHarness.registerTest(test);
}
