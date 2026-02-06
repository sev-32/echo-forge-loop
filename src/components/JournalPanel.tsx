import { useState } from 'react';
import { cn, truncate, formatRelativeTime } from '@/lib/utils';
import { Panel, Icons } from '@/components/ui/status-indicators';
import { useJournal, useContextBanks, usePlans } from '@/hooks/use-journal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import type { JournalEntry, JournalEntryType, JournalPriority, ContextBank } from '@/lib/journal';

const ENTRY_TYPE_ICONS: Record<JournalEntryType, string> = {
  plan: '📋', reflection: '🪞', discovery: '💡', decision: '⚖️',
  hypothesis: '🔬', observation: '👁️', correction: '🔧',
  synthesis: '🧬', bookmark: '🔖', process_note: '📝',
};

const PRIORITY_COLORS: Record<JournalPriority, string> = {
  critical: 'text-status-error', high: 'text-status-warning',
  medium: 'text-foreground', low: 'text-muted-foreground',
};

export function JournalPanel() {
  const { entries, tags, stats, createEntry, searchEntries } = useJournal();
  const { banks, createBank, addEntry: addBankEntry } = useContextBanks();
  const { plans, createPlan } = usePlans();
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [filterType, setFilterType] = useState<JournalEntryType | 'all'>('all');

  const filteredEntries = search
    ? searchEntries(search)
    : filterType === 'all'
      ? entries
      : entries.filter(e => e.type === filterType);

  return (
    <Panel
      title="AI Journal"
      icon={<span className="text-lg">📓</span>}
      className="h-full flex flex-col"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{stats.total_entries} entries</span>
          <CreateEntryDialog onCreate={createEntry} />
        </div>
      }
    >
      <Tabs defaultValue="entries" className="h-full flex flex-col">
        <TabsList className="bg-surface-1 mb-3">
          <TabsTrigger value="entries" className="text-xs">Entries</TabsTrigger>
          <TabsTrigger value="banks" className="text-xs">Context Banks ({banks.length})</TabsTrigger>
          <TabsTrigger value="plans" className="text-xs">Plans ({plans.length})</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs">Knowledge ({stats.kg_nodes})</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="flex-1 mt-0 min-h-0 flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search journal..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-surface-1 border-border flex-1"
            />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as JournalEntryType | 'all')}
              className="bg-surface-1 border border-border rounded px-2 text-xs text-foreground"
            >
              <option value="all">All Types</option>
              {Object.keys(ENTRY_TYPE_ICONS).map(type => (
                <option key={type} value={type}>{ENTRY_TYPE_ICONS[type as JournalEntryType]} {type}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 flex-1 min-h-0">
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {filteredEntries.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No journal entries</p>
                ) : (
                  filteredEntries.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded transition-colors flex items-start gap-2',
                        selectedEntry?.id === entry.id ? 'bg-surface-2' : 'hover:bg-surface-1'
                      )}
                    >
                      <span className="text-sm flex-shrink-0 mt-0.5">{ENTRY_TYPE_ICONS[entry.type]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-medium truncate', PRIORITY_COLORS[entry.priority])}>
                            {entry.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{formatRelativeTime(entry.created_at)}</span>
                          {entry.tags.length > 0 && (
                            <span className="truncate">{entry.tags.slice(0, 3).join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>

            {selectedEntry && (
              <div className="w-80 border-l border-border pl-3">
                <EntryDetail entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="banks" className="flex-1 mt-0">
          <ContextBanksView banks={banks} onCreate={createBank} onAddEntry={addBankEntry} />
        </TabsContent>

        <TabsContent value="plans" className="flex-1 mt-0">
          <PlansView plans={plans} onCreate={createPlan} />
        </TabsContent>

        <TabsContent value="knowledge" className="flex-1 mt-0">
          <KnowledgeView stats={stats} />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function EntryDetail({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span>{ENTRY_TYPE_ICONS[entry.type]}</span>
          <h4 className="font-semibold text-sm">{entry.title}</h4>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.XCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {entry.tags.map(tag => (
          <span key={tag} className="text-xs px-1.5 py-0.5 bg-surface-2 rounded border border-border">{tag}</span>
        ))}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>Type: <span className="text-foreground capitalize">{entry.type}</span></div>
        <div>Priority: <span className={PRIORITY_COLORS[entry.priority]}>{entry.priority}</span></div>
        <div>Created: {formatRelativeTime(entry.created_at)}</div>
        <div>Tokens: ~{entry.tokens_estimate}</div>
        {entry.run_id && <div>Run: <span className="font-mono">{entry.run_id.slice(0, 8)}...</span></div>}
        {entry.references.length > 0 && <div>References: {entry.references.length}</div>}
        {entry.children_ids.length > 0 && <div>Replies: {entry.children_ids.length}</div>}
      </div>

      <div className="border-t border-border pt-2">
        <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">{entry.content}</pre>
      </div>
    </div>
  );
}

function ContextBanksView({
  banks, onCreate, onAddEntry,
}: {
  banks: ContextBank[];
  onCreate: (name: string, description: string) => void;
  onAddEntry: (bankId: string, content: string, source: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3">
        {banks.length === 0 && !creating && (
          <p className="text-muted-foreground text-sm text-center py-4">No context banks. Create one to organize persistent knowledge.</p>
        )}

        {banks.map(bank => (
          <div key={bank.id} className="p-3 bg-surface-1 rounded border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{bank.name}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {bank.current_tokens}/{bank.max_tokens} tok
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{bank.description}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{bank.entries.length} entries</span>
              {bank.auto_prune && <span>• auto-prune</span>}
            </div>
            <div className="h-1.5 bg-surface-2 rounded mt-2 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded transition-all',
                  bank.current_tokens / bank.max_tokens > 0.9 ? 'bg-budget-critical'
                    : bank.current_tokens / bank.max_tokens > 0.7 ? 'bg-budget-warning'
                    : 'bg-budget-safe'
                )}
                style={{ width: `${Math.min(100, (bank.current_tokens / bank.max_tokens) * 100)}%` }}
              />
            </div>
          </div>
        ))}

        {creating ? (
          <div className="p-3 bg-surface-1 rounded border border-border space-y-2">
            <Input placeholder="Bank name" value={name} onChange={e => setName(e.target.value)} className="bg-surface-2" />
            <Input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} className="bg-surface-2" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onCreate(name, desc); setCreating(false); setName(''); setDesc(''); }} disabled={!name}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="w-full">
            + New Context Bank
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}

function PlansView({ plans, onCreate }: { plans: import('@/lib/journal').PlanNode[]; onCreate: (title: string, desc: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  const statusColors: Record<string, string> = {
    planned: 'text-muted-foreground', in_progress: 'text-status-active',
    completed: 'text-status-success', abandoned: 'text-status-error', blocked: 'text-status-warning',
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2">
        {plans.length === 0 && !creating && (
          <p className="text-muted-foreground text-sm text-center py-4">No plans. Create a plan to structure work.</p>
        )}

        {plans.map(plan => (
          <div key={plan.id} className="p-3 bg-surface-1 rounded border border-border">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{plan.title}</span>
              <span className={cn('text-xs capitalize', statusColors[plan.status])}>{plan.status}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{truncate(plan.description, 80)}</p>
            {plan.notes.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {plan.notes.length} notes • {plan.estimated_effort}
              </div>
            )}
          </div>
        ))}

        {creating ? (
          <div className="p-3 bg-surface-1 rounded border border-border space-y-2">
            <Input placeholder="Plan title" value={title} onChange={e => setTitle(e.target.value)} className="bg-surface-2" />
            <Input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} className="bg-surface-2" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onCreate(title, desc); setCreating(false); setTitle(''); setDesc(''); }} disabled={!title}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="w-full">
            + New Plan
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}

function KnowledgeView({ stats }: { stats: ReturnType<import('@/lib/journal').JournalManager['getStats']> }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-surface-1 rounded border border-border text-center">
          <div className="text-2xl font-bold font-mono text-primary">{stats.kg_nodes}</div>
          <div className="text-xs text-muted-foreground">Knowledge Nodes</div>
        </div>
        <div className="p-3 bg-surface-1 rounded border border-border text-center">
          <div className="text-2xl font-bold font-mono text-accent">{stats.kg_edges}</div>
          <div className="text-xs text-muted-foreground">Relationships</div>
        </div>
        <div className="p-3 bg-surface-1 rounded border border-border text-center">
          <div className="text-2xl font-bold font-mono">{stats.total_tags}</div>
          <div className="text-xs text-muted-foreground">Tags</div>
        </div>
        <div className="p-3 bg-surface-1 rounded border border-border text-center">
          <div className="text-2xl font-bold font-mono">{stats.context_banks}</div>
          <div className="text-xs text-muted-foreground">Context Banks</div>
        </div>
      </div>

      <div className="p-3 bg-surface-1 rounded border border-border">
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Entries by Type</h4>
        <div className="space-y-1">
          {Object.entries(stats.by_type).map(([type, count]) => (
            <div key={type} className="flex items-center justify-between text-xs">
              <span>{ENTRY_TYPE_ICONS[type as JournalEntryType]} {type}</span>
              <span className="font-mono">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateEntryDialog({ onCreate }: {
  onCreate: (type: JournalEntryType, title: string, content: string, options?: { tags?: string[]; priority?: JournalPriority }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<JournalEntryType>('observation');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [priority, setPriority] = useState<JournalPriority>('medium');

  const handleSubmit = () => {
    if (!title || !content) return;
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
    onCreate(type, title, content, { tags, priority });
    setTitle(''); setContent(''); setTagsStr(''); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Icons.FileText className="w-3 h-3 mr-1" /> New</Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
          <DialogDescription>Record a thought, decision, or discovery.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <select value={type} onChange={e => setType(e.target.value as JournalEntryType)} className="bg-surface-1 border border-border rounded px-2 py-1 text-sm text-foreground flex-1">
              {Object.entries(ENTRY_TYPE_ICONS).map(([t, icon]) => (
                <option key={t} value={t}>{icon} {t}</option>
              ))}
            </select>
            <select value={priority} onChange={e => setPriority(e.target.value as JournalPriority)} className="bg-surface-1 border border-border rounded px-2 py-1 text-sm text-foreground">
              <option value="critical">🔴 Critical</option>
              <option value="high">🟠 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">⚪ Low</option>
            </select>
          </div>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
          <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Content..." rows={5} />
          <Input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="Tags (comma-separated)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title || !content}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
