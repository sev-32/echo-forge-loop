import { useState } from 'react';
import { AIMChat } from '@/components/AIMChat';
import { SystemSidebar } from '@/components/SystemSidebar';
import { TaskQueuePanel } from '@/components/TaskQueuePanel';
import { EventLogPanel } from '@/components/EventLogPanel';
import { BudgetPanel } from '@/components/BudgetPanel';
import { ContextPanel } from '@/components/ContextPanel';
import { JournalPanel } from '@/components/JournalPanel';
import { TestAuditPanel } from '@/components/TestAuditPanel';
import { AgentPanel } from '@/components/AgentPanel';
import { RegressionDashboard } from '@/components/RegressionDashboard';
import { KnowledgeGraphPanel } from '@/components/KnowledgeGraphPanel';
import { RunHistoryPanel } from '@/components/RunHistoryPanel';
import { MemoryPanel } from '@/components/MemoryPanel';
import { TrustPanel } from '@/components/TrustPanel';
import { OrchestrationPanel } from '@/components/OrchestrationPanel';
import { CognitionPanel } from '@/components/CognitionPanel';
import { EvolutionPanel } from '@/components/EvolutionPanel';
import { SwarmPanel } from '@/components/SwarmPanel';
import { MissionPanel } from '@/components/MissionPanel';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MessageSquare, Brain, Bot, BarChart3,
  Network, Activity, FlaskConical, BookOpen, PanelRightOpen, PanelRightClose,
  History, Database, ShieldCheck, Workflow, GitBranch, Layers, Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="bg-card border-b border-border px-3 py-1.5 flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Brain className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <h1 className="text-xs font-bold gradient-text">AIM-OS</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="bg-transparent h-7 gap-0 p-0">
            {[
              { value: 'chat', icon: MessageSquare, label: 'Chat' },
              { value: 'history', icon: History, label: 'Runs' },
              { value: 'memory', icon: Database, label: 'Memory' },
              { value: 'trust', icon: ShieldCheck, label: 'Trust' },
              { value: 'orchestration', icon: Workflow, label: 'APOE' },
              { value: 'knowledge', icon: Network, label: 'Evidence' },
              { value: 'cognition', icon: Brain, label: 'Cognition' },
              { value: 'evolution', icon: GitBranch, label: 'Evolution' },
              { value: 'swarm', icon: Layers, label: 'Swarm' },
              { value: 'journal', icon: BookOpen, label: 'Journal' },
              { value: 'events', icon: Activity, label: 'Events' },
              { value: 'tests', icon: FlaskConical, label: 'Tests' },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="text-[10px] gap-1 px-2 py-1 h-6 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md"
              >
                <tab.icon className="h-3 w-3" /> {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Hide system panel' : 'Show system panel'}
        >
          {sidebarOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
        </Button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && <AIMChat />}
          {activeTab === 'history' && <RunHistoryPanel />}
          {activeTab === 'memory' && <MemoryPanel />}
          {activeTab === 'trust' && <TrustPanel />}
          {activeTab === 'orchestration' && <OrchestrationPanel />}
          {activeTab === 'knowledge' && <KnowledgeGraphPanel />}
          {activeTab === 'cognition' && <CognitionPanel />}
          {activeTab === 'evolution' && <EvolutionPanel />}
          {activeTab === 'swarm' && <div className="h-full p-3"><SwarmPanel /></div>}
          {activeTab === 'journal' && <div className="h-full p-3"><JournalPanel /></div>}
          {activeTab === 'events' && <div className="h-full p-3"><EventLogPanel /></div>}
          {activeTab === 'tests' && (
            <div className="h-full p-3 grid grid-cols-2 gap-3">
              <TestAuditPanel />
            </div>
          )}
        </div>

        {sidebarOpen && (
          <div className="w-72 flex-shrink-0">
            <SystemSidebar />
          </div>
        )}
      </div>
    </div>
  );
}
