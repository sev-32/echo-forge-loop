import { useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconShield } from "@/components/icons";

const API = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

interface DiagnosticItem {
    id: string;
    severity: string;
    category: string;
    rule: string;
    message: string;
    filepath: string;
    line?: number;
    snippet?: string;
    fix_suggestion?: string;
    tags?: string[];
}

interface DiagnosticGroup {
    rule: string;
    severity: string;
    category: string;
    message: string;
    count: number;
    files: string[];
    diagnostics: DiagnosticItem[];
}

interface ScanResult {
    summary: {
        total: number;
        errors: number;
        warnings: number;
        info: number;
        hints: number;
        security_issues: number;
        files_scanned: number;
    };
    groups: DiagnosticGroup[];
    diagnostics: DiagnosticItem[];
}

type ScanMode = 'full' | 'security';

const SEVERITY_CLASS: Record<string, string> = {
    error: 'text-status-error',
    warning: 'text-status-warning',
    info: 'text-status-info',
    hint: 'text-label-engraved',
};

const SEVERITY_BG: Record<string, string> = {
    error: 'bg-red-500/10 border-red-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    info: 'bg-blue-500/10 border-blue-500/20',
    hint: 'bg-gray-500/10 border-gray-500/20',
};

const CATEGORY_LABEL: Record<string, string> = {
    security: 'SEC',
    quality: 'QA',
    performance: 'PERF',
    style: 'STY',
    correctness: 'COR',
};

export function SecurityPanel() {
    const [result, setResult] = useState<ScanResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<ScanMode>('full');
    const [expandedRule, setExpandedRule] = useState<string | null>(null);
    const [severityFilter, setSeverityFilter] = useState('');

    const runScan = useCallback(async (scanMode: ScanMode) => {
        setLoading(true);
        setResult(null);
        try {
            const endpoint = scanMode === 'security' ? '/ide/diagnostics/security' : '/ide/diagnostics/scan';
            const resp = await fetch(`${API}${endpoint}?max_files=200`);
            const data = await resp.json();
            setResult(data);
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    const filteredGroups = result?.groups.filter(g =>
        !severityFilter || g.severity === severityFilter
    ) || [];

    const totalByCategory = result?.diagnostics.reduce((acc, d) => {
        acc[d.category] = (acc[d.category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>) || {};

    return (
        <div className="h-full flex flex-col" style={{ background: 'hsl(var(--surface-0))' }}>
            {/* Header */}
            <div className="panel-header flex-shrink-0">
                <div className="flex items-center gap-2 flex-1">
                    {/* Mode toggle */}
                    {(['full', 'security'] as ScanMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`text-[8px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-all ${mode === m ? 'surface-raised text-label-primary' : 'text-label-engraved'
                                }`}
                        >
                            {m === 'full' ? 'FULL SCAN' : 'SECURITY'}
                        </button>
                    ))}

                    {/* Severity filters */}
                    <span className="w-px h-3 bg-border-subtle mx-1" />
                    {['error', 'warning', 'info'].map(sev => (
                        <button
                            key={sev}
                            onClick={() => setSeverityFilter(severityFilter === sev ? '' : sev)}
                            className={`text-[8px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-all ${severityFilter === sev ? 'surface-raised' : ''
                                } ${SEVERITY_CLASS[sev]}`}
                        >
                            {sev.toUpperCase()}
                            {result && (
                                <span className="ml-0.5 opacity-60">
                                    {sev === 'error' ? result.summary.errors :
                                        sev === 'warning' ? result.summary.warnings :
                                            result.summary.info}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => runScan(mode)}
                        disabled={loading}
                        className="control-button-primary text-[9px] font-mono font-semibold px-2 py-0.5 rounded"
                    >
                        {loading ? 'SCANNING...' : 'RUN SCAN'}
                    </button>
                </div>
            </div>

            {/* Summary bar */}
            {result && (
                <div className="px-3 py-1.5 flex items-center gap-3 border-b"
                    style={{ borderColor: 'hsl(var(--border-subtle))' }}>
                    <span className="text-[9px] font-mono text-label-secondary">
                        {result.summary.files_scanned} files scanned
                    </span>
                    <span className="w-px h-3 bg-border-subtle" />
                    <span className="text-[9px] font-mono text-label-primary font-semibold">
                        {result.summary.total} findings
                    </span>
                    {Object.entries(totalByCategory).map(([cat, count]) => (
                        <span key={cat} className="text-[8px] font-mono text-label-engraved uppercase">
                            {CATEGORY_LABEL[cat] || cat}: {count}
                        </span>
                    ))}
                    {result.summary.security_issues > 0 && (
                        <>
                            <span className="w-px h-3 bg-border-subtle" />
                            <span className="text-[9px] font-mono text-status-error font-semibold">
                                {result.summary.security_issues} security
                            </span>
                        </>
                    )}
                </div>
            )}

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {!result && !loading && (
                        <div className="text-center py-12">
                            <IconShield size={24} className="text-label-engraved mx-auto mb-3" />
                            <span className="text-engraved block">DIAGNOSTIC ENGINE</span>
                            <p className="text-[9px] text-label-engraved mt-1">
                                25 rules across security, quality, performance, and style
                            </p>
                            <button
                                onClick={() => runScan(mode)}
                                className="control-button-primary text-[9px] font-mono font-semibold px-3 py-1 rounded mt-4"
                            >
                                RUN {mode.toUpperCase()} SCAN
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="text-center py-12">
                            <div className="inline-block w-4 h-4 border-2 border-label-engraved border-t-amber-500 rounded-full animate-spin mb-3" />
                            <span className="text-engraved block">SCANNING...</span>
                        </div>
                    )}

                    {result && filteredGroups.length === 0 && (
                        <div className="text-center py-8">
                            <IconShield size={20} className="text-status-success mx-auto mb-2" />
                            <span className="text-engraved block">NO ISSUES FOUND</span>
                            <p className="text-[9px] text-label-engraved mt-1">
                                {severityFilter ? `No ${severityFilter} level issues` : 'Clean scan'}
                            </p>
                        </div>
                    )}

                    {/* Grouped findings */}
                    {filteredGroups.map(group => (
                        <div key={group.rule} className={`rounded border ${SEVERITY_BG[group.severity] || ''}`}>
                            {/* Group header */}
                            <button
                                onClick={() => setExpandedRule(expandedRule === group.rule ? null : group.rule)}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
                            >
                                <span className={`text-[8px] font-mono font-bold uppercase tracking-wider ${SEVERITY_CLASS[group.severity]}`}>
                                    {group.rule}
                                </span>
                                <span className="text-[9px] font-mono text-label-secondary flex-1 truncate">
                                    {group.message}
                                </span>
                                <span className="text-[8px] font-mono text-label-engraved uppercase">
                                    {CATEGORY_LABEL[group.category] || group.category}
                                </span>
                                <span className="text-[9px] font-mono text-label-primary font-semibold min-w-[20px] text-right">
                                    {group.count}
                                </span>
                                <span className="text-[8px] text-label-engraved">
                                    {expandedRule === group.rule ? '▾' : '▸'}
                                </span>
                            </button>

                            {/* Expanded details */}
                            {expandedRule === group.rule && (
                                <div className="px-2.5 pb-2 space-y-0.5">
                                    {group.diagnostics.map((d, i) => (
                                        <div key={i} className="surface-well rounded px-2 py-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-mono text-label-secondary truncate flex-1">
                                                    {d.filepath}
                                                    {d.line ? `:${d.line}` : ''}
                                                </span>
                                                {d.tags && d.tags.map(tag => (
                                                    <span key={tag} className="text-[7px] font-mono text-label-engraved uppercase bg-surface-1 px-1 rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                            {d.snippet && (
                                                <pre className="text-[9px] font-mono text-label-primary mt-0.5 truncate">
                                                    {d.snippet}
                                                </pre>
                                            )}
                                            {d.fix_suggestion && (
                                                <p className="text-[8px] font-mono text-status-info mt-0.5">
                                                    Fix: {d.fix_suggestion}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                    {group.count > group.diagnostics.length && (
                                        <p className="text-[8px] font-mono text-label-engraved text-center py-0.5">
                                            +{group.count - group.diagnostics.length} more
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
