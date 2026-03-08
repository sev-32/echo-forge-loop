import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, Activity } from 'lucide-react';
import * as persistence from '@/lib/persistence';

interface TestRunData {
  id: string;
  test_id: string;
  score: number | null;
  max_score: number | null;
  status: string;
  duration_ms: number | null;
  created_at: string;
  errors: string[];
  score_breakdown: Record<string, unknown>;
}

interface TrendPoint {
  time: string;
  score: number;
  maxScore: number;
  pct: number;
  duration: number;
  errors: number;
  testId: string;
  runId: string;
}

function computeDelta(current: number, previous: number): { value: number; direction: 'up' | 'down' | 'flat' } {
  const d = current - previous;
  return { value: Math.abs(d), direction: d > 1 ? 'up' : d < -1 ? 'down' : 'flat' };
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const { value, direction } = computeDelta(current, previous);
  if (direction === 'flat') return <Badge variant="outline" className="text-[10px] gap-0.5"><Minus className="h-2.5 w-2.5" /> 0</Badge>;
  const isUp = direction === 'up';
  return (
    <Badge variant={isUp ? 'default' : 'destructive'} className="text-[10px] gap-0.5">
      {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {isUp ? '+' : '-'}{value.toFixed(1)}
    </Badge>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded p-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong></p>
      ))}
    </div>
  );
};

export function RegressionDashboard() {
  const [runs, setRuns] = useState<TestRunData[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await persistence.fetchTestRuns({ limit: 200 });
      setRuns(data as TestRunData[]);

      const points: TrendPoint[] = (data as TestRunData[])
        .filter(r => r.score !== null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(r => ({
          time: new Date(r.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          score: r.score || 0,
          maxScore: r.max_score || 100,
          pct: r.max_score ? ((r.score || 0) / r.max_score) * 100 : r.score || 0,
          duration: r.duration_ms || 0,
          errors: r.errors?.length || 0,
          testId: r.test_id,
          runId: r.id,
        }));
      setTrendData(points);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const uniqueTests = [...new Set(runs.map(r => r.test_id))];
  const filtered = selectedTestId ? trendData.filter(t => t.testId === selectedTestId) : trendData;

  // Compute summary stats
  const latestScores = uniqueTests.map(tid => {
    const testRuns = runs.filter(r => r.test_id === tid && r.score !== null).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = testRuns[0];
    const prev = testRuns[1];
    return { testId: tid, latest, prev };
  });

  const avgScore = filtered.length > 0 ? filtered.reduce((s, p) => s + p.pct, 0) / filtered.length : 0;
  const regressions = latestScores.filter(s => s.latest && s.prev && (s.latest.score || 0) < (s.prev.score || 0)).length;
  const improvements = latestScores.filter(s => s.latest && s.prev && (s.latest.score || 0) > (s.prev.score || 0)).length;

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-bold">Regression Dashboard</h2>
        <Button size="sm" variant="ghost" onClick={loadData} disabled={loading} className="h-7 gap-1 ml-auto">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-surface-2 border-border">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Total Runs</p>
            <p className="text-2xl font-bold">{runs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-2 border-border">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase">Avg Score</p>
            <p className="text-2xl font-bold">{avgScore.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-2 border-border">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase text-status-error">Regressions</p>
            <p className="text-2xl font-bold text-destructive">{regressions}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-2 border-border">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase text-status-success">Improvements</p>
            <p className="text-2xl font-bold text-primary">{improvements}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter by Test */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={!selectedTestId ? 'default' : 'outline'} className="cursor-pointer text-[10px]" onClick={() => setSelectedTestId(null)}>All Tests</Badge>
        {uniqueTests.slice(0, 10).map(tid => (
          <Badge key={tid} variant={selectedTestId === tid ? 'default' : 'outline'} className="cursor-pointer text-[10px] font-mono" onClick={() => setSelectedTestId(tid)}>
            {tid.slice(0, 12)}
          </Badge>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Score Trajectory */}
        <Card className="bg-surface-2 border-border">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-primary" /> Score Trajectory</CardTitle>
          </CardHeader>
          <CardContent className="p-2 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filtered}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 76%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 76%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(215, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215, 15%, 55%)' }} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="pct" stroke="hsl(142, 76%, 45%)" fill="url(#scoreGrad)" name="Score %" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Duration Trend */}
        <Card className="bg-surface-2 border-border">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-accent" /> Duration & Errors</CardTitle>
          </CardHeader>
          <CardContent className="p-2 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filtered}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(215, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215, 15%, 55%)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="duration" fill="hsl(190, 80%, 45%)" name="Duration (ms)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="errors" fill="hsl(0, 72%, 55%)" name="Errors" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Per-test Delta Table */}
      <Card className="bg-surface-2 border-border">
        <CardHeader className="pb-1 pt-3 px-3">
          <CardTitle className="text-xs">Test Run Deltas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[180px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-3 py-1.5">Test ID</th>
                  <th className="text-right px-3 py-1.5">Latest Score</th>
                  <th className="text-right px-3 py-1.5">Previous</th>
                  <th className="text-right px-3 py-1.5">Delta</th>
                  <th className="text-right px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {latestScores.map(s => (
                  <tr key={s.testId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono">{s.testId.slice(0, 16)}</td>
                    <td className="text-right px-3 py-1.5">{s.latest?.score ?? '—'}</td>
                    <td className="text-right px-3 py-1.5 text-muted-foreground">{s.prev?.score ?? '—'}</td>
                    <td className="text-right px-3 py-1.5">
                      {s.latest && s.prev ? <DeltaBadge current={s.latest.score || 0} previous={s.prev.score || 0} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right px-3 py-1.5">
                      <Badge variant={s.latest?.status === 'passed' ? 'default' : 'secondary'} className="text-[10px]">{s.latest?.status || '—'}</Badge>
                    </td>
                  </tr>
                ))}
                {latestScores.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No test runs yet. Run some tests first.</td></tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
