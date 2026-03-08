import { useState } from 'react';
import { AIMChat } from '@/components/AIMChat';
import { TaskQueuePanel } from '@/components/TaskQueuePanel';
import { EventLogPanel } from '@/components/EventLogPanel';
import { BudgetPanel } from '@/components/BudgetPanel';
import { TestHarnessPanel } from '@/components/TestHarnessPanel';
import { ContextPanel } from '@/components/ContextPanel';
import { JournalPanel } from '@/components/JournalPanel';
import { TestAuditPanel } from '@/components/TestAuditPanel';
import { LiveActivityPanel } from '@/components/LiveActivityPanel';
import { AgentPanel } from '@/components/AgentPanel';
import { RegressionDashboard } from '@/components/RegressionDashboard';
import { KnowledgeGraphPanel } from '@/components/KnowledgeGraphPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, LayoutDashboard, Brain, Bot, BarChart3, Network, Activity, FlaskConical, ShieldCheck, BookOpen } from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Compact header */}
      <header className="bg-card border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-sm font-bold text-foreground">AIM-OS</h1>
          <Badge variant="outline" className="text-[10px] font-mono">Self-Evolving AI Operating System</Badge>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b border-border bg-card px-4">
            <TabsList className="bg-transparent h-9 gap-0">
              <TabsTrigger value="chat" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <MessageSquare className="h-3 w-3" /> Chat
              </TabsTrigger>
              <TabsTrigger value="orchestration" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <LayoutDashboard className="h-3 w-3" /> Tasks
              </TabsTrigger>
              <TabsTrigger value="agents" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <Bot className="h-3 w-3" /> Agents
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <Network className="h-3 w-3" /> Knowledge
              </TabsTrigger>
              <TabsTrigger value="journal" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <BookOpen className="h-3 w-3" /> Journal
              </TabsTrigger>
              <TabsTrigger value="regression" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <BarChart3 className="h-3 w-3" /> Regression
              </TabsTrigger>
              <TabsTrigger value="events" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <Activity className="h-3 w-3" /> Events
              </TabsTrigger>
              <TabsTrigger value="tests" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary">
                <FlaskConical className="h-3 w-3" /> Tests
              </TabsTrigger>
            </TabsList>
          </div>

          {/* CHAT - Primary interface */}
          <TabsContent value="chat" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-90px)]">
              <AIMChat />
            </div>
          </TabsContent>

          {/* Orchestration / Tasks */}
          <TabsContent value="orchestration" className="flex-1 mt-0 min-h-0">
            <div className="grid grid-cols-12 gap-4 h-[calc(100vh-90px)] p-4">
              <div className="col-span-5"><TaskQueuePanel /></div>
              <div className="col-span-4"><EventLogPanel /></div>
              <div className="col-span-3 space-y-4"><BudgetPanel /><ContextPanel /></div>
            </div>
          </TabsContent>

          {/* Agents */}
          <TabsContent value="agents" className="flex-1 mt-0 min-h-0 data-[state=inactive]:hidden" forceMount>
            <div className="h-[calc(100vh-90px)] border-t border-border"><AgentPanel /></div>
          </TabsContent>

          {/* Knowledge Graph */}
          <TabsContent value="knowledge" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-90px)]"><KnowledgeGraphPanel /></div>
          </TabsContent>

          {/* Journal */}
          <TabsContent value="journal" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-90px)] p-4"><JournalPanel /></div>
          </TabsContent>

          {/* Regression */}
          <TabsContent value="regression" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-90px)]"><RegressionDashboard /></div>
          </TabsContent>

          {/* Events */}
          <TabsContent value="events" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-90px)] p-4"><EventLogPanel /></div>
          </TabsContent>

          {/* Tests */}
          <TabsContent value="tests" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-90px)] p-4 grid grid-cols-2 gap-4">
              <TestHarnessPanel />
              <TestAuditPanel />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
