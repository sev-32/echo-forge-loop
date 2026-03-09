import { useState, useEffect, useRef } from "react";
import { Activity, ChevronRight, ChevronLeft, Zap, Clock, Hash, Radio } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSystemEvents } from "@/hooks/use-orchestration";

interface RightPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function RightPanel({ isOpen, onToggle }: RightPanelProps) {
  const events = useSystemEvents();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-16 surface-raised rounded-l flex items-center justify-center hover:amber-glow transition-all"
      >
        <ChevronLeft className="w-4 h-4 text-label-muted" />
      </button>
    );
  }

  return (
    <aside className="shell-right-panel flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-primary" />
          <span className="text-engraved">LIVE FEED</span>
          {events.length > 0 && (
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          )}
        </div>
        <button onClick={onToggle} className="rail-icon w-6 h-6">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats Row — CNC gauge cluster */}
      <div className="grid grid-cols-3 gap-2 p-3 border-b border-border">
        <GaugeCell icon={Zap} label="Events" value={events.length.toString()} />
        <GaugeCell icon={Clock} label="Uptime" value="--" />
        <GaugeCell icon={Hash} label="Tasks" value="--" />
      </div>

      {/* Event Stream */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-2 space-y-1">
          {events.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-5 h-5 text-label-engraved mx-auto mb-2" />
              <span className="text-engraved">AWAITING EVENTS</span>
            </div>
          ) : (
            events.slice(-50).map((event, i) => (
              <EventRow key={i} event={event} />
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function GaugeCell({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="surface-well rounded p-2 text-center">
      <Icon className="w-3 h-3 text-primary mx-auto mb-1" />
      <div className="text-xs font-mono font-semibold text-label-primary">{value}</div>
      <div className="text-engraved">{label}</div>
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
