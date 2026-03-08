import { useAgents } from '@/hooks/use-agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Play, Square, AlertTriangle, CheckCircle, TrendingUp, Lightbulb, Activity, Shield, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AgentFeedback } from '@/lib/ai-agents';

const severityColors: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-muted-foreground',
  info: 'text-primary',
};

const typeIcons: Record<string, typeof Activity> = {
  audit: Shield,
  improvement: TrendingUp,
  alert: AlertTriangle,
  suggestion: Lightbulb,
  metric: Activity,
};

function FeedbackItem({ item }: { item: AgentFeedback }) {
  const Icon = typeIcons[item.type] || Activity;
  const color = severityColors[item.severity] || 'text-muted-foreground';
  const time = new Date(item.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="border-b border-border/50 px-3 py-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2">
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate">{item.title}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{item.agent_name}</Badge>
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{time}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-3">{item.content}</p>
          {item.actionable && !item.action_taken && (
            <Badge variant="secondary" className="text-[10px] mt-1">Actionable</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentPanel() {
  const { feedback, agents, running, lastAudit, startAgents, stopAgents, toggleAgent, clearFeedback } = useAgents();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [feedback.length]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Autonomous Agents</span>
        <Badge variant={running ? 'default' : 'secondary'} className="text-[10px] ml-1">
          {running ? 'Running' : 'Stopped'}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          {!running ? (
            <Button size="sm" variant="outline" onClick={startAgents} className="gap-1 h-7 text-xs">
              <Play className="h-3 w-3" /> Start
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={stopAgents} className="gap-1 h-7 text-xs">
              <Square className="h-3 w-3" /> Stop
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clearFeedback} className="h-7 w-7 p-0">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Health Scores */}
      {lastAudit && (
        <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${lastAudit.health_score >= 70 ? 'bg-green-500' : lastAudit.health_score >= 40 ? 'bg-yellow-500' : 'bg-destructive'}`} />
            <span className="text-xs">Health: <strong>{lastAudit.health_score}</strong>/100</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-primary" />
            <span className="text-xs">Evolution: <strong>{lastAudit.evolution_score}</strong>/100</span>
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto">{lastAudit.findings?.length || 0} findings</span>
        </div>
      )}

      {/* Agent List */}
      <div className="px-3 py-2 border-b border-border space-y-1">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-2 text-xs">
            <Switch checked={a.enabled} onCheckedChange={() => toggleAgent(a.id)} className="scale-75" />
            <span className={a.enabled ? 'text-foreground' : 'text-muted-foreground'}>{a.name}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">{Math.round(a.intervalMs / 1000)}s</Badge>
          </div>
        ))}
      </div>

      {/* Feedback Stream */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        {feedback.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No feedback yet. Start agents to begin self-auditing.
          </div>
        ) : (
          feedback.map(fb => <FeedbackItem key={fb.id} item={fb} />)
        )}
      </ScrollArea>
    </div>
  );
}
