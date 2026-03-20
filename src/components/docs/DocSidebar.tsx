import { DocumentMeta, DocStatus } from './types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

const STATUS_DOT: Record<DocStatus, string> = {
  draft: 'bg-muted-foreground/40',
  in_progress: 'bg-primary',
  review: 'hsl(var(--chart-4))',
  final: 'bg-green-500',
  archived: 'bg-muted-foreground/20',
};

interface DocSidebarProps {
  documents: DocumentMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function DocSidebar({ documents, activeId, onSelect, onCreate, onDelete }: DocSidebarProps) {
  return (
    <div className="h-full flex flex-col surface-well border-r border-border">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-label-muted">Documents</span>
        <button
          onClick={onCreate}
          className="w-6 h-6 rounded flex items-center justify-center text-label-muted hover:text-primary hover:bg-primary/10 transition-colors"
          title="New Document"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {/* Document List */}
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {documents.length === 0 && (
            <div className="px-3 py-8 text-center">
              <div className="text-2xl opacity-20 mb-2">📄</div>
              <p className="text-[11px] text-label-muted">No documents yet</p>
              <button onClick={onCreate} className="mt-2 text-[11px] text-primary hover:underline">Create one</button>
            </div>
          )}
          {documents.map(doc => (
            <button
              key={doc.id}
              onClick={() => onSelect(doc.id)}
              className={`w-full text-left px-2.5 py-2 rounded-md transition-all group
                ${activeId === doc.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50 border border-transparent'}`}
            >
              <div className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${STATUS_DOT[doc.status]}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-medium truncate ${activeId === doc.id ? 'text-primary' : 'text-label-primary'}`}>
                    {doc.title || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-label-muted">{doc.word_count}w</span>
                    <span className="text-[10px] text-label-muted">{format(new Date(doc.updated_at), 'MMM d')}</span>
                  </div>
                  {doc.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {doc.tags.slice(0, 3).map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-label-muted">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                  className="opacity-0 group-hover:opacity-100 text-label-muted hover:text-destructive transition-opacity w-5 h-5 flex items-center justify-center"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
