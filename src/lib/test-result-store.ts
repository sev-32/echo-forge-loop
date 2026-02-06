// ============================================
// Test Result Store - Persistent audit trail for all test runs
// ============================================

import { generateId, formatTimestamp } from '@/lib/utils';
import type { TestResult, TestSpec, Event, BudgetState } from '@/types/orchestration';

export interface TestRunRecord {
  id: string;
  test_id: string;
  suite_id?: string;
  started_at: string;
  completed_at: string;
  result: TestResult;
  spec_snapshot: TestSpec;             // Snapshot of spec at time of run
  events_snapshot: Event[];            // All events from the run
  budget_snapshot: BudgetState;        // Final budget state
  environment: TestEnvironment;
  notes: TestNote[];
  tags: string[];
  comparison?: TestComparison;         // If compared to previous run
}

export interface TestEnvironment {
  timestamp: string;
  user_agent: string;
  viewport?: { width: number; height: number };
  build_id?: string;
}

export interface TestNote {
  id: string;
  timestamp: string;
  author: 'ai' | 'user';
  content: string;
  type: 'observation' | 'root_cause' | 'recommendation' | 'flag';
}

export interface TestComparison {
  previous_run_id: string;
  score_delta: number;
  new_passes: string[];      // criteria that now pass
  new_failures: string[];    // criteria that now fail
  unchanged: string[];
  regression: boolean;
}

export interface TestSuiteRun {
  id: string;
  suite_name: string;
  started_at: string;
  completed_at: string;
  records: string[];          // TestRunRecord IDs
  summary: SuiteSummary;
  tags: string[];
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  score: number;
  max_score: number;
  duration_ms: number;
  pass_rate: number;
  by_category: Record<string, { passed: number; total: number; score: number; max_score: number }>;
  by_difficulty: Record<string, { passed: number; total: number }>;
  trends?: TrendData;
}

export interface TrendData {
  last_5_scores: number[];
  last_5_pass_rates: number[];
  improving: boolean;
  avg_score_change: number;
}

export class TestResultStore {
  private records: Map<string, TestRunRecord> = new Map();
  private suiteRuns: Map<string, TestSuiteRun> = new Map();

  // ---- Record Management ----

  saveRecord(
    testResult: TestResult,
    spec: TestSpec,
    events: Event[],
    budgetState: BudgetState,
    options: { suite_id?: string; tags?: string[] } = {}
  ): TestRunRecord {
    const record: TestRunRecord = {
      id: generateId(),
      test_id: testResult.test_id,
      suite_id: options.suite_id,
      started_at: formatTimestamp(new Date(Date.now() - testResult.duration_ms)),
      completed_at: formatTimestamp(new Date()),
      result: { ...testResult },
      spec_snapshot: { ...spec },
      events_snapshot: [...events],
      budget_snapshot: { ...budgetState },
      environment: {
        timestamp: formatTimestamp(new Date()),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
      notes: [],
      tags: options.tags || [],
    };

    // Compare with previous run of same test
    const previousRuns = this.getRecordsByTestId(testResult.test_id);
    if (previousRuns.length > 0) {
      const lastRun = previousRuns[0];
      record.comparison = this.compareRuns(lastRun, record);
    }

    this.records.set(record.id, record);
    return record;
  }

  addNote(recordId: string, content: string, author: 'ai' | 'user', type: TestNote['type'] = 'observation'): TestNote | null {
    const record = this.records.get(recordId);
    if (!record) return null;

    const note: TestNote = {
      id: generateId(),
      timestamp: formatTimestamp(new Date()),
      author,
      content,
      type,
    };

    record.notes.push(note);
    return note;
  }

  getRecord(id: string): TestRunRecord | undefined {
    return this.records.get(id);
  }

  getAllRecords(): TestRunRecord[] {
    return Array.from(this.records.values()).sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    );
  }

  getRecordsByTestId(testId: string): TestRunRecord[] {
    return this.getAllRecords().filter(r => r.test_id === testId);
  }

  getRecordsBySuiteId(suiteId: string): TestRunRecord[] {
    return this.getAllRecords().filter(r => r.suite_id === suiteId);
  }

  // ---- Suite Runs ----

  saveSuiteRun(
    suiteName: string,
    records: TestRunRecord[],
    specs: TestSpec[],
    tags: string[] = []
  ): TestSuiteRun {
    const recordIds = records.map(r => r.id);
    const summary = this.buildSuiteSummary(records, specs);

    // Add trend data
    const previousSuites = this.getSuiteRunsByName(suiteName);
    if (previousSuites.length > 0) {
      const last5 = previousSuites.slice(0, 5);
      summary.trends = {
        last_5_scores: last5.map(s => s.summary.score),
        last_5_pass_rates: last5.map(s => s.summary.pass_rate),
        improving: last5.length >= 2 && last5[0].summary.score < summary.score,
        avg_score_change: last5.length >= 2
          ? (summary.score - last5[0].summary.score) / last5.length
          : 0,
      };
    }

    const suiteRun: TestSuiteRun = {
      id: generateId(),
      suite_name: suiteName,
      started_at: records.length > 0 ? records[records.length - 1].started_at : formatTimestamp(new Date()),
      completed_at: formatTimestamp(new Date()),
      records: recordIds,
      summary,
      tags,
    };

    this.suiteRuns.set(suiteRun.id, suiteRun);
    return suiteRun;
  }

  getSuiteRun(id: string): TestSuiteRun | undefined {
    return this.suiteRuns.get(id);
  }

  getAllSuiteRuns(): TestSuiteRun[] {
    return Array.from(this.suiteRuns.values()).sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    );
  }

  getSuiteRunsByName(name: string): TestSuiteRun[] {
    return this.getAllSuiteRuns().filter(s => s.suite_name === name);
  }

  // ---- Comparison ----

  private compareRuns(previous: TestRunRecord, current: TestRunRecord): TestComparison {
    const prevCriteria = new Map(previous.result.breakdown.map(b => [b.criterion, b]));
    const currCriteria = new Map(current.result.breakdown.map(b => [b.criterion, b]));

    const newPasses: string[] = [];
    const newFailures: string[] = [];
    const unchanged: string[] = [];

    for (const [criterion, curr] of currCriteria) {
      const prev = prevCriteria.get(criterion);
      if (!prev) {
        if (curr.score === curr.max_score) newPasses.push(criterion);
        else newFailures.push(criterion);
      } else if (prev.score < prev.max_score && curr.score === curr.max_score) {
        newPasses.push(criterion);
      } else if (prev.score === prev.max_score && curr.score < curr.max_score) {
        newFailures.push(criterion);
      } else {
        unchanged.push(criterion);
      }
    }

    return {
      previous_run_id: previous.id,
      score_delta: current.result.score - previous.result.score,
      new_passes: newPasses,
      new_failures: newFailures,
      unchanged,
      regression: newFailures.length > 0,
    };
  }

  // ---- Summary Building ----

  private buildSuiteSummary(records: TestRunRecord[], specs: TestSpec[]): SuiteSummary {
    const total = records.length;
    const passed = records.filter(r => r.result.passed).length;
    const score = records.reduce((sum, r) => sum + r.result.score, 0);
    const maxScore = records.reduce((sum, r) => sum + r.result.max_score, 0);
    const duration = records.reduce((sum, r) => sum + r.result.duration_ms, 0);

    const specMap = new Map(specs.map(s => [s.test_id, s]));

    const byCategory: SuiteSummary['by_category'] = {};
    const byDifficulty: SuiteSummary['by_difficulty'] = {};

    for (const record of records) {
      const spec = specMap.get(record.test_id);
      const cat = spec?.category || 'unknown';
      const diff = spec?.difficulty || 'medium';

      if (!byCategory[cat]) byCategory[cat] = { passed: 0, total: 0, score: 0, max_score: 0 };
      byCategory[cat].total++;
      byCategory[cat].score += record.result.score;
      byCategory[cat].max_score += record.result.max_score;
      if (record.result.passed) byCategory[cat].passed++;

      if (!byDifficulty[diff]) byDifficulty[diff] = { passed: 0, total: 0 };
      byDifficulty[diff].total++;
      if (record.result.passed) byDifficulty[diff].passed++;
    }

    return {
      total,
      passed,
      failed: total - passed,
      score,
      max_score: maxScore,
      duration_ms: duration,
      pass_rate: total > 0 ? (passed / total) * 100 : 0,
      by_category: byCategory,
      by_difficulty: byDifficulty,
    };
  }

  // ---- Reports ----

  generateAuditReport(suiteRunId?: string): string {
    const records = suiteRunId
      ? this.getRecordsBySuiteId(suiteRunId)
      : this.getAllRecords();

    let report = `# Test Audit Report\n`;
    report += `Generated: ${formatTimestamp(new Date())}\n`;
    report += `Total Records: ${records.length}\n\n`;

    const passed = records.filter(r => r.result.passed).length;
    report += `## Summary\n`;
    report += `- **Pass Rate:** ${records.length > 0 ? ((passed / records.length) * 100).toFixed(1) : 0}%\n`;
    report += `- **Total Score:** ${records.reduce((s, r) => s + r.result.score, 0)}/${records.reduce((s, r) => s + r.result.max_score, 0)}\n\n`;

    // Regressions
    const regressions = records.filter(r => r.comparison?.regression);
    if (regressions.length > 0) {
      report += `## ⚠️ Regressions\n`;
      for (const reg of regressions) {
        report += `- **${reg.test_id}**: ${reg.comparison!.new_failures.join(', ')}\n`;
      }
      report += '\n';
    }

    // Per-test detail
    report += `## Test Details\n\n`;
    for (const record of records) {
      report += `### ${record.test_id}\n`;
      report += `- **Status:** ${record.result.passed ? '✅ PASS' : '❌ FAIL'}\n`;
      report += `- **Score:** ${record.result.score}/${record.result.max_score}\n`;
      report += `- **Duration:** ${record.result.duration_ms}ms\n`;
      report += `- **Events:** ${record.result.events_count}\n`;

      if (record.comparison) {
        const c = record.comparison;
        report += `- **Score Delta:** ${c.score_delta > 0 ? '+' : ''}${c.score_delta}\n`;
        if (c.new_passes.length) report += `  - New passes: ${c.new_passes.join(', ')}\n`;
        if (c.new_failures.length) report += `  - New failures: ${c.new_failures.join(', ')}\n`;
      }

      if (record.notes.length > 0) {
        report += `- **Notes:**\n`;
        for (const note of record.notes) {
          report += `  - [${note.type}] ${note.content}\n`;
        }
      }

      report += `\n#### Breakdown\n`;
      for (const b of record.result.breakdown) {
        report += `- ${b.score === b.max_score ? '✓' : '✗'} ${b.criterion}: ${b.score}/${b.max_score} — ${b.notes}\n`;
      }
      report += '\n';
    }

    return report;
  }

  // ---- Persistence ----

  exportAll(): { records: TestRunRecord[]; suiteRuns: TestSuiteRun[] } {
    return {
      records: this.getAllRecords(),
      suiteRuns: this.getAllSuiteRuns(),
    };
  }

  importAll(data: { records: TestRunRecord[]; suiteRuns: TestSuiteRun[] }): void {
    this.records.clear();
    this.suiteRuns.clear();
    for (const r of data.records) this.records.set(r.id, r);
    for (const s of data.suiteRuns) this.suiteRuns.set(s.id, s);
  }

  clear(): void {
    this.records.clear();
    this.suiteRuns.clear();
  }

  getStats(): {
    total_records: number;
    total_suites: number;
    unique_tests: number;
    overall_pass_rate: number;
    regressions: number;
  } {
    const records = this.getAllRecords();
    const passed = records.filter(r => r.result.passed).length;
    const uniqueTests = new Set(records.map(r => r.test_id)).size;
    const regressions = records.filter(r => r.comparison?.regression).length;

    return {
      total_records: records.length,
      total_suites: this.suiteRuns.size,
      unique_tests: uniqueTests,
      overall_pass_rate: records.length > 0 ? (passed / records.length) * 100 : 0,
      regressions,
    };
  }
}

// Singleton
export const testResultStore = new TestResultStore();
