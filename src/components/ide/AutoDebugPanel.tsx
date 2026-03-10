import { useState, useCallback } from "react";

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

// ─── Types ──────────────────────────────────────────
type DebugPhase = 'idle' | 'diagnosing' | 'diagnosed' | 'applying' | 'complete' | 'error';

interface Diagnosis {
    diagnosis: string;
    rootCause: string;
    fix: {
        plan: string;
        operations: any[];
    };
    prevention: string;
    tokens: number;
}

interface AutoDebugPanelProps {
    /** Pre-fill with an error string */
    initialError?: string;
    /** Callback when fix has been applied */
    onFixApplied?: (paths: string[]) => void;
}

export function AutoDebugPanel({ initialError, onFixApplied }: AutoDebugPanelProps) {
    const [errorText, setErrorText] = useState(initialError || '');
    const [phase, setPhase] = useState<DebugPhase>('idle');
    const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
    const [statusMsg, setStatusMsg] = useState('');
    const [error, setError] = useState<string | null>(null);

    // ─── Diagnose Error ──────────────────────────────
    const diagnose = useCallback(async () => {
        const text = errorText.trim();
        if (!text) return;

        setPhase('diagnosing');
        setDiagnosis(null);
        setError(null);
        setStatusMsg('Analyzing error...');

        try {
            const resp = await fetch(`${API_BASE}/ide/debug`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: text }),
            });

            if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            let diag: Partial<Diagnosis> = {};

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
                            case 'debug_start':
                                setStatusMsg('Parsing error context...');
                                break;
                            case 'debug_diagnosis':
                                diag.diagnosis = evt.diagnosis;
                                diag.rootCause = evt.root_cause;
                                setStatusMsg('Root cause identified');
                                break;
                            case 'debug_fix':
                                diag.fix = evt.fix;
                                setStatusMsg('Fix generated');
                                break;
                            case 'debug_complete':
                                diag.prevention = evt.prevention;
                                diag.tokens = evt.tokens;
                                break;
                            case 'debug_error':
                                throw new Error(evt.error);
                        }
                    } catch (e: any) {
                        if (e.message && !e.message.includes('JSON')) throw e;
                    }
                }
            }

            setDiagnosis(diag as Diagnosis);
            setPhase('diagnosed');
        } catch (err: any) {
            setError(err.message);
            setPhase('error');
        }
    }, [errorText]);

    // ─── Apply Fix ───────────────────────────────────
    const applyFix = useCallback(async () => {
        if (!diagnosis?.fix?.operations) return;
        setPhase('applying');

        try {
            const resp = await fetch(`${API_BASE}/ide/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operations: diagnosis.fix.operations,
                    description: `auto-debug: ${diagnosis.rootCause?.slice(0, 100) || 'fix applied'}`,
                }),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);

            setPhase('complete');
            const changedPaths = (data.results || [])
                .filter((r: any) => r.success)
                .map((r: any) => r.path);
            onFixApplied?.(changedPaths);
        } catch (err: any) {
            setError(err.message);
            setPhase('error');
        }
    }, [diagnosis, onFixApplied]);

    // ─── Reset ────────────────────────────────────────
    const reset = useCallback(() => {
        setPhase('idle');
        setDiagnosis(null);
        setError(null);
        setStatusMsg('');
    }, []);

    return (
        <div className="h-full flex flex-col">
            {/* Error Input (idle/error/complete) */}
            {(phase === 'idle' || phase === 'error' || phase === 'complete') && (
                <div className="flex-shrink-0 p-3 space-y-2 border-b border-border">
                    <div className="flex items-center gap-2">
                        <span className="text-engraved text-[10px]">AUTO-DEBUG</span>
                        {phase === 'complete' && (
                            <span className="text-[10px] text-status-success">✓ Fix applied</span>
                        )}
                    </div>
                    <textarea
                        value={errorText}
                        onChange={(e) => setErrorText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); diagnose(); }
                        }}
                        placeholder="Paste an error message, stack trace, or terminal output... (Ctrl+Enter to diagnose)"
                        rows={3}
                        className="w-full bg-transparent text-xs font-mono resize-none focus:outline-none p-2 surface-well rounded text-status-error"
                    />
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-label-muted">
                            {error && <span className="text-status-error">✗ {error}</span>}
                        </span>
                        <div className="flex gap-1.5">
                            {phase === 'complete' && (
                                <button onClick={reset} className="control-button text-[10px] px-3 py-1">New Debug</button>
                            )}
                            <button
                                onClick={diagnose}
                                disabled={!errorText.trim()}
                                className="control-button text-[10px] px-3 py-1 disabled:opacity-30 text-status-error border-status-error/30"
                            >
                                DIAGNOSE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Diagnosing State */}
            {phase === 'diagnosing' && (
                <div className="p-4 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-status-error border-t-transparent animate-spin" />
                    <p className="text-xs text-label-primary">{statusMsg}</p>
                </div>
            )}

            {/* Diagnosed — Show Results */}
            {phase === 'diagnosed' && diagnosis && (
                <div className="flex-1 overflow-auto p-3 space-y-3">
                    {/* Diagnosis */}
                    <div className="space-y-2">
                        <div className="text-engraved text-[10px]">DIAGNOSIS</div>
                        <div className="surface-well rounded px-3 py-2 text-xs text-label-primary">
                            {diagnosis.diagnosis}
                        </div>
                    </div>

                    {/* Root Cause */}
                    {diagnosis.rootCause && (
                        <div className="space-y-1">
                            <div className="text-engraved text-[10px]">ROOT CAUSE</div>
                            <div className="surface-well rounded px-3 py-2 text-xs font-mono text-status-warning">
                                {diagnosis.rootCause}
                            </div>
                        </div>
                    )}

                    {/* Fix Plan */}
                    {diagnosis.fix?.plan && (
                        <div className="space-y-1">
                            <div className="text-engraved text-[10px]">PROPOSED FIX</div>
                            <div className="surface-well rounded px-3 py-2 text-xs text-status-success">
                                {diagnosis.fix.plan}
                            </div>
                            <div className="text-[10px] text-label-muted">
                                {diagnosis.fix.operations?.length || 0} file operation(s)
                            </div>
                        </div>
                    )}

                    {/* Prevention */}
                    {diagnosis.prevention && (
                        <div className="space-y-1">
                            <div className="text-engraved text-[10px]">PREVENTION</div>
                            <div className="surface-well rounded px-3 py-2 text-xs text-label-secondary">
                                {diagnosis.prevention}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                        <button onClick={reset} className="control-button text-[10px] px-3 py-1.5">Dismiss</button>
                        {diagnosis.fix?.operations?.length > 0 && (
                            <button onClick={applyFix} className="control-button-primary text-[10px] px-3 py-1.5">
                                Apply Fix ({diagnosis.fix.operations.length} files)
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Applying */}
            {phase === 'applying' && (
                <div className="p-4 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-status-success border-t-transparent animate-spin" />
                    <p className="text-xs text-label-primary">Applying fix + creating snapshot...</p>
                </div>
            )}
        </div>
    );
}
