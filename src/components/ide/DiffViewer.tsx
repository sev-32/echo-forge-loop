import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconChevronRight, IconChevronDown } from "@/components/icons";

// ─── Types ──────────────────────────────────────────
interface Edit {
    find: string;
    replace: string;
}

export interface CodeOperation {
    action: "create" | "modify" | "delete";
    path: string;
    language?: string;
    description?: string;
    content?: string | null;
    edits?: Edit[] | null;
}

interface DiffViewerProps {
    operations: CodeOperation[];
    plan?: string;
    dependencies?: string[];
    nextSteps?: string[];
    onAccept: (operations: CodeOperation[]) => void;
    onAcceptSingle: (index: number) => void;
    onReject: () => void;
    applying?: boolean;
}

// ─── Action Badge ───────────────────────────────────
function ActionBadge({ action }: { action: string }) {
    const classes: Record<string, { bg: string; text: string; label: string }> = {
        create: { bg: 'bg-status-success/15', text: 'text-status-success', label: 'NEW' },
        modify: { bg: 'bg-status-warning/15', text: 'text-status-warning', label: 'EDIT' },
        delete: { bg: 'bg-status-error/15', text: 'text-status-error', label: 'DEL' },
    };
    const s = classes[action] || classes.modify;
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>
            {s.label}
        </span>
    );
}

// ─── Code Block ─────────────────────────────────────
function CodeBlock({ code, language, maxLines = 50 }: { code: string; language?: string; maxLines?: number }) {
    const lines = code.split("\n");
    const truncated = lines.length > maxLines;
    const displayLines = truncated ? lines.slice(0, maxLines) : lines;

    return (
        <div className="relative">
            <pre className="code-block text-[11px] leading-relaxed font-mono overflow-x-auto p-3 rounded">
                {displayLines.map((line, i) => (
                    <div key={i} className="flex">
                        <span className="select-none mr-3 min-w-[2.5rem] text-right text-label-muted">
                            {i + 1}
                        </span>
                        <span>{line}</span>
                    </div>
                ))}
                {truncated && (
                    <div className="mt-1 text-label-muted">
                        ... {lines.length - maxLines} more lines
                    </div>
                )}
            </pre>
        </div>
    );
}

// ─── Diff Block (find→replace) ──────────────────────
function DiffBlock({ edit }: { edit: Edit }) {
    return (
        <div className="rounded overflow-hidden border border-border">
            {/* Removed lines */}
            {edit.find && (
                <div className="bg-status-error/10">
                    {edit.find.split("\n").map((line, i) => (
                        <div key={`r-${i}`} className="flex text-[11px] font-mono leading-relaxed px-3 py-0.5">
                            <span className="select-none mr-2 min-w-[1.5rem] text-status-error">−</span>
                            <span className="text-status-error/80">{line}</span>
                        </div>
                    ))}
                </div>
            )}
            {/* Added lines */}
            {edit.replace && (
                <div className="bg-status-success/10">
                    {edit.replace.split("\n").map((line, i) => (
                        <div key={`a-${i}`} className="flex text-[11px] font-mono leading-relaxed px-3 py-0.5">
                            <span className="select-none mr-2 min-w-[1.5rem] text-status-success">+</span>
                            <span className="text-status-success/80">{line}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Operation Card ─────────────────────────────────
function OperationCard({ op, index, onAccept }: {
    op: CodeOperation;
    index: number;
    onAccept: (index: number) => void;
}) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="surface-well rounded-lg overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:opacity-80 bg-secondary"
            >
                {expanded ? (
                    <IconChevronDown className="w-3 h-3 flex-shrink-0 text-label-muted" />
                ) : (
                    <IconChevronRight className="w-3 h-3 flex-shrink-0 text-label-muted" />
                )}
                <ActionBadge action={op.action} />
                <span className="text-xs font-mono flex-1 truncate text-label-primary">
                    {op.path}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); onAccept(index); }}
                    className="control-button text-[10px] px-2 py-0.5 text-status-success"
                >
                    Apply
                </button>
            </button>

            {/* Body */}
            {expanded && (
                <div className="px-3 py-2 space-y-2">
                    {op.description && (
                        <p className="text-xs text-label-secondary">{op.description}</p>
                    )}

                    {/* Full content for create */}
                    {op.action === "create" && op.content && (
                        <CodeBlock code={op.content} language={op.language} />
                    )}

                    {/* Diffs for modify */}
                    {op.action === "modify" && op.edits && op.edits.map((edit, i) => (
                        <DiffBlock key={i} edit={edit} />
                    ))}

                    {/* Delete info */}
                    {op.action === "delete" && (
                        <div className="text-xs px-3 py-2 rounded surface-well text-status-error">
                            This file will be deleted.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main DiffViewer ────────────────────────────────
export function DiffViewer({
    operations,
    plan,
    dependencies,
    nextSteps,
    onAccept,
    onAcceptSingle,
    onReject,
    applying = false,
}: DiffViewerProps) {
    const fileCount = operations.length;
    const creates = operations.filter(o => o.action === "create").length;
    const modifies = operations.filter(o => o.action === "modify").length;
    const deletes = operations.filter(o => o.action === "delete").length;

    return (
        <div className="h-full flex flex-col surface-well rounded-lg overflow-hidden">
            {/* Header */}
            <div className="panel-header flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-engraved">CODE GENERATION</span>
                    <div className="flex gap-2 ml-2">
                        {creates > 0 && <span className="text-[10px] font-mono text-status-success">+{creates} new</span>}
                        {modifies > 0 && <span className="text-[10px] font-mono text-status-warning">~{modifies} edit</span>}
                        {deletes > 0 && <span className="text-[10px] font-mono text-status-error">-{deletes} del</span>}
                    </div>
                </div>
                <div className="flex gap-1.5">
                    <button
                        onClick={onReject}
                        disabled={applying}
                        className="control-button text-[10px] px-2.5 py-1 text-status-error"
                    >
                        Reject All
                    </button>
                    <button
                        onClick={() => onAccept(operations)}
                        disabled={applying}
                        className="control-button-primary text-[10px] px-2.5 py-1"
                    >
                        {applying ? "Applying..." : `Accept All (${fileCount})`}
                    </button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                    {/* Plan */}
                    {plan && (
                        <div className="surface-well rounded px-3 py-2 text-xs text-label-primary">
                            <span className="font-semibold text-primary">Plan: </span>
                            {plan}
                        </div>
                    )}

                    {/* Operations */}
                    {operations.map((op, i) => (
                        <OperationCard key={`${op.path}-${i}`} op={op} index={i} onAccept={onAcceptSingle} />
                    ))}

                    {/* Dependencies */}
                    {dependencies && dependencies.length > 0 && (
                        <div className="surface-well rounded px-3 py-2 text-xs">
                            <span className="text-engraved block mb-1">DEPENDENCIES</span>
                            <div className="flex flex-wrap gap-1.5">
                                {dependencies.map((dep, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded font-mono text-[10px] bg-primary/10 text-primary">
                                        {dep}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Next Steps */}
                    {nextSteps && nextSteps.length > 0 && (
                        <div className="surface-well rounded px-3 py-2 text-xs">
                            <span className="text-engraved block mb-1">NEXT STEPS</span>
                            <ul className="space-y-0.5 list-disc list-inside text-label-secondary">
                                {nextSteps.map((step, i) => <li key={i}>{step}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
