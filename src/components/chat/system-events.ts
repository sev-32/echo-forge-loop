import { useState, useEffect } from 'react';
import type { SystemEvent } from './types';

let systemEvents: SystemEvent[] = [];
let systemEventListeners: Array<(events: SystemEvent[]) => void> = [];

export function emitSystemEvent(type: SystemEvent['type'], content: string, metadata?: Record<string, unknown>) {
  const evt: SystemEvent = { id: crypto.randomUUID(), timestamp: Date.now(), type, content, metadata };
  systemEvents = [...systemEvents.slice(-99), evt];
  systemEventListeners.forEach(fn => fn(systemEvents));
}

export function useSystemEvents() {
  const [events, setEvents] = useState<SystemEvent[]>(systemEvents);
  useEffect(() => {
    systemEventListeners.push(setEvents);
    return () => { systemEventListeners = systemEventListeners.filter(fn => fn !== setEvents); };
  }, []);
  return events;
}
