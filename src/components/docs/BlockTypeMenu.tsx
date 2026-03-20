import { DocBlock } from './types';

interface BlockTypeMenuProps {
  onSelect: (type: DocBlock['type'], metadata?: Record<string, unknown>) => void;
  onClose: () => void;
}

const BLOCK_TYPES: { type: DocBlock['type']; label: string; icon: string; desc: string; metadata?: Record<string, unknown> }[] = [
  { type: 'heading', label: 'Heading 1', icon: 'H1', desc: 'Large heading', metadata: { level: 1 } },
  { type: 'heading', label: 'Heading 2', icon: 'H2', desc: 'Medium heading', metadata: { level: 2 } },
  { type: 'heading', label: 'Heading 3', icon: 'H3', desc: 'Small heading', metadata: { level: 3 } },
  { type: 'paragraph', label: 'Paragraph', icon: '¶', desc: 'Plain text block' },
  { type: 'list', label: 'List', icon: '•', desc: 'Bullet list' },
  { type: 'quote', label: 'Quote', icon: '"', desc: 'Block quote' },
  { type: 'code', label: 'Code', icon: '</>', desc: 'Code block' },
  { type: 'callout', label: 'Callout', icon: '!', desc: 'Highlighted callout' },
  { type: 'divider', label: 'Divider', icon: '—', desc: 'Horizontal rule' },
];

export function BlockTypeMenu({ onSelect, onClose }: BlockTypeMenuProps) {
  return (
    <div className="absolute z-50 surface-float border border-border rounded-lg shadow-xl p-1 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-widest text-label-muted">Block Type</div>
      {BLOCK_TYPES.map((bt, i) => (
        <button
          key={`${bt.type}-${i}`}
          onClick={() => { onSelect(bt.type, bt.metadata); onClose(); }}
          className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-md text-left
            text-label-secondary hover:bg-muted/50 hover:text-label-primary transition-colors"
        >
          <span className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center text-xs font-mono text-label-muted">
            {bt.icon}
          </span>
          <div>
            <div className="text-[12px] font-medium">{bt.label}</div>
            <div className="text-[10px] text-label-muted">{bt.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
