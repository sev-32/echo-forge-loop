import { useState, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconHistory, IconActivity } from "@/components/icons";

const API = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

// ─── Types ──────────────────────────────────────────
interface Run {
    id: string;
    type: string;
    timestamp: string;
    prompt: string;
    result_summary: string;
    commit_hash: string;
    outcome: string;
    score: number;
    tokens_used: number;
    duration_ms: number;
    files_count: number;
    model_used: string;
    user_feedback: string;
}

interface RunStats {
    total_runs: number;
    by_type: Record<string, number>;
    by_outcome: Record<string, number>;
    avg_score: number;
    total_tokens: number;
    recent_trend: number[];
    success_rate: number;
}

const OUTCOME_CLASSES: Record<string, string> = {
    success: 'text-status-success',
    partial: 'text-status-warning',
    failure: 'text-status-error',
    pending: 'text-label-engraved',
};

const TYPE_LABELS: Record<string, string> = {
    codegen: 'CODEGEN',
    debug: 'DEBUG',
    apply: 'APPLY',
};

export function RunHistoryDrawer() {
    const [runs, setRuns] = useState<Run[]>([]);
    const [stats, setStats] = useState<RunStats | null>(null);
    const [filter, setFilter] = useState<string>('');
    const [selectedRun, setSelectedRun] = useState<Run | null>(null);
    const [view, setView] = useState<'list' | 'stats'>('list');

    const fetchRuns = useCallback(async () => {
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (filter) params.set('type', filter);
            const resp = await fetch(`${API}/ide/runs?${params}`);
            const data = await resp.json();
            setRuns(data.runs || []);
        } catch { /* ignore */ }
    }, [filter]);

    const fetchStats = useCallback(async () => {
        try {
            const resp = await fetch(`${API}/ide/runs/stats`);
            setStats(await resp.json());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchRuns(); fetchStats(); }, [fetchRuns, fetchStats]);

    const scoreRun = async (runId: string, outcome: string) => {
        try {
            await fetch(`${API}/ide/runs/${runId}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outcome }),
            });
            fetchRuns();
            fetchStats();
        } catch { /* ignore */ }
    };

    const fmt = (ts: string) => {
        try {
            const d = new Date(ts);
            const now = new Date();
            const diff = now.getTime() - d.getTime();
            if (diff < 60000) return 'just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
            return d.toLocaleDateString();
        } catch { return ts; }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header — matches LiveFeedDrawer pattern */}
            <div className="panel-header border-b border-border">
                <div className="flex items-center gap-2">
                    <IconHistory size={14} className="text-primary" />
                    <span className="text-engraved">RUN HISTORY</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setView(view === 'list' ? 'stats' : 'list')}
                        className="surface-raised text-[8px] font-mono px-1.5 py-0.5 rounded text-label-secondary"
                    >
                        {view === 'list' ? 'STATS' : 'LIST'}
                    </button>
                    <button onClick={() => { fetchRuns(); fetchStats(); }}
                        className="text-[10px] text-label-engraved hover:text-label-secondary">↻</button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex gap-1 px-3 py-1.5 border-b border-border">
                {['', 'codegen', 'debug', 'apply'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-semibold uppercase tracking-wider transition-all ${filter === f ? 'surface-raised text-primary' : 'text-label-engraved hover:text-label-secondary'
                            }`}
                    >
                        {f ? TYPE_LABELS[f] || f : 'ALL'}
                    </button>
                ))}
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                {view === 'stats' && stats ? (
                    <StatsView stats={stats} />
                ) : view === 'list' ? (
                    runs.length === 0 ? (
                        <div className="text-center py-8">
                            <IconActivity size={20} className="text-label-engraved mx-auto mb-2" />
                            <span className="text-engraved">NO RUNS RECORDED</span>
                            <p className="text-[9px] text-label-engraved mt-1">Use AI Code Gen or Debug to start tracking</p>
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {runs.map(run => (
                                <div
                                    key={run.id}
                                    className="surface-well rounded px-2 py-1.5 cursor-pointer group hover:amber-glow transition-all"
                                    onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                                >
                                    {/* Header */}
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[8px] font-mono font-semibold uppercase tracking-wider ${OUTCOME_CLASSES[run.type] || 'text-label-muted'}`}>
                                            {run.type}
                                        </span>
                                        <span className="text-[9px] font-mono text-label-secondary flex-1 truncate">
                                            {run.prompt?.slice(0, 50) || 'Untitled'}
                                        </span>
                                        <span className={`text-[8px] font-mono font-semibold uppercase tracking-wider ${OUTCOME_CLASSES[run.outcome] || 'text-label-engraved'}`}>
                                            {run.outcome}
                                        </span>
                                    </div>

                                    {/* Meta */}
                                    <div className="flex items-center gap-3 mt-0.5 text-[8px] text-label-engraved font-mono">
                                        <span>{fmt(run.timestamp)}</span>
                                        <span>{run.tokens_used}t</span>
                                        <span>{run.duration_ms}ms</span>
                                        {run.files_count > 0 && <span>{run.files_count} files</span>}
                                        {run.commit_hash && <span>#{run.commit_hash.slice(0, 7)}</span>}
                                    </div>

                                    {/* Expanded */}
                                    {selectedRun?.id === run.id && (
                                        <div className="mt-2 pt-2 space-y-2 border-t border-border">
                                            {/* Score bar */}
                                            <div className="flex items-center gap-2">
                                                <div className="h-1 flex-1 rounded-full bg-secondary overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all ${run.outcome === 'success' ? 'bg-status-success' :
                                                        run.outcome === 'partial' ? 'bg-status-warning' : 'bg-status-error'
                                                        }`}
                                                        style={{ width: `${(run.score || 0) * 100}%` }} />
                                                </div>
                                                <span className={`text-[8px] font-mono font-semibold ${OUTCOME_CLASSES[run.outcome]}`}>
                                                    {Math.round((run.score || 0) * 100)}%
                                                </span>
                                            </div>

                                            {/* Score buttons for pending runs */}
                                            {run.outcome === 'pending' && (
                                                <div className="flex gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); scoreRun(run.id, 'success'); }}
                                                        className="flex-1 py-0.5 rounded text-[8px] font-mono font-semibold surface-raised text-status-success">
                                                        ✓ Success
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); scoreRun(run.id, 'partial'); }}
                                                        className="flex-1 py-0.5 rounded text-[8px] font-mono font-semibold surface-raised text-status-warning">
                                                        ~ Partial
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); scoreRun(run.id, 'failure'); }}
                                                        className="flex-1 py-0.5 rounded text-[8px] font-mono font-semibold surface-raised text-status-error">
                                                        ✕ Failure
                                                    </button>
                                                </div>
                                            )}

                                            {run.user_feedback && (
                                                <p className="text-[9px] text-label-secondary font-mono surface-well rounded p-1.5">
                                                    {run.user_feedback}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                ) : null}
            </ScrollArea>
        </div>
    );
}


// ─── Stats View (matches LiveFeedDrawer gauge cluster pattern) ───

function StatsView({ stats }: { stats: RunStats }) {
    const maxTrend = Math.max(...(stats.recent_trend || [1]));

    return (
        <div className="p-3 space-y-3">
            {/* Summary — Like GaugeCell cluster */}
            <div className="grid grid-cols-2 gap-2">
                <StatCard label="TOTAL RUNS" value={stats.total_runs} />
                <StatCard label="SUCCESS RATE" value={`${stats.success_rate}%`} colorClass="text-status-success" />
                <StatCard label="AVG SCORE" value={`${Math.round(stats.avg_score * 100)}%`} colorClass="text-primary" />
                <StatCard label="TOKENS USED" value={stats.total_tokens.toLocaleString()} />
            </div>

            {/* Outcomes */}
            <div>
                <div className="text-engraved text-[10px] mb-1.5">OUTCOMES</div>
                <div className="space-y-1">
                    {Object.entries(stats.by_outcome || {}).map(([outcome, count]) => (
                        <div key={outcome} className="flex items-center gap-2">
                            <span className={`text-[8px] font-mono font-semibold uppercase tracking-wider w-14 ${OUTCOME_CLASSES[outcome]}`}>
                                {outcome}
                            </span>
                            <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                                <div className={`h-full rounded-full ${outcome === 'success' ? 'bg-status-success' :
                                    outcome === 'partial' ? 'bg-status-warning' : 'bg-status-error'
                                    }`}
                                    style={{ width: `${(count / Math.max(stats.total_runs, 1)) * 100}%` }} />
                            </div>
                            <span className="text-[8px] font-mono text-label-engraved w-6 text-right">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Trend */}
            {stats.recent_trend.length > 0 && (
                <div>
                    <div className="text-engraved text-[10px] mb-1.5">RECENT TREND</div>
                    <div className="surface-well rounded p-2">
                        <div className="flex items-end gap-px h-10">
                            {stats.recent_trend.map((score, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 rounded-t transition-all ${score >= 0.7 ? 'bg-status-success' : score >= 0.4 ? 'bg-status-warning' : 'bg-status-error'
                                        }`}
                                    style={{
                                        height: `${Math.max(10, (score / Math.max(maxTrend, 0.01)) * 100)}%`,
                                        opacity: 0.7 + (i / stats.recent_trend.length) * 0.3,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, colorClass }: { label: string; value: string | number; colorClass?: string }) {
    return (
        <div className="surface-well rounded p-2 text-center">
            <div className={`text-lg font-bold font-mono ${colorClass || 'text-label-primary'}`}>{value}</div>
            <div className="text-engraved">{label}</div>
        </div>
    );
}
