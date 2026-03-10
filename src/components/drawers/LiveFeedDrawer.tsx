import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSystemEvents } from "@/hooks/use-orchestration";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { IconActivity, IconRadio } from "@/components/icons";
import { GaugeRadial } from "@/components/ui/instruments";

export function LiveFeedDrawer() {
    const events = useSystemEvents();
    const { metrics } = useLiveMetrics(4000);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [events.length]);

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="panel-header border-b border-border">
                <div className="flex items-center gap-2">
                    <IconRadio size={14} className="text-primary" />
                    <span className="text-engraved">LIVE FEED</span>
                    {events.length > 0 && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                </div>
            </div>

            {/* Live Gauge Cluster */}
            <div className="grid grid-cols-3 gap-2 p-3 border-b border-border">
                <GaugeCell label="Runs" value={metrics.totalRuns} max={100} />
                <GaugeCell label="Atoms" value={metrics.atoms} max={500} />
                <GaugeCell label="Nodes" value={metrics.knowledgeNodes} max={200} />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-4 gap-1 px-3 py-2 border-b border-border">
                <MiniStat label="Tasks" value={metrics.totalTasks} />
                <MiniStat label="Rules" value={metrics.activeRules} />
                <MiniStat label="Edges" value={metrics.knowledgeEdges} />
                <MiniStat label="W" value={metrics.witnesses} />
            </div>

            {/* Cognitive Load */}
            {metrics.cognitiveLoad > 0 && (
                <div className="px-3 py-2 border-b border-border">
                    <div className="flex items-center justify-between text-[9px] mb-1">
                        <span className="text-engraved">COGNITIVE LOAD</span>
                        <span className={`font-mono ${metrics.cognitiveLoad > 0.7 ? 'text-status-error' : metrics.cognitiveLoad > 0.4 ? 'text-status-warning' : 'text-status-success'}`}>
                            {(metrics.cognitiveLoad * 100).toFixed(0)}%
                        </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${metrics.cognitiveLoad > 0.7 ? 'bg-status-error' : metrics.cognitiveLoad > 0.4 ? 'bg-status-warning' : 'bg-status-success'
                                }`}
                            style={{ width: `${Math.min(100, metrics.cognitiveLoad * 100)}%` }}
                        />
                    </div>
                    {metrics.driftDetected && (
                        <div className="text-[8px] text-status-warning mt-1 font-mono">⚠ DRIFT DETECTED</div>
                    )}
                </div>
            )}

            {/* Event Stream */}
            <ScrollArea className="flex-1" ref={scrollRef}>
                <div className="p-2 space-y-1">
                    {events.length === 0 ? (
                        <div className="text-center py-8">
                            <IconActivity size={20} className="text-label-engraved mx-auto mb-2" />
                            <span className="text-engraved">AWAITING EVENTS</span>
                        </div>
                    ) : (
                        events.slice(-50).map((event, i) => (
                            <EventRow key={i} event={event} />
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function GaugeCell({ label, value, max }: { label: string; value: number; max: number }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div className="surface-well rounded p-2 text-center">
            <GaugeRadial value={pct} size={44} strokeWidth={3} showTicks={false} />
            <div className="text-[10px] font-mono font-semibold text-label-primary mt-1">{value}</div>
            <div className="text-engraved">{label}</div>
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="text-center">
            <div className="text-[10px] font-mono font-semibold text-label-primary">{value}</div>
            <div className="text-[8px] text-label-engraved uppercase">{label}</div>
        </div>
    );
}

function EventRow({ event }: { event: { type: string; content: string; timestamp: Date } }) {
    const typeColors: Record<string, string> = {
        task_start: 'text-status-info',
        task_done: 'text-status-success',
        task_DONE: 'text-status-success',
        verify: 'text-primary',
        plan: 'text-status-warning',
        error: 'text-status-error',
        reflect: 'text-status-pending',
        knowledge: 'text-primary',
        complete: 'text-status-success',
        retry: 'text-status-blocked',
    };

    return (
        <div className="surface-well rounded px-2 py-1.5 group hover:amber-glow transition-all">
            <div className="flex items-center gap-2">
                <span className={`text-[9px] font-mono font-semibold uppercase tracking-wider ${typeColors[event.type] || 'text-label-muted'}`}>
                    {event.type}
                </span>
                <span className="text-[9px] text-label-engraved font-mono ml-auto">
                    {event.timestamp.toLocaleTimeString()}
                </span>
            </div>
            <p className="text-[10px] text-label-secondary truncate mt-0.5">
                {event.content}
            </p>
        </div>
    );
}
