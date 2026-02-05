import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Panel, Icons } from '@/components/ui/status-indicators';
import { useTestHarness } from '@/hooks/use-orchestration';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import type { TestSpec, TestResult } from '@/types/orchestration';

export function TestHarnessPanel() {
  const { specs, results, running, currentTest, runTest, runAllTests, generateReport } = useTestHarness();
  const [selectedSpec, setSelectedSpec] = useState<TestSpec | null>(null);
  const [showReport, setShowReport] = useState(false);

  const passedCount = results.filter(r => r.passed).length;
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = results.reduce((sum, r) => sum + r.max_score, 0);

  return (
    <Panel 
      title="Test Harness" 
      icon={<Icons.CheckCircle2 className="w-4 h-4" />}
      className="h-full flex flex-col"
      actions={
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => setShowReport(!showReport)}
            disabled={results.length === 0}
          >
            <Icons.FileText className="w-3 h-3 mr-1" />
            Report
          </Button>
          <Button 
            size="sm" 
            onClick={runAllTests}
            disabled={running}
          >
            {running ? (
              <><Icons.Activity className="w-3 h-3 mr-1 animate-spin" /> Running...</>
            ) : (
              <><Icons.Play className="w-3 h-3 mr-1" /> Run All</>
            )}
          </Button>
        </div>
      }
    >
      {showReport ? (
        <ReportView report={generateReport()} onClose={() => setShowReport(false)} />
      ) : (
        <div className="flex flex-col h-full gap-4">
          {/* Summary */}
          {results.length > 0 && (
            <div className="flex items-center gap-4 p-3 bg-surface-1 rounded-lg">
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {passedCount}/{results.length} Tests Passed
                </div>
                <Progress 
                  value={(passedCount / results.length) * 100} 
                  className="h-2 mt-2"
                />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold font-mono">
                  {totalScore}/{maxScore}
                </div>
                <div className="text-xs text-muted-foreground">Total Score</div>
              </div>
            </div>
          )}

          {/* Test List */}
          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {specs.map((spec) => {
                const result = results.find(r => r.test_id === spec.test_id);
                return (
                  <TestRow
                    key={spec.test_id}
                    spec={spec}
                    result={result}
                    isRunning={currentTest === spec.test_id}
                    isSelected={selectedSpec?.test_id === spec.test_id}
                    onClick={() => setSelectedSpec(spec)}
                    onRun={() => runTest(spec.test_id)}
                  />
                );
              })}
            </div>
          </ScrollArea>

          {/* Test Details */}
          {selectedSpec && (
            <div className="border-t border-border pt-4">
              <TestDetails 
                spec={selectedSpec} 
                result={results.find(r => r.test_id === selectedSpec.test_id)}
                onClose={() => setSelectedSpec(null)}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

interface TestRowProps {
  spec: TestSpec;
  result?: TestResult;
  isRunning: boolean;
  isSelected: boolean;
  onClick: () => void;
  onRun: () => void;
}

function TestRow({ spec, result, isRunning, isSelected, onClick, onRun }: TestRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
        isSelected 
          ? 'bg-surface-2 border-primary' 
          : 'bg-surface-1 border-border hover:bg-surface-2'
      )}
      onClick={onClick}
    >
      <div className="flex-shrink-0">
        {isRunning ? (
          <Icons.Activity className="w-5 h-5 text-status-active animate-spin" />
        ) : result ? (
          result.passed ? (
            <Icons.CheckCircle2 className="w-5 h-5 text-status-success" />
          ) : (
            <Icons.XCircle className="w-5 h-5 text-status-error" />
          )
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{spec.test_id}</span>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded',
            spec.difficulty === 'easy' && 'bg-status-success/20 text-status-success',
            spec.difficulty === 'medium' && 'bg-status-warning/20 text-status-warning',
            spec.difficulty === 'hard' && 'bg-status-error/20 text-status-error',
          )}>
            {spec.difficulty}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{spec.description}</p>
      </div>

      {result && (
        <div className="text-right">
          <div className="text-sm font-mono">{result.score}/{result.max_score}</div>
          <div className="text-xs text-muted-foreground">{result.duration_ms}ms</div>
        </div>
      )}

      <Button 
        size="sm" 
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); onRun(); }}
        disabled={isRunning}
      >
        <Icons.Play className="w-3 h-3" />
      </Button>
    </div>
  );
}

interface TestDetailsProps {
  spec: TestSpec;
  result?: TestResult;
  onClose: () => void;
}

function TestDetails({ spec, result, onClose }: TestDetailsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <h4 className="font-semibold text-sm">{spec.test_id}</h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.XCircle className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-muted-foreground">{spec.description}</p>

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-muted-foreground">Category</span>
          <p className="font-mono">{spec.category}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Difficulty</span>
          <p className="font-mono capitalize">{spec.difficulty}</p>
        </div>
      </div>

      <div>
        <span className="text-xs text-muted-foreground">Must Do</span>
        <ul className="mt-1 space-y-0.5">
          {spec.must_do.map((item, i) => (
            <li key={i} className="text-xs flex items-start gap-1">
              <span className="text-status-success">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <span className="text-xs text-muted-foreground">Must Not Do</span>
        <ul className="mt-1 space-y-0.5">
          {spec.must_not_do.map((item, i) => (
            <li key={i} className="text-xs flex items-start gap-1">
              <span className="text-status-error">✗</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {result && (
        <div className="pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">Score Breakdown</span>
          <div className="mt-1 space-y-1">
            {result.breakdown.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className={item.score === item.max_score ? 'text-status-success' : 'text-status-error'}>
                  {item.score === item.max_score ? '✓' : '✗'} {item.criterion}
                </span>
                <span className="font-mono">{item.score}/{item.max_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ReportViewProps {
  report: string;
  onClose: () => void;
}

function ReportView({ report, onClose }: ReportViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold">Test Report</h4>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <Icons.XCircle className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <pre className="text-xs font-mono whitespace-pre-wrap">{report}</pre>
      </ScrollArea>
    </div>
  );
}
