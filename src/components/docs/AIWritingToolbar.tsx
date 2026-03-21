import { useState } from 'react';
import { AI_WRITING_ACTIONS, AIWritingAction, WritingStyle } from './types';

interface AIWritingToolbarProps {
  selectedText: string;
  onAction: (action: AIWritingAction['type'], context: string) => void;
  currentStyle: WritingStyle;
  onStyleChange: (style: WritingStyle) => void;
  isProcessing: boolean;
}

const STYLES: { value: WritingStyle; label: string; icon: string }[] = [
  { value: 'academic', label: 'Academic', icon: '🎓' },
  { value: 'technical', label: 'Technical', icon: '⚙' },
  { value: 'casual', label: 'Casual', icon: '💬' },
  { value: 'legal', label: 'Legal', icon: '⚖' },
  { value: 'creative', label: 'Creative', icon: '✨' },
  { value: 'journalistic', label: 'Journalistic', icon: '📰' },
  { value: 'executive', label: 'Executive', icon: '📊' },
];

export function AIWritingToolbar({ selectedText, onAction, currentStyle, onStyleChange, isProcessing }: AIWritingToolbarProps) {
  const [showStyles, setShowStyles] = useState(false);

  return (
    <div className="border-b border-border bg-background/80 backdrop-blur-sm">
      {/* Main toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto">
        {/* Style selector */}
        <div className="relative">
          <button
            onClick={() => setShowStyles(!showStyles)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium
              bg-muted/50 hover:bg-muted text-label-secondary hover:text-label-primary transition-all"
          >
            <span>{STYLES.find(s => s.value === currentStyle)?.icon}</span>
            <span className="capitalize">{currentStyle}</span>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>

          {showStyles && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl p-1 min-w-[160px]">
              {STYLES.map(s => (
                <button
                  key={s.value}
                  onClick={() => { onStyleChange(s.value); setShowStyles(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] transition-colors
                    ${currentStyle === s.value ? 'bg-primary/10 text-primary' : 'text-label-secondary hover:bg-muted/50 hover:text-label-primary'}`}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* AI Actions */}
        {AI_WRITING_ACTIONS.map(action => (
          <button
            key={action.type}
            onClick={() => onAction(action.type, selectedText)}
            disabled={isProcessing}
            title={action.description}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-all
              ${isProcessing
                ? 'opacity-40 cursor-not-allowed'
                : 'text-label-muted hover:text-primary hover:bg-primary/10 active:scale-[0.97]'
              }`}
          >
            <span className="text-xs">{action.icon}</span>
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        ))}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="ml-auto flex items-center gap-2 text-[11px] text-primary">
            <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span>AI writing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
