import { useState, useCallback, useRef } from "react";
import { DiffViewer, type CodeOperation } from "./DiffViewer";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

// ─── Types ──────────────────────────────────────────
type GenPhase = 'idle' | 'generating' | 'reviewing' | 'applying' | 'complete' | 'error';

interface GenerationResult {
    plan: string;
    operations: CodeOperation[];
    dependencies: string[];
    nextSteps: string[];
    tokens: number;
}

interface CodeGenPanelProps {
    /** Currently open file path */
    activeFile?: string;
    /** Content of the active file */
    activeFileContent?: string;
    /** Callback when files have been written */
    onFilesChanged?: (paths: string[]) => void;
}

export function CodeGenPanel({ activeFile, activeFileContent, onFilesChanged }: CodeGenPanelProps) {
    const [prompt, setPrompt] = useState('');
    const [phase, setPhase] = useState<GenPhase>('idle');
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [thinking, setThinking] = useState<string>('');
    const abortRef = useRef<AbortController | null>(null);

    // ─── Generate Code ──────────────────────────────
    const generate = useCallback(async () => {
        const text = prompt.trim();
        if (!text) return;

        setPhase('generating');
        setError(null);
        setResult(null);
        setThinking('Preparing context...');

        const ac = new AbortController();
        abortRef.current = ac;

        try {
            const fileContext: Record<string, string> = {};
            if (activeFile && activeFileContent) {
                fileContext[activeFile] = activeFileContent;
            }

            const resp = await fetch(`${API_BASE}/ide/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: text,
                    file_context: fileContext,
                }),
                signal: ac.signal,
            });

            if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            const ops: CodeOperation[] = [];
            let plan = '';
            let deps: string[] = [];
            let steps: string[] = [];
            let totalTokens = 0;

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
                    if (json === '[DONE]') break;

                    try {
                        const evt = JSON.parse(json);
                        switch (evt.type) {
                            case 'codegen_thinking':
                                setThinking(evt.content);
                                break;
                            case 'codegen_plan':
                                plan = evt.plan;
                                setThinking(`Plan: ${evt.plan}`);
                                break;
                            case 'codegen_operation':
                                ops.push(evt.op);
                                setThinking(`Generated: ${evt.op.path}`);
                                break;
                            case 'codegen_complete':
                                deps = evt.dependencies || [];
                                steps = evt.next_steps || [];
                                totalTokens = evt.tokens || 0;
                                break;
                            case 'codegen_error':
                                throw new Error(evt.error);
                        }
                    } catch (e: any) {
                        if (e.message && !e.message.includes('JSON')) throw e;
                    }
                }
            }

            setResult({ plan, operations: ops, dependencies: deps, nextSteps: steps, tokens: totalTokens });
            setPhase(ops.length > 0 ? 'reviewing' : 'complete');
            setThinking('');

        } catch (err: any) {
            if (err.name === 'AbortError') {
                setPhase('idle');
            } else {
                setError(err.message || String(err));
                setPhase('error');
            }
        }
    }, [prompt, activeFile, activeFileContent]);

    // ─── Apply All Operations ─────────────────────
    const applyAll = useCallback(async (operations: CodeOperation[]) => {
        setPhase('applying');
        try {
            const resp = await fetch(`${API_BASE}/ide/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operations }),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);

            setPhase('complete');
            const changedPaths = (data.results || [])
                .filter((r: any) => r.success)
                .map((r: any) => r.path);
            onFilesChanged?.(changedPaths);
        } catch (err: any) {
            setError(err.message);
            setPhase('error');
        }
    }, [onFilesChanged]);

    // ─── Apply Single ─────────────────────────────
    const applySingle = useCallback(async (index: number) => {
        if (!result) return;
        const op = result.operations[index];
        try {
            const resp = await fetch(`${API_BASE}/ide/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operations: [op] }),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);
            onFilesChanged?.([op.path]);
        } catch (err: any) {
            setError(err.message);
        }
    }, [result, onFilesChanged]);

    // ─── Cancel ───────────────────────────────────
    const cancel = useCallback(() => {
        abortRef.current?.abort();
        setPhase('idle');
        setThinking('');
    }, []);

    // ─── Reset ────────────────────────────────────
    const reset = useCallback(() => {
        setPhase('idle');
        setResult(null);
        setError(null);
        setThinking('');
    }, []);

    return (
        <div className="h-full flex flex-col">
            {/* Prompt Input Area (idle/error states) */}
            {(phase === 'idle' || phase === 'error' || phase === 'complete') && (
                <div className="flex-shrink-0 p-3 space-y-2 border-b border-border">
                    {/* Active file indicator */}
                    {activeFile && (
                        <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-label-muted">Context:</span>
                            <span className="font-mono px-1.5 py-0.5 rounded bg-secondary text-primary">
                                {activeFile}
                            </span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    generate();
                                }
                            }}
                            placeholder="Describe what you want to build or change... (Ctrl+Enter to generate)"
                            rows={3}
                            className="flex-1 bg-transparent text-xs resize-none focus:outline-none p-2 surface-well rounded text-label-primary"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-[10px] text-label-muted">
                            {phase === 'complete' && result && (
                                <span className="text-status-success">
                                    ✓ Applied {result.operations.length} operations ({result.tokens} tokens)
                                </span>
                            )}
                            {phase === 'error' && error && (
                                <span className="text-status-error">✗ {error}</span>
                            )}
                        </div>
                        <div className="flex gap-1.5">
                            {phase === 'complete' && (
                                <button onClick={reset} className="control-button text-[10px] px-3 py-1">
                                    New Generation
                                </button>
                            )}
                            <button
                                onClick={generate}
                                disabled={!prompt.trim()}
                                className="control-button-primary text-[10px] px-3 py-1 disabled:opacity-30"
                            >
                                GENERATE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Generating State */}
            {phase === 'generating' && (
                <div className="flex-shrink-0 p-4 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="text-xs text-center text-label-primary">{thinking}</p>
                    <button onClick={cancel} className="control-button text-[10px] px-3 py-1 text-status-error">
                        Cancel
                    </button>
                </div>
            )}

            {/* Review State — DiffViewer */}
            {phase === 'reviewing' && result && (
                <div className="flex-1 min-h-0">
                    <DiffViewer
                        operations={result.operations}
                        plan={result.plan}
                        dependencies={result.dependencies}
                        nextSteps={result.nextSteps}
                        onAccept={applyAll}
                        onAcceptSingle={applySingle}
                        onReject={reset}
                        applying={phase === 'applying' as any}
                    />
                </div>
            )}

            {/* Applying State */}
            {phase === 'applying' && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-6 h-6 rounded-full border-2 border-status-success border-t-transparent animate-spin mx-auto mb-2" />
                        <p className="text-xs text-label-primary">Applying changes...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
