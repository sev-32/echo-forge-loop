import { useState } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Panel, EventTypeBadge, Icons } from '@/components/ui/status-indicators';
import { useEvents } from '@/hooks/use-orchestration';
import type { Event, EventType } from '@/types/orchestration';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

export function EventLogPanel() {
  const { events, verifyIntegrity } = useEvents();
  const [filter, setFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const filteredEvents = events.filter(event => {
    if (!filter) return true;
    const searchLower = filter.toLowerCase();
    return (
      event.type.toLowerCase().includes(searchLower) ||
      JSON.stringify(event.payload).toLowerCase().includes(searchLower)
    );
  });

  const integrity = verifyIntegrity();

  return (
    <Panel 
      title="Event Log" 
      icon={<Icons.Activity className="w-4 h-4" />}
      className="h-full flex flex-col"
      actions={
        <div className="flex items-center gap-3">
          <span className={cn(
            'text-xs font-mono flex items-center gap-1',
            integrity.valid ? 'text-status-success' : 'text-status-error'
          )}>
            {integrity.valid ? (
              <><Icons.CheckCircle2 className="w-3 h-3" /> Chain Valid</>
            ) : (
              <><Icons.XCircle className="w-3 h-3" /> Chain Broken</>
            )}
          </span>
          <span className="text-xs text-muted-foreground font-mono">{events.length} events</span>
        </div>
      }
    >
      <div className="flex flex-col h-full gap-4">
        <Input
          placeholder="Filter events..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-surface-1 border-border"
        />

        <div className="flex gap-4 flex-1 min-h-0">
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {filteredEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  {events.length === 0 ? 'No events recorded' : 'No matching events'}
                </p>
              ) : (
                [...filteredEvents].reverse().map((event) => (
                  <EventRow 
                    key={event.event_id} 
                    event={event}
                    isSelected={selectedEvent?.event_id === event.event_id}
                    onClick={() => setSelectedEvent(event)}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {selectedEvent && (
            <div className="w-80 border-l border-border pl-4">
              <EventDetails event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

interface EventRowProps {
  event: Event;
  isSelected: boolean;
  onClick: () => void;
}

function EventRow({ event, isSelected, onClick }: EventRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-3',
        isSelected 
          ? 'bg-surface-2' 
          : 'hover:bg-surface-1'
      )}
    >
      <span className="text-xs text-muted-foreground font-mono w-16 flex-shrink-0">
        {formatRelativeTime(event.timestamp)}
      </span>
      <EventTypeBadge type={event.type} />
      <span className="text-xs text-muted-foreground truncate flex-1">
        {getEventSummary(event)}
      </span>
    </button>
  );
}

function getEventSummary(event: Event): string {
  const payload = event.payload;
  
  switch (event.type) {
    case 'RUN_STARTED':
      return `Project: ${payload.project_id}`;
    case 'RUN_STOPPED':
      return `Reason: ${payload.reason}`;
    case 'PLAN_CREATED':
      return `Task: ${payload.task_id}`;
    case 'ACTION_EXECUTED':
      return `Action: ${payload.action}`;
    case 'TOOL_CALLED':
      return `Tool: ${payload.tool}`;
    case 'VERIFICATION_PASSED':
    case 'VERIFICATION_FAILED':
      return `Task: ${payload.task_id}`;
    case 'CHECKPOINT_CREATED':
      return `Reason: ${payload.reason}`;
    case 'QUEUE_MUTATION':
      return `Type: ${(payload.mutation as { type: string })?.type}`;
    case 'BUDGET_TICK':
      return `${payload.metric}: +${payload.delta}`;
    case 'BUDGET_EXHAUSTED':
      return 'Budget limit reached';
    case 'ERROR_RAISED':
      return `Error: ${payload.error}`;
    case 'STOP_REQUESTED':
      return `Reason: ${payload.reason}`;
    default:
      return JSON.stringify(payload).slice(0, 50);
  }
}

interface EventDetailsProps {
  event: Event;
  onClose: () => void;
}

function EventDetails({ event, onClose }: EventDetailsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <EventTypeBadge type={event.type} />
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.XCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Timestamp</label>
          <p className="text-sm font-mono">{new Date(event.timestamp).toLocaleString()}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Event ID</label>
          <p className="text-xs font-mono break-all">{event.event_id}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Run ID</label>
          <p className="text-xs font-mono break-all">{event.run_id}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Hash (Self)</label>
          <p className="text-xs font-mono break-all">{event.hash_self}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Hash (Previous)</label>
          <p className="text-xs font-mono break-all">{event.hash_prev}</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Payload</label>
          <pre className="mt-1 p-2 bg-code-bg rounded text-xs font-mono overflow-auto max-h-48">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
