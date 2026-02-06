// ============================================
// React Hook for Test Result Store
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { testResultStore, TestRunRecord, TestSuiteRun } from '@/lib/test-result-store';
import type { TestResult, TestSpec, Event, BudgetState } from '@/types/orchestration';

export function useTestResults() {
  const [records, setRecords] = useState<TestRunRecord[]>([]);
  const [suiteRuns, setSuiteRuns] = useState<TestSuiteRun[]>([]);
  const [stats, setStats] = useState(testResultStore.getStats());

  const refresh = useCallback(() => {
    setRecords(testResultStore.getAllRecords());
    setSuiteRuns(testResultStore.getAllSuiteRuns());
    setStats(testResultStore.getStats());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const saveRecord = useCallback((
    result: TestResult,
    spec: TestSpec,
    events: Event[],
    budgetState: BudgetState,
    options?: { suite_id?: string; tags?: string[] }
  ) => {
    const record = testResultStore.saveRecord(result, spec, events, budgetState, options);
    refresh();
    return record;
  }, [refresh]);

  const addNote = useCallback((recordId: string, content: string, author: 'ai' | 'user', type?: 'observation' | 'root_cause' | 'recommendation' | 'flag') => {
    const note = testResultStore.addNote(recordId, content, author, type);
    refresh();
    return note;
  }, [refresh]);

  const saveSuiteRun = useCallback((name: string, records: TestRunRecord[], specs: TestSpec[], tags?: string[]) => {
    const run = testResultStore.saveSuiteRun(name, records, specs, tags);
    refresh();
    return run;
  }, [refresh]);

  const generateReport = useCallback((suiteRunId?: string) => {
    return testResultStore.generateAuditReport(suiteRunId);
  }, []);

  const exportAll = useCallback(() => {
    return testResultStore.exportAll();
  }, []);

  return {
    records,
    suiteRuns,
    stats,
    refresh,
    saveRecord,
    addNote,
    saveSuiteRun,
    generateReport,
    exportAll,
    getRecordsByTestId: (testId: string) => testResultStore.getRecordsByTestId(testId),
  };
}
