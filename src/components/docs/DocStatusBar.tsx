import { DocumentMeta, DocStatus, WritingStyle } from './types';

interface DocStatusBarProps {
  doc: DocumentMeta | null;
  wordCount: number;
  blockCount: number;
  focusedBlockType?: string;
}

export function DocStatusBar({ doc, wordCount, blockCount, focusedBlockType }: DocStatusBarProps) {
  if (!doc) return null;

  const readTime = Math.max(1, Math.round(wordCount / 250));

  return (
    <div className="h-7 border-t border-border bg-background/80 backdrop-blur-sm flex items-center px-3 gap-4 text-[10px] font-mono text-label-muted">
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(doc.status)}`} />
        <span className="uppercase">{doc.status.replace('_', ' ')}</span>
      </span>
      <span>{wordCount.toLocaleString()} words</span>
      <span>{blockCount} blocks</span>
      <span>~{readTime} min read</span>
      {focusedBlockType && (
        <span className="text-primary/60 capitalize">{focusedBlockType}</span>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span className="capitalize">{doc.style}</span>
        <span>{new Date(doc.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

function getStatusColor(status: DocStatus): string {
  switch (status) {
    case 'draft': return 'bg-muted-foreground/40';
    case 'in_progress': return 'bg-primary';
    case 'review': return 'bg-yellow-500';
    case 'final': return 'bg-green-500';
    case 'archived': return 'bg-muted-foreground/20';
  }
}
