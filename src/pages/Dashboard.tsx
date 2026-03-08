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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare, LayoutDashboard, Brain, Bot, BarChart3,
  Network, Activity, FlaskConical, BookOpen, PanelRightOpen, PanelRightClose,
  History
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="bg-card border-b border-border px-3 py-1.5 flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Brain className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <h1 className="text-xs font-bold gradient-text">AIM-OS</h1>
        </div>

        {/* Tabs as top navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="bg-transparent h-7 gap-0 p-0">
            {[
              { value: 'chat', icon: MessageSquare, label: 'Chat' },
              { value: 'tasks', icon: LayoutDashboard, label: 'Tasks' },
              { value: 'agents', icon: Bot, label: 'Agents' },
              { value: 'knowledge', icon: Network, label: 'Knowledge' },
              { value: 'journal', icon: BookOpen, label: 'Journal' },
              { value: 'regression', icon: BarChart3, label: 'Regression' },
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

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && <AIMChat />}
          {activeTab === 'tasks' && (
            <div className="grid grid-cols-12 gap-3 h-full p-3">
              <div className="col-span-5"><TaskQueuePanel /></div>
              <div className="col-span-4"><EventLogPanel /></div>
              <div className="col-span-3 space-y-3"><BudgetPanel /><ContextPanel /></div>
            </div>
          )}
          {activeTab === 'agents' && <AgentPanel />}
          {activeTab === 'knowledge' && <KnowledgeGraphPanel />}
          {activeTab === 'journal' && <div className="h-full p-3"><JournalPanel /></div>}
          {activeTab === 'regression' && <RegressionDashboard />}
          {activeTab === 'events' && <div className="h-full p-3"><EventLogPanel /></div>}
          {activeTab === 'tests' && (
            <div className="h-full p-3 grid grid-cols-2 gap-3">
              <TestAuditPanel />
            </div>
          )}
        </div>

        {/* System sidebar */}
        {sidebarOpen && (
          <div className="w-72 flex-shrink-0">
            <SystemSidebar />
          </div>
        )}
      </div>
    </div>
  );
}
