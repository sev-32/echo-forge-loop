import { useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { DocBlock } from './types';

interface BlockEditorProps {
  block: DocBlock;
  onUpdate: (id: string, updates: Partial<DocBlock>) => void;
  onAddAfter: (id: string, type?: DocBlock['type']) => string;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onFocus?: (id: string) => void;
  isFocused?: boolean;
}

export function BlockEditor({ block, onUpdate, onAddAfter, onRemove, onMove, onFocus, isFocused }: BlockEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.focus();
      // Place cursor at end
      const sel = window.getSelection();
      if (sel && ref.current.childNodes.length > 0) {
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [isFocused]);

  const handleInput = useCallback(() => {
    if (ref.current) {
      onUpdate(block.id, { content: ref.current.innerText });
    }
  }, [block.id, onUpdate]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddAfter(block.id);
    }
    if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault();
      onRemove(block.id);
    }
    if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault();
      onMove(block.id, 'up');
    }
    if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault();
      onMove(block.id, 'down');
    }
    // Block type shortcuts
    if (e.key === '/' && block.content === '') {
      // Show block type menu — handled by parent
    }
  }, [block.id, block.content, onAddAfter, onRemove, onMove]);

  const blockClasses = getBlockClasses(block);
  const placeholder = getPlaceholder(block);

  return (
    <div className="group relative flex items-start gap-2 py-0.5">
      {/* Drag handle + type indicator */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 -ml-6 absolute left-0">
        <button
          className="w-5 h-5 flex items-center justify-center text-label-muted/40 hover:text-label-muted cursor-grab rounded hover:bg-muted/50"
          title="Drag to reorder"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="8" cy="6" r="2"/><circle cx="16" cy="6" r="2"/>
            <circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>
            <circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={() => onFocus?.(block.id)}
          className={`outline-none ${blockClasses} empty:before:content-[attr(data-placeholder)] empty:before:text-label-muted/30 empty:before:pointer-events-none`}
          data-placeholder={placeholder}
          style={{ minHeight: block.type === 'heading' ? undefined : '1.5em' }}
        >
          {block.content}
        </div>
      </div>
    </div>
  );
}

function getBlockClasses(block: DocBlock): string {
  const level = (block.metadata?.level as number) || 1;
  switch (block.type) {
    case 'heading':
      if (level === 1) return 'text-2xl font-bold text-label-primary tracking-tight leading-tight';
      if (level === 2) return 'text-xl font-semibold text-label-primary leading-snug';
      if (level === 3) return 'text-lg font-medium text-label-primary';
      return 'text-base font-medium text-label-secondary';
    case 'paragraph':
      return 'text-sm text-label-primary leading-relaxed';
    case 'quote':
      return 'text-sm text-label-secondary italic border-l-2 border-primary/30 pl-4 py-1';
    case 'code':
      return 'text-xs font-mono bg-muted/30 rounded-md p-3 text-label-primary border border-border/50 whitespace-pre-wrap';
    case 'callout':
      return 'text-sm bg-primary/5 border border-primary/10 rounded-lg p-3 text-label-primary';
    case 'list':
      return 'text-sm text-label-primary pl-5 list-disc';
    case 'divider':
      return 'border-t border-border my-4 h-0';
    default:
      return 'text-sm text-label-primary';
  }
}

function getPlaceholder(block: DocBlock): string {
  const level = (block.metadata?.level as number) || 1;
  switch (block.type) {
    case 'heading':
      if (level === 1) return 'Document Title';
      return `Heading ${level}`;
    case 'paragraph': return "Type something, or press '/' for commands...";
    case 'quote': return 'Quote...';
    case 'code': return 'Code block...';
    case 'callout': return 'Callout...';
    case 'list': return 'List item...';
    default: return '';
  }
}
