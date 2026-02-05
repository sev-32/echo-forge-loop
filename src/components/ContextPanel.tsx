import { Panel, Icons } from '@/components/ui/status-indicators';
import { useContext } from '@/hooks/use-orchestration';
import { ScrollArea } from '@/components/ui/scroll-area';
import { truncate, formatTokens } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ContextPanel() {
  const { pinnedContext, workingContext, artifacts, stats } = useContext();

  return (
    <Panel 
      title="Context Manager" 
      icon={<Icons.Database className="w-4 h-4" />}
      className="h-full"
      actions={
        <div className="flex items-center gap-3 text-xs font-mono">
          <span>{formatTokens(stats.pinned.tokens + stats.working.tokens)} tokens</span>
        </div>
      }
    >
      <Tabs defaultValue="pinned" className="h-full">
        <TabsList className="bg-surface-1 mb-4">
          <TabsTrigger value="pinned" className="text-xs">
            Pinned ({stats.pinned.count})
          </TabsTrigger>
          <TabsTrigger value="working" className="text-xs">
            Working ({stats.working.count})
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="text-xs">
            Artifacts ({stats.artifacts.count})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pinned" className="mt-0">
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {pinnedContext.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No pinned context</p>
              ) : (
                pinnedContext.map((item) => (
                  <ContextItem key={item.id} item={item} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="working" className="mt-0">
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {workingContext.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No working context</p>
              ) : (
                workingContext.map((item) => (
                  <ContextItem key={item.id} item={item} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="artifacts" className="mt-0">
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {artifacts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No artifacts</p>
              ) : (
                artifacts.map((artifact) => (
                  <div 
                    key={artifact.artifact_id}
                    className="p-2 bg-surface-1 rounded border border-border text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{artifact.name}</span>
                      <span className="text-muted-foreground">v{artifact.version}</span>
                    </div>
                    <div className="text-muted-foreground mt-1">
                      <span>{artifact.type}</span>
                      <span className="mx-2">•</span>
                      <span className="font-mono">{truncate(artifact.path, 30)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

interface ContextItemProps {
  item: {
    id: string;
    content: string;
    source: string;
    priority: number;
    tokens_estimate: number;
  };
}

function ContextItem({ item }: ContextItemProps) {
  return (
    <div className="p-2 bg-surface-1 rounded border border-border text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground">{item.source}</span>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>P{item.priority}</span>
          <span>{formatTokens(item.tokens_estimate)} tok</span>
        </div>
      </div>
      <p className="text-sm">{truncate(item.content, 100)}</p>
    </div>
  );
}
