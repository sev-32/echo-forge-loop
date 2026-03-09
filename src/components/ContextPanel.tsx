// ============================================
// Context Management Panel — Token budgets, pinned/working context, artifacts
// Upgraded with CNC instrument gauges
// ============================================

import { useContext } from '@/hooks/use-orchestration';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { GaugeRadial } from '@/components/ui/instruments';
import { truncate, formatTokens } from '@/lib/utils';
import { IconMemory, IconToken } from '@/components/icons';

export function ContextPanel() {
  const { pinnedContext, workingContext, artifacts, stats } = useContext();

  const totalTokens = stats.pinned.tokens + stats.working.tokens;
  const maxTokens = 128000; // model context window
  const tokenPct = Math.min(100, (totalTokens / maxTokens) * 100);

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <IconMemory className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-mono font-bold text-label-primary tracking-widest uppercase">Context Manager</span>
        <Badge variant="outline" className="text-[9px] font-mono ml-auto">
          {formatTokens(totalTokens)} / {formatTokens(maxTokens)} tokens
        </Badge>
      </div>

      {/* Gauge cluster */}
      <div className="flex items-center justify-around py-2 px-4 border border-border/50 rounded-lg bg-card/50">
        <GaugeRadial
          value={tokenPct}
          label="TOKEN BUDGET"
          sublabel={`${formatTokens(totalTokens)} used`}
          size={72}
        />
        <GaugeRadial
          value={stats.pinned.count > 0 ? 100 : 0}
          label="PINNED"
          sublabel={`${stats.pinned.count} items`}
          size={56}
          color="info"
          showTicks={false}
        />
        <GaugeRadial
          value={stats.working.count > 0 ? Math.min(100, stats.working.count * 20) : 0}
          label="WORKING"
          sublabel={`${stats.working.count} items`}
          size={56}
          color="warning"
          showTicks={false}
        />
        <GaugeRadial
          value={stats.artifacts.count > 0 ? Math.min(100, stats.artifacts.count * 25) : 0}
          label="ARTIFACTS"
          sublabel={`${stats.artifacts.count} refs`}
          size={56}
          color="success"
          showTicks={false}
        />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="pinned" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit">
          <TabsTrigger value="pinned" className="text-[10px]">
            Pinned ({stats.pinned.count})
          </TabsTrigger>
          <TabsTrigger value="working" className="text-[10px]">
            Working ({stats.working.count})
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="text-[10px]">
            Artifacts ({stats.artifacts.count})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pinned" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full">
            <div className="space-y-1.5">
              {pinnedContext.length === 0 ? (
                <EmptyState text="No pinned context" />
              ) : (
                pinnedContext.map((item) => <ContextItem key={item.id} item={item} />)
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="working" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full">
            <div className="space-y-1.5">
              {workingContext.length === 0 ? (
                <EmptyState text="No working context" />
              ) : (
                workingContext.map((item) => <ContextItem key={item.id} item={item} />)
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="artifacts" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full">
            <div className="space-y-1.5">
              {artifacts.length === 0 ? (
                <EmptyState text="No artifacts" />
              ) : (
                artifacts.map((artifact) => (
                  <div
                    key={artifact.artifact_id}
                    className="p-2 rounded border border-border/50 bg-card/50 text-[10px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-label-primary">{artifact.name}</span>
                      <Badge variant="outline" className="text-[8px] h-4">v{artifact.version}</Badge>
                    </div>
                    <div className="text-label-muted font-mono mt-0.5">
                      <span>{artifact.type}</span>
                      <span className="mx-1.5">·</span>
                      <span>{truncate(artifact.path, 30)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-[10px] font-mono text-label-muted uppercase tracking-wider">
      {text}
    </div>
  );
}

function ContextItem({ item }: { item: { id: string; content: string; source: string; priority: number; tokens_estimate: number } }) {
  return (
    <div className="p-2 rounded border border-border/50 bg-card/50 text-[10px]">
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-mono text-label-muted">{item.source}</span>
        <div className="flex items-center gap-2 font-mono text-label-muted">
          <span>P{item.priority}</span>
          <span className="flex items-center gap-0.5">
            <IconToken className="h-2.5 w-2.5" />
            {formatTokens(item.tokens_estimate)}
          </span>
        </div>
      </div>
      <p className="text-label-primary text-[10px] leading-relaxed">{truncate(item.content, 120)}</p>
    </div>
  );
}
