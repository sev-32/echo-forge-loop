import { IconHistory, IconAdd, IconTrash, IconSearch } from '@/components/icons';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';
import type { Conversation } from './types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ConversationSidebar({ conversations, activeId, onSelect, onNew, onDelete }: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-56 flex-shrink-0 border-r border-border flex flex-col bg-card/30">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-1.5">
          <IconHistory size={14} className="text-primary" />
          <span className="text-engraved">CONVERSATIONS</span>
        </div>
        <button onClick={onNew} className="rail-icon w-6 h-6" title="New conversation">
          <IconAdd size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="flex items-center gap-1.5 surface-well rounded px-2 py-1">
          <IconSearch size={12} className="text-label-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[10px] font-mono text-label-primary placeholder:text-label-engraved outline-none"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-center py-6">
              <span className="text-engraved">NO CONVERSATIONS</span>
            </div>
          ) : (
            filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full text-left px-2.5 py-2 rounded group transition-all ${activeId === conv.id ? 'surface-raised amber-glow' : 'hover:surface-well'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium truncate flex-1 ${activeId === conv.id ? 'text-label-primary' : 'text-label-secondary'
                    }`}>
                    {conv.title}
                  </span>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDelete(conv.id); } }}
                    className="opacity-0 group-hover:opacity-100 rail-icon w-4 h-4 flex-shrink-0 cursor-pointer"
                  >
                    <IconTrash size={10} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[8px] font-mono text-label-engraved">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </span>
                  {conv.total_tokens > 0 && (
                    <span className="text-[8px] font-mono text-label-engraved">{conv.total_tokens.toLocaleString()} tok</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
