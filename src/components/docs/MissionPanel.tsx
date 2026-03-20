import { useState } from 'react';
import { WritingStyle, DocMission, DocMissionSection } from './types';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DocMissionPanelProps {
  onGenerate: (mission: DocMission) => void;
  isActive: boolean;
}

export function DocMissionPanel({ onGenerate, isActive }: DocMissionPanelProps) {
  const [goal, setGoal] = useState('');
  const [style, setStyle] = useState<WritingStyle>('technical');
  const [mission, setMission] = useState<DocMission | null>(null);

  const startMission = () => {
    const m: DocMission = {
      id: crypto.randomUUID(),
      goal,
      style,
      sections: [],
      status: 'planning',
      progress: 0,
    };
    setMission(m);
    onGenerate(m);
  };

  return (
    <div className="h-full flex flex-col surface-well border-l border-border">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-widest text-label-muted">AI Mission</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {!mission ? (
            <>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-label-muted block mb-1.5">Goal</label>
                <textarea
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="Describe the document you want generated..."
                  className="w-full bg-muted/30 border border-border rounded-md px-3 py-2 text-sm text-label-primary placeholder:text-label-muted/30 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  rows={4}
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-label-muted block mb-1.5">Style</label>
                <div className="grid grid-cols-2 gap-1">
                  {(['academic', 'technical', 'casual', 'legal', 'creative', 'executive'] as WritingStyle[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={`px-2 py-1.5 rounded-md text-[11px] capitalize transition-all
                        ${style === s ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted/30 text-label-muted hover:bg-muted/50'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={startMission}
                disabled={!goal.trim()}
                className="w-full py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                ✦ Launch Mission
              </button>

              <div className="p-2.5 rounded-lg bg-muted/20 border border-border/50">
                <p className="text-[10px] text-label-muted leading-relaxed">
                  AI will plan sections, generate content for each, verify quality, and assemble a complete document. You can edit any section during or after generation.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${mission.status === 'complete' ? 'bg-green-500' : 'bg-primary animate-pulse'}`} />
                <span className="text-[11px] font-medium text-label-primary capitalize">{mission.status}</span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${mission.progress}%` }} />
              </div>

              <p className="text-[11px] text-label-muted">{mission.goal}</p>

              {mission.sections.map((sec, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] mt-0.5
                    ${sec.status === 'done' ? 'bg-green-500/20 text-green-500' : sec.status === 'generating' ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-label-muted'}`}>
                    {sec.status === 'done' ? '✓' : sec.status === 'generating' ? '◎' : i + 1}
                  </div>
                  <div>
                    <p className="text-[11px] text-label-primary font-medium">{sec.title}</p>
                    <p className="text-[10px] text-label-muted">{sec.brief}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
