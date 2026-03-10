import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

// ─── Types ──────────────────────────────────────────

interface ScreenshotMeta {
    id: string;
    url: string;
    path: string;
    width: number;
    height: number;
    timestamp: number;
    has_data: boolean;
}

interface DiffResult {
    similarity: number;
    change_percentage: number;
    changed_pixels: number;
    total_pixels: number;
    regions_count: number;
    has_diff_image: boolean;
}

interface AnalysisResult {
    description: string;
    issues: string[];
    suggestions: string[];
    elements_found: string[];
    confidence: number;
}

interface Capabilities {
    screenshot: boolean;
    diff: boolean;
    vision_analysis: boolean;
}

type ViewMode = 'capture' | 'gallery' | 'diff' | 'analysis';

// ─── Component ───────────────────────────────────────

export function VisualInspectorDrawer() {
    const [mode, setMode] = useState<ViewMode>('capture');
    const [url, setUrl] = useState('http://localhost:8080');
    const [screenshots, setScreenshots] = useState<ScreenshotMeta[]>([]);
    const [activeShot, setActiveShot] = useState<string | null>(null);
    const [activeImage, setActiveImage] = useState<string | null>(null); // base64
    const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
    const [diffImage, setDiffImage] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedForDiff, setSelectedForDiff] = useState<[string, string]>(['', '']);

    // ─── Load capabilities on mount ──────────────────
    const loadStatus = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/ide/visual/status`);
            const data = await resp.json();
            setCapabilities(data.capabilities);
        } catch { /* ignore */ }
    }, []);

    // ─── Capture Screenshot ──────────────────────────
    const captureScreenshot = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${API_BASE}/ide/visual/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);
            setActiveShot(data.id);
            // Fetch with base64
            const detailResp = await fetch(`${API_BASE}/ide/visual/screenshot/${data.id}`);
            const detail = await detailResp.json();
            setActiveImage(detail.base64 || null);
            // Refresh list
            await loadScreenshots();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [url]);

    // ─── Load Screenshots ────────────────────────────
    const loadScreenshots = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/ide/visual/screenshots`);
            const data = await resp.json();
            setScreenshots(data.screenshots || []);
        } catch { /* ignore */ }
    }, []);

    // ─── Run Diff ────────────────────────────────────
    const runDiff = useCallback(async () => {
        const [before, after] = selectedForDiff;
        if (!before || !after) return;
        setIsLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${API_BASE}/ide/visual/diff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ before, after }),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);
            setDiffResult(data);
            // Could fetch diff image if needed
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedForDiff]);

    // ─── Run Analysis ────────────────────────────────
    const runAnalysis = useCallback(async (shotId: string, query: string = '') => {
        setIsLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${API_BASE}/ide/visual/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    screenshot: shotId,
                    query: query || 'Describe this UI. Identify layout issues, visual bugs, and accessibility concerns.',
                }),
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error);
            setAnalysis(data);
            setMode('analysis');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Init
    useState(() => { loadStatus(); loadScreenshots(); });

    return (
        <div className="h-full flex flex-col font-mono text-[11px]">
            {/* ─── Header ──────────────────────────────── */}
            <div className="panel-header flex items-center justify-between">
                <span className="text-engraved">VISUAL INSPECTOR</span>
                <div className="flex items-center gap-1">
                    {(['capture', 'gallery', 'diff', 'analysis'] as ViewMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={cn(
                                "text-[8px] px-1.5 py-0.5 rounded uppercase font-mono",
                                mode === m ? "surface-raised text-primary" : "text-label-muted hover:text-label-secondary"
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Error Banner ────────────────────────── */}
            {error && (
                <div className="px-3 py-1.5 border-b border-status-error/30 bg-status-error/5 text-status-error text-[10px]">
                    {error}
                    <button onClick={() => setError(null)} className="ml-2 text-label-muted hover:text-label-secondary">X</button>
                </div>
            )}

            {/* ─── Capture Mode ────────────────────────── */}
            {mode === 'capture' && (
                <div className="flex-1 flex flex-col">
                    <div className="p-3 space-y-2 border-b border-border">
                        <label className="text-[9px] text-label-engraved uppercase">Target URL</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                className="flex-1 surface-well rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                            <button
                                onClick={captureScreenshot}
                                disabled={isLoading}
                                className="control-button-primary text-[9px] px-3 py-1 disabled:opacity-30"
                            >
                                {isLoading ? 'CAPTURING...' : 'CAPTURE'}
                            </button>
                        </div>
                        {capabilities && !capabilities.screenshot && (
                            <div className="text-[9px] text-status-warning surface-well rounded p-2">
                                Playwright not installed. Run: pip install playwright && playwright install chromium
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    <div className="flex-1 overflow-y-auto p-3">
                        {activeImage ? (
                            <div className="space-y-2">
                                <div className="surface-well rounded overflow-hidden">
                                    <img
                                        src={`data:image/png;base64,${activeImage}`}
                                        alt="Screenshot"
                                        className="w-full h-auto"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-label-engraved">{activeShot}</span>
                                    <button
                                        onClick={() => activeShot && runAnalysis(activeShot)}
                                        disabled={isLoading}
                                        className="text-[9px] text-primary hover:text-primary/80"
                                    >
                                        ANALYZE WITH AI
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-label-muted">
                                <div className="text-center space-y-1">
                                    <div className="text-engraved text-[10px]">VISUAL CAPTURE</div>
                                    <div className="text-[9px] text-label-engraved">
                                        Capture screenshots of running applications for AI analysis and visual diffing.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Gallery Mode ────────────────────────── */}
            {mode === 'gallery' && (
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {screenshots.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-label-muted text-[10px]">
                            No screenshots captured yet
                        </div>
                    ) : (
                        screenshots.map(shot => (
                            <div
                                key={shot.id}
                                className={cn(
                                    "surface-well rounded p-2 cursor-pointer hover:amber-glow",
                                    activeShot === shot.id && "ring-1 ring-primary/30"
                                )}
                                onClick={async () => {
                                    setActiveShot(shot.id);
                                    // Load image
                                    const resp = await fetch(`${API_BASE}/ide/visual/screenshot/${shot.id}`);
                                    const data = await resp.json();
                                    setActiveImage(data.base64 || null);
                                    setMode('capture');
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-label-secondary font-mono">{shot.id}</span>
                                    <span className="text-[8px] text-label-engraved">{shot.width}x{shot.height}</span>
                                </div>
                                <div className="text-[9px] text-label-engraved truncate mt-0.5">{shot.url}</div>
                                <div className="text-[8px] text-label-engraved mt-0.5">
                                    {new Date(shot.timestamp * 1000).toLocaleTimeString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ─── Diff Mode ───────────────────────────── */}
            {mode === 'diff' && (
                <div className="flex-1 flex flex-col">
                    <div className="p-3 space-y-2 border-b border-border">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[8px] text-label-engraved uppercase">Before</label>
                                <select
                                    value={selectedForDiff[0]}
                                    onChange={e => setSelectedForDiff([e.target.value, selectedForDiff[1]])}
                                    className="w-full surface-well rounded px-2 py-1 text-[10px] mt-0.5"
                                >
                                    <option value="">Select...</option>
                                    {screenshots.map(s => (
                                        <option key={s.id} value={s.id}>{s.id}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[8px] text-label-engraved uppercase">After</label>
                                <select
                                    value={selectedForDiff[1]}
                                    onChange={e => setSelectedForDiff([selectedForDiff[0], e.target.value])}
                                    className="w-full surface-well rounded px-2 py-1 text-[10px] mt-0.5"
                                >
                                    <option value="">Select...</option>
                                    {screenshots.map(s => (
                                        <option key={s.id} value={s.id}>{s.id}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button
                            onClick={runDiff}
                            disabled={isLoading || !selectedForDiff[0] || !selectedForDiff[1]}
                            className="control-button-primary text-[9px] px-3 py-1 w-full disabled:opacity-30"
                        >
                            {isLoading ? 'COMPUTING...' : 'COMPUTE DIFF'}
                        </button>
                    </div>

                    {diffResult && (
                        <div className="p-3 space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                                <DiffStat label="SIMILARITY" value={`${(diffResult.similarity * 100).toFixed(1)}%`} color={diffResult.similarity > 0.95 ? 'text-status-success' : 'text-status-warning'} />
                                <DiffStat label="CHANGED" value={`${diffResult.change_percentage.toFixed(1)}%`} color={diffResult.change_percentage < 5 ? 'text-status-success' : 'text-status-error'} />
                                <DiffStat label="REGIONS" value={String(diffResult.regions_count)} color="text-label-secondary" />
                            </div>
                            <div className="surface-well rounded p-2 text-[9px] text-label-secondary">
                                {diffResult.changed_pixels.toLocaleString()} / {diffResult.total_pixels.toLocaleString()} pixels changed
                            </div>
                        </div>
                    )}

                    {!diffResult && (
                        <div className="flex-1 flex items-center justify-center text-label-muted text-[10px]">
                            Select two screenshots to compare
                        </div>
                    )}
                </div>
            )}

            {/* ─── Analysis Mode ───────────────────────── */}
            {mode === 'analysis' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {analysis ? (
                        <>
                            <div className="surface-well rounded p-2">
                                <div className="text-[8px] text-label-engraved uppercase mb-1">DESCRIPTION</div>
                                <div className="text-[10px] text-label-secondary">{analysis.description}</div>
                            </div>

                            {analysis.issues.length > 0 && (
                                <div className="surface-well rounded p-2">
                                    <div className="text-[8px] text-status-error uppercase mb-1">ISSUES ({analysis.issues.length})</div>
                                    {analysis.issues.map((issue, i) => (
                                        <div key={i} className="text-[10px] text-label-secondary py-0.5 border-b border-border last:border-0">
                                            {issue}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {analysis.suggestions.length > 0 && (
                                <div className="surface-well rounded p-2">
                                    <div className="text-[8px] text-status-info uppercase mb-1">SUGGESTIONS ({analysis.suggestions.length})</div>
                                    {analysis.suggestions.map((s, i) => (
                                        <div key={i} className="text-[10px] text-label-secondary py-0.5 border-b border-border last:border-0">
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {analysis.elements_found.length > 0 && (
                                <div className="surface-well rounded p-2">
                                    <div className="text-[8px] text-label-engraved uppercase mb-1">ELEMENTS FOUND</div>
                                    <div className="flex flex-wrap gap-1">
                                        {analysis.elements_found.map((el, i) => (
                                            <span key={i} className="text-[8px] surface-raised rounded px-1.5 py-0.5 text-label-secondary">
                                                {el}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="text-[8px] text-label-engraved text-right">
                                Confidence: {(analysis.confidence * 100).toFixed(0)}%
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center text-label-muted text-[10px]">
                            Capture a screenshot and click "ANALYZE WITH AI" to get vision analysis.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Diff Stat Card ──────────────────────────────────

function DiffStat({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="surface-well rounded p-2 text-center">
            <div className="text-[8px] text-label-engraved">{label}</div>
            <div className={cn("text-sm font-semibold", color)}>{value}</div>
        </div>
    );
}
