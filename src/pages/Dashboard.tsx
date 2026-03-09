import { useState } from 'react';
import { CognitiveShell } from '@/components/shell/CognitiveShell';
import { AIMChat } from '@/components/AIMChat';
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
        {activeTab === 'chat' && <AIMChat />}
        {activeTab === 'runs' && <RunHistoryPanel />}
        {activeTab === 'memory' && <MemoryPanel />}
        {activeTab === 'missions' && <MissionPanel />}
        {activeTab === 'swarm' && <div className="h-full p-3"><SwarmPanel /></div>}
        {activeTab === 'journal' && <div className="h-full p-3"><JournalPanel /></div>}
        {activeTab === 'cognition' && <CognitionPanel />}
        {activeTab === 'knowledge' && <KnowledgeGraphPanel />}
        {activeTab === 'trust' && (
          <div className="h-full p-3 grid grid-cols-2 gap-3">
            <TrustPanel />
            <TestAuditPanel />
          </div>
        )}
        {activeTab === 'persona' && (
          <div className="h-full p-3">
            <PersonaControlPanel />
          </div>
        )}
        {activeTab === 'evolution' && <EvolutionPanel />}
        {activeTab === 'context' && <ContextPanel />}
      </div>
    </CognitiveShell>
  );
}
