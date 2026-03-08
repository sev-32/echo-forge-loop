// ============================================
// Live AI Activity Panel
// ============================================

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Activity, Brain, CheckCircle, AlertTriangle, Lightbulb, Zap, Target, DollarSign, PlusCircle } from 'lucide-react';
import type { ActivityEntry } from '@/lib/ai-kernel';

interface LiveActivityPanelProps {
  activities: ActivityEntry[];
}

const typeConfig: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  plan: { icon: Brain, color: 'text-blue-400', label: 'Plan' },
  execute: { icon: Zap, color: 'text-emerald-400', label: 'Execute' },
  verify: { icon: CheckCircle, color: 'text-green-400', label: 'Verify' },
  reflect: { icon: Lightbulb, color: 'text-amber-400', label: 'Reflect' },
  discover: { icon: Target, color: 'text-purple-400', label: 'Discovery' },
  error: { icon: AlertTriangle, color: 'text-red-400', label: 'Error' },
  checkpoint: { icon: Activity, color: 'text-cyan-400', label: 'Checkpoint' },
  task_created: { icon: PlusCircle, color: 'text-indigo-400', label: 'Task' },
  budget: { icon: DollarSign, color: 'text-yellow-400', label: 'Budget' },
};

export function LiveActivityPanel({ activities }: LiveActivityPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Live AI Activity</span>
        <Badge variant="outline" className="ml-auto text-xs">{activities.length}</Badge>
      </div>
      <ScrollArea className="flex-1 p-2" ref={scrollRef}>
        <div className="space-y-1">
          {activities.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No activity yet. Start a run to see live AI reasoning.</p>
          )}
          {activities.map((a) => {
            const cfg = typeConfig[a.type] || typeConfig.execute;
            const Icon = cfg.icon;
            const timeStr = new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return (
              <div key={a.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono font-bold uppercase ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{timeStr}</span>
                  </div>
                  <p className="text-xs text-foreground/90 leading-tight break-words">{a.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
