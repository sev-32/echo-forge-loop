import { useState } from 'react';
import { CognitiveShell } from '@/components/shell/CognitiveShell';
import { PanelErrorBoundary } from '@/components/shell/ErrorBoundary';
import { AIMChat } from '@/components/AIMChat';
import { DeepResearchPanel } from '@/components/DeepResearchPanel';
import { RunHistoryPanel } from '@/components/RunHistoryPanel';
import { MemoryPanel } from '@/components/MemoryPanel';
import { MissionPanel } from '@/components/MissionPanel';
import { SwarmPanel } from '@/components/SwarmPanel';
import { JournalPanel } from '@/components/JournalPanel';
import { CognitionPanel } from '@/components/CognitionPanel';
import { KnowledgeGraphPanel } from '@/components/KnowledgeGraphPanel';
import { TrustPanel } from '@/components/TrustPanel';
import { TestAuditPanel } from '@/components/TestAuditPanel';
import { PersonaControlPanel } from '@/components/PersonaControlPanel';
import { EvolutionPanel } from '@/components/EvolutionPanel';
import { ContextPanel } from '@/components/ContextPanel';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <CognitiveShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      systemStatus="idle"
    >
      <div className="h-full overflow-auto">
        <PanelErrorBoundary fallbackTitle="Chat">
          {activeTab === 'chat' && <AIMChat />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Deep Research">
          {activeTab === 'research' && <DeepResearchPanel />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Run History">
          {activeTab === 'runs' && <RunHistoryPanel />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Memory">
          {activeTab === 'memory' && <MemoryPanel />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Missions">
          {activeTab === 'missions' && <MissionPanel />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Swarm">
          {activeTab === 'swarm' && <div className="h-full p-3"><SwarmPanel /></div>}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Journal">
          {activeTab === 'journal' && <div className="h-full p-3"><JournalPanel /></div>}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Cognition">
          {activeTab === 'cognition' && <CognitionPanel />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Knowledge Graph">
          {activeTab === 'knowledge' && <KnowledgeGraphPanel />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Trust">
          {activeTab === 'trust' && (
            <div className="h-full p-3 grid grid-cols-2 gap-3">
              <TrustPanel />
              <TestAuditPanel />
            </div>
          )}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Persona">
          {activeTab === 'persona' && (
            <div className="h-full p-3">
              <PersonaControlPanel />
            </div>
          )}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Evolution">
          {activeTab === 'evolution' && <EvolutionPanel />}
        </PanelErrorBoundary>
        <PanelErrorBoundary fallbackTitle="Context">
          {activeTab === 'context' && <ContextPanel />}
        </PanelErrorBoundary>
      </div>
    </CognitiveShell>
  );
}
