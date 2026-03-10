import { useState, useEffect, ReactNode } from "react";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { RightDrawerBar } from "./RightDrawerBar";
import { BottomDock } from "./BottomDock";
import { CommandPalette } from "./CommandPalette";
import { LiveFeedDrawer } from "@/components/drawers/LiveFeedDrawer";
import { ChatDrawer } from "@/components/drawers/ChatDrawer";
import { RunHistoryDrawer } from "@/components/drawers/RunHistoryDrawer";
import { VisualInspectorDrawer } from "@/components/drawers/VisualInspectorDrawer";

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
  '2': 'ide',
  '3': 'research',
  '4': 'missions',
  '5': 'swarm',
  '6': 'runs',
  '7': 'memory',
  '8': 'cognition',
  '9': 'knowledge',
  '0': 'persona',
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

        {/* Right Drawer Bar - Multi-drawer system */}
        <RightDrawerBar renderDrawer={(drawerId) => {
          switch (drawerId) {
            case 'live-feed': return <LiveFeedDrawer />;
            case 'ai-chat': return <ChatDrawer />;
            case 'memory':
              return (
                <div className="h-full flex flex-col">
                  <div className="panel-header"><span className="text-engraved">MEMORY FABRIC</span></div>
                  <div className="flex-1 flex items-center justify-center text-label-muted text-xs">
                    <div className="text-center"><div className="text-2xl mb-2 opacity-30">🧠</div><div>Memory drawer — coming soon</div></div>
                  </div>
                </div>
              );
            case 'knowledge':
              return (
                <div className="h-full flex flex-col">
                  <div className="panel-header"><span className="text-engraved">EVIDENCE GRAPH</span></div>
                  <div className="flex-1 flex items-center justify-center text-label-muted text-xs">
                    <div className="text-center"><div className="text-2xl mb-2 opacity-30">🔗</div><div>Knowledge drawer — coming soon</div></div>
                  </div>
                </div>
              );
            case 'cognition':
              return (
                <div className="h-full flex flex-col">
                  <div className="panel-header"><span className="text-engraved">COGNITION</span></div>
                  <div className="flex-1 flex items-center justify-center text-label-muted text-xs">
                    <div className="text-center"><div className="text-2xl mb-2 opacity-30"></div><div>Cognition drawer — coming soon</div></div>
                  </div>
                </div>
              );
            case 'run-history': return <RunHistoryDrawer />;
            case 'visual': return <VisualInspectorDrawer />;
            case 'terminal':
              return (
                <div className="h-full flex flex-col">
                  <div className="panel-header"><span className="text-engraved">TERMINAL</span></div>
                  <div className="flex-1 flex items-center justify-center text-label-muted text-xs">
                    <div className="text-center"><div className="text-2xl mb-2 opacity-30">▶</div><div>Terminal drawer — coming soon</div></div>
                  </div>
                </div>
              );
            default: return null;
          }
        }} />

      </div>

      {/* Bottom Dock - Process/History */}
      <BottomDock iteration={iteration} checkpoint={checkpoint} />
    </div>
  );
}
