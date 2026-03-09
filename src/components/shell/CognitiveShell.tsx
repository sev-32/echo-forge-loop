import { useState, useEffect, useCallback, ReactNode } from "react";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { BottomDock } from "./BottomDock";
import { CommandPalette } from "./CommandPalette";

interface CognitiveShellProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  systemStatus?: 'idle' | 'active' | 'processing' | 'error';
  runId?: string;
  iteration?: number;
  checkpoint?: string;
}

const TAB_SHORTCUTS: Record<string, string> = {
  '1': 'chat',
  '2': 'missions',
  '3': 'swarm',
  '4': 'runs',
  '5': 'memory',
  '6': 'journal',
  '7': 'cognition',
  '8': 'knowledge',
  '9': 'trust',
};

export function CognitiveShell({
  children,
  activeTab,
  onTabChange,
  systemStatus = 'idle',
  runId,
  iteration,
  checkpoint,
}: CognitiveShellProps) {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Keyboard shortcuts: 1-9 for nav (only when not typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tab = TAB_SHORTCUTS[e.key];
      if (tab) {
        e.preventDefault();
        onTabChange(tab);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onTabChange]);

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      {/* Command Palette */}
      <CommandPalette onNavigate={onTabChange} />

      {/* Top Bar - World Identity */}
      <TopBar systemStatus={systemStatus} runId={runId} />

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Rail - Page Ontology */}
        <LeftRail activeTab={activeTab} onTabChange={onTabChange} />

        {/* Page Content */}
        <main className="flex-1 min-w-0 overflow-hidden">
          {children}
        </main>

        {/* Right Panel - Persistent Intelligence */}
        <RightPanel isOpen={rightPanelOpen} onToggle={() => setRightPanelOpen(!rightPanelOpen)} />
      </div>

      {/* Bottom Dock - Process/History */}
      <BottomDock iteration={iteration} checkpoint={checkpoint} />
    </div>
  );
}
