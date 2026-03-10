import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

// ─── Types ──────────────────────────────────────────

type LoopState = 'idle' | 'planning' | 'generating' | 'applying' | 'snapshotting' | 'verifying' | 'debugging' | 'complete' | 'failed' | 'cancelled';

interface LoopEvent {
    type: string;
    timestamp: number;
    data: Record<string, any>;
}

interface IterationSummary {
    iteration: number;
    phase: string;
    passed: boolean;
    errors: number;
    duration_ms: number;
}

const STATE_FLOW: LoopState[] = ['generating', 'applying', 'snapshotting', 'verifying'];

const STATE_META: Record<string, { label: string; color: string }> = {
    idle: { label: 'IDLE', color: 'text-label-muted' },
    planning: { label: 'PLANNING', color: 'text-label-secondary' },
    generating: { label: 'GENERATING', color: 'text-primary' },
    applying: { label: 'APPLYING', color: 'text-status-warning' },
    snapshotting: { label: 'SNAPSHOTTING', color: 'text-label-secondary' },
    verifying: { label: 'VERIFYING', color: 'text-status-info' },
    debugging: { label: 'DEBUGGING', color: 'text-status-error' },
    complete: { label: 'COMPLETE', color: 'text-status-success' },
    failed: { label: 'FAILED', color: 'text-status-error' },
    cancelled: { label: 'CANCELLED', color: 'text-label-muted' },
};

// ─── Component ───────────────────────────────────────

interface AutonomousPanelProps {
    activeFile?: string;
    activeFileContent?: string;
    onFilesChanged?: (paths: string[]) => void;
}

export function AutonomousPanel({ activeFile, activeFileContent, onFilesChanged }: AutonomousPanelProps) {
    const [prompt, setPrompt] = useState('');
    const [state, setState] = useState<LoopState>('idle');
    const [events, setEvents] = useState<LoopEvent[]>([]);
    const [iterations, setIterations] = useState<IterationSummary[]>([]);
    const [currentIteration, setCurrentIteration] = useState(0);
    const [maxRetries, setMaxRetries] = useState(3);
    const [totalTokens, setTotalTokens] = useState(0);
    const [thinking, setThinking] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const eventsEndRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll events
    useEffect(() => {
        eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    // ─── Start Loop ──────────────────────────────────
    const startLoop = useCallback(async () => {
        const text = prompt.trim();
        if (!text) return;

        setState('generating');
        setEvents([]);
        setIterations([]);
        setError(null);
        setThinking('Initializing autonomous loop...');
        setIsRunning(true);
        setTotalTokens(0);
        setCurrentIteration(0);

        const ac = new AbortController();
        abortRef.current = ac;

        try {
            const fileContext: Record<string, string> = {};
            if (activeFile && activeFileContent) {
                fileContext[activeFile] = activeFileContent;
            }

            const resp = await fetch(`${API_BASE}/ide/autonomous/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: text,
                    file_context: fileContext,
                    max_retries: maxRetries,
                }),
                signal: ac.signal,
            });

            if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });

                let nl: number;
                while ((nl = buf.indexOf('\n')) !== -1) {
                    let line = buf.slice(0, nl);
                    buf = buf.slice(nl + 1);
                    if (line.endsWith('\r')) line = line.slice(0, -1);
                    if (!line.startsWith('data: ')) continue;
                    const json = line.slice(6).trim();

                    try {
                        const evt = JSON.parse(json);
                        const loopEvent: LoopEvent = {
                            type: evt.type,
                            timestamp: Date.now(),
                            data: evt,
                        };
                        setEvents(prev => [...prev, loopEvent]);

                        switch (evt.type) {
                            case 'state_change':
                                setState(evt.state as LoopState);
                                setCurrentIteration(evt.iteration || 0);
                                break;
                            case 'codegen_thinking':
                                setThinking(evt.thinking || '');
                                break;
                            case 'codegen_result':
                                setThinking(`Generated ${evt.operation_count} operations`);
                                setTotalTokens(prev => prev + (evt.tokens || 0));
                                break;
                            case 'apply_result':
                                setThinking(`Applied ${evt.success}/${evt.total} files`);
                                break;
                            case 'verify_result':
                                setIterations(prev => [...prev, {
                                    iteration: currentIteration,
                                    phase: evt.passed ? 'pass' : 'fail',
                                    passed: evt.passed,
                                    errors: evt.total_errors || 0,
                                    duration_ms: evt.duration_ms || 0,
                                }]);
                                setThinking(evt.passed ? 'Verification passed' : `${evt.total_errors} errors found`);
                                break;
                            case 'debug_diagnosis':
                                setThinking(`Diagnosis: ${(evt.root_cause || '').slice(0, 80)}`);
                                break;
                            case 'debug_fix':
                                setThinking(`Fix: ${evt.operation_count} operations`);
                                break;
                            case 'loop_complete':
                                setState('complete');
                                setThinking(`Completed in ${evt.iterations} iteration(s)`);
                                setIsRunning(false);
                                break;
                            case 'loop_failed':
                                setState('failed');
                                setError(evt.error || 'Loop failed');
                                setIsRunning(false);
                                break;
                            case 'loop_cancelled':
                                setState('cancelled');
                                setIsRunning(false);
                                break;
                            case 'loop_error':
                                setState('failed');
                                setError(evt.error || 'Unknown error');
                                setIsRunning(false);
                                break;
                        }
                    } catch {
                        // skip parse errors
                    }
                }
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                setState('cancelled');
            } else {
                setError(err.message || String(err));
                setState('failed');
            }
            setIsRunning(false);
        }
    }, [prompt, activeFile, activeFileContent, maxRetries, currentIteration]);

    // ─── Cancel ──────────────────────────────────────
    const cancelLoop = useCallback(async () => {
        abortRef.current?.abort();
        try {
            await fetch(`${API_BASE}/ide/autonomous/cancel`, { method: 'POST' });
        } catch { /* ignore */ }
        setState('cancelled');
        setIsRunning(false);
        setThinking('');
    }, []);

    // ─── Reset ───────────────────────────────────────
    const reset = useCallback(() => {
        setState('idle');
        setEvents([]);
        setIterations([]);
        setError(null);
        setThinking('');
        setIsRunning(false);
        setTotalTokens(0);
    }, []);

    const isIdle = state === 'idle' || state === 'complete' || state === 'failed' || state === 'cancelled';

    return (
        <div className="h-full flex flex-col font-mono text-[11px]">
            {/* ─── Header ────────────────────────────────── */}
            <div className="panel-header flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-engraved">AUTONOMOUS LOOP</span>
                    <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded",
                        STATE_META[state]?.color || 'text-label-muted',
                        isRunning && "animate-pulse"
                    )}>
                        {STATE_META[state]?.label || state.toUpperCase()}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {totalTokens > 0 && (
                        <span className="text-[9px] text-label-engraved">{totalTokens.toLocaleString()} TOKENS</span>
                    )}
                    {iterations.length > 0 && (
                        <span className="text-[9px] text-label-engraved">
                            ITER {iterations.length}/{maxRetries + 1}
                        </span>
                    )}
                </div>
            </div>

            {/* ─── Input Bar (when idle) ──────────────────── */}
            {isIdle && (
                <div className="p-2 space-y-2 border-b border-border">
                    <div className="flex gap-2">
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="Describe the full feature to build autonomously..."
                            className="flex-1 surface-well rounded px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 min-h-[48px]"
                            rows={2}
                            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) startLoop(); }}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] text-label-engraved">MAX RETRIES</span>
                            {[1, 2, 3, 5].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setMaxRetries(n)}
                                    className={cn(
                                        "text-[9px] px-1.5 py-0.5 rounded font-mono",
                                        maxRetries === n ? "surface-raised text-primary" : "text-label-muted hover:text-label-secondary"
                                    )}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            {(state === 'complete' || state === 'failed' || state === 'cancelled') && (
                                <button onClick={reset} className="text-[9px] text-label-engraved hover:text-label-secondary">
                                    RESET
                                </button>
                            )}
                            <button
                                onClick={startLoop}
                                disabled={!prompt.trim()}
                                className="control-button-primary text-[10px] px-4 py-1 disabled:opacity-30"
                            >
                                EXECUTE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Running Controls ──────────────────────── */}
            {isRunning && (
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] text-label-secondary truncate">{thinking || 'Processing...'}</span>
                    </div>
                    <button
                        onClick={cancelLoop}
                        className="text-[9px] text-status-error hover:text-status-error/80 px-2 py-0.5 surface-raised rounded ml-2 flex-shrink-0"
                    >
                        ABORT
                    </button>
                </div>
            )}

            {/* ─── State Machine Pipeline ─────────────────── */}
            {state !== 'idle' && (
                <div className="px-3 py-2 border-b border-border flex items-center gap-1 overflow-x-auto">
                    {STATE_FLOW.map((s, i) => {
                        const idx = STATE_FLOW.indexOf(state as any);
                        const isActive = s === state;
                        const isPast = idx > i || state === 'complete';
                        const isDebug = state === 'debugging';

                        return (
                            <div key={s} className="flex items-center gap-1">
                                {i > 0 && <div className={cn("w-3 h-px", isPast ? "bg-status-success" : "bg-border")} />}
                                <div className={cn(
                                    "text-[8px] font-mono px-1.5 py-0.5 rounded transition-all",
                                    isActive && "surface-raised text-primary ring-1 ring-primary/20",
                                    isPast && !isActive && "text-status-success",
                                    !isPast && !isActive && "text-label-engraved",
                                )}>
                                    {s.toUpperCase()}
                                </div>
                            </div>
                        );
                    })}
                    {state === 'debugging' && (
                        <>
                            <div className="w-3 h-px bg-status-error" />
                            <div className="text-[8px] font-mono px-1.5 py-0.5 rounded surface-raised text-status-error ring-1 ring-status-error/20 animate-pulse">
                                DEBUGGING
                            </div>
                        </>
                    )}
                    {state === 'complete' && (
                        <>
                            <div className="w-3 h-px bg-status-success" />
                            <div className="text-[8px] font-mono px-1.5 py-0.5 rounded surface-raised text-status-success">
                                DONE
                            </div>
                        </>
                    )}
                    {state === 'failed' && (
                        <>
                            <div className="w-3 h-px bg-status-error" />
                            <div className="text-[8px] font-mono px-1.5 py-0.5 rounded surface-raised text-status-error">
                                FAILED
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ─── Iteration Summary Cards ────────────────── */}
            {iterations.length > 0 && (
                <div className="px-3 py-1.5 border-b border-border flex gap-1.5 overflow-x-auto">
                    {iterations.map((it, i) => (
                        <div key={i} className={cn(
                            "surface-well rounded px-2 py-1 flex-shrink-0 min-w-[80px]",
                            it.passed ? "border-l-2 border-status-success" : "border-l-2 border-status-error"
                        )}>
                            <div className="text-[8px] text-label-engraved">ITER {it.iteration + 1}</div>
                            <div className={cn(
                                "text-[10px] font-semibold",
                                it.passed ? "text-status-success" : "text-status-error"
                            )}>
                                {it.passed ? 'PASS' : `${it.errors} ERR`}
                            </div>
                            <div className="text-[8px] text-label-engraved">{it.duration_ms}ms</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Error Banner ───────────────────────────── */}
            {error && (
                <div className="px-3 py-2 border-b border-status-error/30 bg-status-error/5 text-status-error text-xs">
                    {error}
                </div>
            )}

            {/* ─── Event Log ──────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {events.length === 0 && state === 'idle' && (
                    <div className="h-full flex items-center justify-center text-label-muted">
                        <div className="text-center space-y-1">
                            <div className="text-engraved text-[10px]">AUTONOMOUS BUILD ENGINE</div>
                            <div className="text-[9px] text-label-engraved max-w-[300px]">
                                Describe a feature. The AI will generate, apply, verify, debug, and retry
                                until the code compiles and passes checks.
                            </div>
                            <div className="text-[8px] text-label-engraved mt-2">CTRL+ENTER TO EXECUTE</div>
                        </div>
                    </div>
                )}
                {events.map((evt, i) => (
                    <EventRow key={i} event={evt} />
                ))}
                <div ref={eventsEndRef} />
            </div>
        </div>
    );
}

// ─── Event Row ───────────────────────────────────────

function EventRow({ event }: { event: LoopEvent }) {
    const { type, data } = event;

    const typeColor: Record<string, string> = {
        loop_start: 'text-primary',
        state_change: 'text-label-secondary',
        codegen_thinking: 'text-label-muted',
        codegen_result: 'text-primary',
        apply_result: 'text-status-warning',
        snapshot_result: 'text-label-secondary',
        snapshot_skipped: 'text-label-engraved',
        verify_result: data.passed ? 'text-status-success' : 'text-status-error',
        debug_start: 'text-status-error',
        debug_diagnosis: 'text-status-warning',
        debug_fix: 'text-status-info',
        debug_error: 'text-status-error',
        loop_complete: 'text-status-success',
        loop_failed: 'text-status-error',
        loop_cancelled: 'text-label-muted',
        learning_context: 'text-label-secondary',
        iteration_start: 'text-primary',
    };

    const getMessage = (): string => {
        switch (type) {
            case 'loop_start': return `Started: "${(data.prompt || '').slice(0, 60)}" (${data.project_type || 'unknown'})`;
            case 'state_change': return `State: ${data.state?.toUpperCase()}`;
            case 'codegen_thinking': return (data.thinking || '').slice(0, 100);
            case 'codegen_result': return `Generated ${data.operation_count} operation(s) [${data.tokens || 0} tokens]`;
            case 'apply_result': return `Applied ${data.success}/${data.total} files: ${(data.files || []).join(', ')}`;
            case 'snapshot_result': return `Snapshot: ${(data.commit || '').slice(0, 8)}`;
            case 'snapshot_skipped': return `Snapshot skipped: ${data.reason}`;
            case 'verify_result': return data.passed ? `Verification PASSED (${data.duration_ms}ms)` : `Verification FAILED: ${data.summary} (${data.total_errors} errors)`;
            case 'debug_start': return `Debug retry #${data.iteration}`;
            case 'debug_diagnosis': return `Root cause: ${(data.root_cause || '').slice(0, 100)}`;
            case 'debug_fix': return `Fix: ${data.operation_count} operation(s)`;
            case 'debug_error': return `Debug failed: ${data.error}`;
            case 'loop_complete': return `COMPLETE in ${data.iterations} iteration(s), ${data.total_tokens} tokens, ${data.total_duration_ms}ms`;
            case 'loop_failed': return `FAILED: ${data.error}`;
            case 'loop_cancelled': return 'Cancelled by user';
            case 'learning_context': return data.has_learning ? `Loaded learning context (${data.context_length} chars)` : 'No prior learning data';
            case 'iteration_start': return `Iteration ${data.iteration + 1} (${data.phase})`;
            default: return JSON.stringify(data).slice(0, 100);
        }
    };

    // Skip noisy state_change events
    if (type === 'state_change') return null;

    return (
        <div className="flex items-start gap-1.5 px-1 py-0.5 rounded hover:bg-white/[0.02] group">
            <span className={cn("text-[8px] font-mono w-[80px] flex-shrink-0 uppercase", typeColor[type] || 'text-label-muted')}>
                {type.replace('loop_', '').replace('codegen_', 'GEN:').replace('verify_', 'VER:').replace('debug_', 'DBG:').replace('apply_', 'APL:').replace('snapshot_', 'SNAP:')}
            </span>
            <span className="text-[10px] text-label-secondary">{getMessage()}</span>
        </div>
    );
}
