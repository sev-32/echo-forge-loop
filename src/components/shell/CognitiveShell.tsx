import { useState, ReactNode } from "react";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { BottomDock } from "./BottomDock";

interface CognitiveShellProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  systemStatus?: 'idle' | 'active' | 'processing' | 'error';
  runId?: string;
  iteration?: number;
  checkpoint?: string;
}

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

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
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
