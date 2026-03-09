// ============================================
// Realtime Refresh Hook — triggers callback on table changes
// ============================================

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RealtimeRefreshOptions {
  tables: string[];
  events?: ('INSERT' | 'UPDATE' | 'DELETE')[];
  debounceMs?: number;
  enabled?: boolean;
}

/**
 * Subscribes to realtime postgres_changes on given tables
 * and calls `onRefresh` when changes occur (debounced).
 */
export function useRealtimeRefresh(
  onRefresh: () => void,
  options: RealtimeRefreshOptions
) {
  const { tables, events = ['INSERT', 'UPDATE'], debounceMs = 500, enabled = true } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const debouncedRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onRefresh, debounceMs);
  }, [onRefresh, debounceMs]);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const channelName = `rt-refresh-${tables.join('-')}`;
    let channel = supabase.channel(channelName);

    for (const table of tables) {
      for (const event of events) {
        channel = channel.on(
          'postgres_changes',
          { event, schema: 'public', table },
          debouncedRefresh
        );
      }
    }

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [tables.join(','), events.join(','), debouncedRefresh, enabled]);
}
