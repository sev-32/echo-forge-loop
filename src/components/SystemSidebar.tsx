import { useState, useEffect, useRef } from 'react';
import { Activity, Zap, Database, NetworkIcon, BookOpen, CheckCircle2, XCircle, Target, Shield, Sparkles, Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSystemEvents, type SystemEvent } from '@/components/AIMChat';
import { supabase } from '@/integrations/supabase/client';

const eventTypeConfig: Record<string, { icon: typeof Activity; color: string }> = {
  plan: { icon: Target, color: 'text-primary' },
  task_start: { icon: Zap, color: 'text-accent' },
  task_done: { icon: CheckCircle2, color: 'text-[hsl(var(--status-success))]' },
  task_fail: { icon: XCircle, color: 'text-destructive' },
  verify: { icon: Shield, color: 'text-[hsl(var(--status-warning))]' },
  reflect: { icon: Sparkles, color: 'text-accent' },
  knowledge: { icon: Database, color: 'text-[hsl(var(--status-info))]' },
  complete: { icon: CheckCircle2, color: 'text-[hsl(var(--status-success))]' },
  error: { icon: XCircle, color: 'text-destructive' },
};

export function SystemSidebar() {
  const events = useSystemEvents();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ tasks: 0, events: 0, nodes: 0, journals: 0 });

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length]);

  // Fetch live stats periodically
  useEffect(() => {
    const fetchStats = async () => {
      const [tasks, evts, nodes, journals] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }),
        supabase.from('knowledge_nodes').select('id', { count: 'exact', head: true }),
        supabase.from('journal_entries').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        tasks: tasks.count || 0,
        events: evts.count || 0,
        nodes: nodes.count || 0,
        journals: journals.count || 0,
      });
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">System Activity</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto font-mono">{events.length}</Badge>
        </div>
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-2 gap-px bg-border">
        {[
          { label: 'Tasks', value: stats.tasks, icon: Target, color: 'text-primary' },
          { label: 'Events', value: stats.events, icon: Activity, color: 'text-accent' },
          { label: 'Knowledge', value: stats.nodes, icon: Database, color: 'text-[hsl(var(--status-info))]' },
          { label: 'Journal', value: stats.journals, icon: BookOpen, color: 'text-[hsl(var(--status-warning))]' },
        ].map((s, i) => (
          <div key={i} className="bg-card px-3 py-2 flex items-center gap-2">
            <s.icon className={`h-3 w-3 ${s.color}`} />
            <div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
              <div className="text-xs font-bold text-foreground font-mono">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Event stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Brain className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-[10px] text-muted-foreground">No activity yet. Give AIM-OS a goal to see the system working.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {events.map((evt) => {
              const cfg = eventTypeConfig[evt.type] || eventTypeConfig.plan;
              const Icon = cfg.icon;
              return (
                <div key={evt.id} className="px-3 py-2 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start gap-2">
                    <Icon className={`h-3 w-3 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-secondary-foreground leading-relaxed">{evt.content}</p>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
