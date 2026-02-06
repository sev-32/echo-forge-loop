import { useState } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Panel, Icons } from '@/components/ui/status-indicators';
import { useTestResults } from '@/hooks/use-test-results';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TestRunRecord, TestSuiteRun } from '@/lib/test-result-store';

export function TestAuditPanel() {
  const { records, suiteRuns, stats, generateReport, exportAll, addNote } = useTestResults();
  const [selectedRecord, setSelectedRecord] = useState<TestRunRecord | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportContent, setReportContent] = useState('');

  const handleExport = () => {
    const data = exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateReport = () => {
    const report = generateReport();
    setReportContent(report);
    setShowReport(true);
  };

  return (
    <Panel
      title="Test Audit Trail"
      icon={<Icons.FileText className="w-4 h-4" />}
      className="h-full flex flex-col"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">
            {stats.total_records} runs • {stats.overall_pass_rate.toFixed(0)}% pass
          </span>
          <Button size="sm" variant="outline" onClick={handleGenerateReport}>
            <Icons.FileText className="w-3 h-3 mr-1" /> Report
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Icons.Database className="w-3 h-3 mr-1" /> Export
          </Button>
        </div>
      }
    >
      {showReport ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">Audit Report</h4>
            <Button size="sm" variant="ghost" onClick={() => setShowReport(false)}>
              <Icons.XCircle className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <pre className="text-xs font-mono whitespace-pre-wrap">{reportContent}</pre>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex gap-3 h-full">
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Stats Bar */}
            <div className="flex items-center gap-4 p-2 bg-surface-1 rounded text-xs font-mono">
              <span className="text-status-success">{stats.overall_pass_rate.toFixed(0)}% pass</span>
              <span>{stats.total_records} total</span>
              <span>{stats.unique_tests} unique</span>
              {stats.regressions > 0 && (
                <span className="text-status-error">{stats.regressions} regressions</span>
              )}
            </div>

            {/* Suite Runs */}
            {suiteRuns.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-xs font-semibold text-muted-foreground">Suite Runs</h5>
                {suiteRuns.slice(0, 3).map(suite => (
                  <SuiteRunCard key={suite.id} suite={suite} />
                ))}
              </div>
            )}

            {/* Individual Records */}
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {records.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No test records. Run tests to build audit trail.</p>
                ) : (
                  records.map(record => (
                    <RecordRow
                      key={record.id}
                      record={record}
                      isSelected={selectedRecord?.id === record.id}
                      onClick={() => setSelectedRecord(record)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {selectedRecord && (
            <div className="w-80 border-l border-border pl-3 min-h-0">
              <RecordDetail
                record={selectedRecord}
                onClose={() => setSelectedRecord(null)}
                onAddNote={(content, type) => addNote(selectedRecord.id, content, 'user', type)}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function SuiteRunCard({ suite }: { suite: TestSuiteRun }) {
  return (
    <div className="p-2 bg-surface-1 rounded border border-border text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{suite.suite_name}</span>
        <span className="text-muted-foreground">{formatRelativeTime(suite.completed_at)}</span>
      </div>
      <div className="flex items-center gap-3 mt-1 font-mono">
        <span className="text-status-success">{suite.summary.passed} pass</span>
        <span className="text-status-error">{suite.summary.failed} fail</span>
        <span>{suite.summary.score}/{suite.summary.max_score}</span>
        <span className="text-muted-foreground">{suite.summary.pass_rate.toFixed(0)}%</span>
      </div>
      {suite.summary.trends && (
        <div className="mt-1 text-muted-foreground">
          {suite.summary.trends.improving ? '📈 Improving' : '📉 Declining'} 
          {' '}(avg Δ: {suite.summary.trends.avg_score_change > 0 ? '+' : ''}{suite.summary.trends.avg_score_change.toFixed(1)})
        </div>
      )}
    </div>
  );
}

function RecordRow({ record, isSelected, onClick }: { record: TestRunRecord; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-3',
        isSelected ? 'bg-surface-2' : 'hover:bg-surface-1'
      )}
    >
      <span className="flex-shrink-0">
        {record.result.passed
          ? <Icons.CheckCircle2 className="w-4 h-4 text-status-success" />
          : <Icons.XCircle className="w-4 h-4 text-status-error" />
        }
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{record.test_id}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{record.result.score}/{record.result.max_score}</span>
          <span>{record.result.duration_ms}ms</span>
          {record.comparison && record.comparison.score_delta !== 0 && (
            <span className={record.comparison.score_delta > 0 ? 'text-status-success' : 'text-status-error'}>
              {record.comparison.score_delta > 0 ? '↑' : '↓'}{Math.abs(record.comparison.score_delta)}
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{formatRelativeTime(record.completed_at)}</span>
    </button>
  );
}

function RecordDetail({ record, onClose, onAddNote }: {
  record: TestRunRecord;
  onClose: () => void;
  onAddNote: (content: string, type: 'observation' | 'root_cause' | 'recommendation' | 'flag') => void;
}) {
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'observation' | 'root_cause' | 'recommendation' | 'flag'>('observation');

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <h4 className="font-semibold text-sm">{record.test_id}</h4>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Icons.XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Status</span><p className={record.result.passed ? 'text-status-success' : 'text-status-error'}>{record.result.passed ? 'PASS' : 'FAIL'}</p></div>
          <div><span className="text-muted-foreground">Score</span><p className="font-mono">{record.result.score}/{record.result.max_score}</p></div>
          <div><span className="text-muted-foreground">Duration</span><p className="font-mono">{record.result.duration_ms}ms</p></div>
          <div><span className="text-muted-foreground">Events</span><p className="font-mono">{record.result.events_count}</p></div>
        </div>

        {record.comparison && (
          <div className="p-2 bg-surface-1 rounded border border-border text-xs">
            <h5 className="font-semibold mb-1">vs Previous Run</h5>
            <div className={cn('font-mono', record.comparison.score_delta >= 0 ? 'text-status-success' : 'text-status-error')}>
              Score: {record.comparison.score_delta > 0 ? '+' : ''}{record.comparison.score_delta}
            </div>
            {record.comparison.new_passes.length > 0 && (
              <div className="text-status-success mt-1">+ {record.comparison.new_passes.join(', ')}</div>
            )}
            {record.comparison.new_failures.length > 0 && (
              <div className="text-status-error mt-1">- {record.comparison.new_failures.join(', ')}</div>
            )}
            {record.comparison.regression && (
              <div className="text-status-error font-semibold mt-1">⚠️ REGRESSION</div>
            )}
          </div>
        )}

        <div>
          <h5 className="text-xs font-semibold text-muted-foreground mb-1">Score Breakdown</h5>
          <div className="space-y-1">
            {record.result.breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className={b.score === b.max_score ? 'text-status-success' : 'text-status-error'}>
                  {b.score === b.max_score ? '✓' : '✗'} {b.criterion}
                </span>
                <span className="font-mono">{b.score}/{b.max_score}</span>
              </div>
            ))}
          </div>
        </div>

        {record.result.errors.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-status-error mb-1">Errors</h5>
            {record.result.errors.map((err, i) => (
              <p key={i} className="text-xs text-status-error">{err}</p>
            ))}
          </div>
        )}

        {/* Notes */}
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground mb-1">Notes ({record.notes.length})</h5>
          {record.notes.map(note => (
            <div key={note.id} className="p-2 bg-surface-1 rounded text-xs mb-1">
              <div className="flex items-center gap-2 text-muted-foreground mb-0.5">
                <span className="capitalize">{note.type}</span>
                <span>•</span>
                <span>{note.author}</span>
                <span>•</span>
                <span>{formatRelativeTime(note.timestamp)}</span>
              </div>
              <p>{note.content}</p>
            </div>
          ))}

          <div className="mt-2 space-y-1">
            <div className="flex gap-1">
              <select value={noteType} onChange={e => setNoteType(e.target.value as typeof noteType)} className="bg-surface-1 border border-border rounded px-1 text-xs text-foreground">
                <option value="observation">Observation</option>
                <option value="root_cause">Root Cause</option>
                <option value="recommendation">Recommendation</option>
                <option value="flag">Flag</option>
              </select>
            </div>
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => { onAddNote(noteText, noteType); setNoteText(''); }}
              disabled={!noteText}
              className="w-full"
            >
              Add Note
            </Button>
          </div>
        </div>

        {/* Spec Snapshot */}
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground mb-1">Spec Snapshot</h5>
          <pre className="text-xs font-mono p-2 bg-code-bg rounded overflow-auto max-h-32 text-code-fg">
            {JSON.stringify(record.spec_snapshot, null, 2)}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );
}
