import { useState } from 'react';
import { ControlPanel } from '@/components/ControlPanel';
import { TaskQueuePanel, DAGVisualization } from '@/components/TaskQueuePanel';
import { EventLogPanel } from '@/components/EventLogPanel';
import { BudgetPanel } from '@/components/BudgetPanel';
import { TestHarnessPanel } from '@/components/TestHarnessPanel';
import { ContextPanel } from '@/components/ContextPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-surface-1 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">OS</span>
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">AIM-OS Orchestration</h1>
            <p className="text-xs text-muted-foreground">AI-Integrated Memory & Operations System</p>
          </div>
        </div>
      </header>

      {/* Control Panel */}
      <ControlPanel />

      {/* Main Content */}
      <div className="flex-1 p-4 overflow-hidden">
        <Tabs defaultValue="orchestration" className="h-full flex flex-col">
          <TabsList className="bg-surface-1 mb-4 self-start">
            <TabsTrigger value="orchestration">Orchestration</TabsTrigger>
            <TabsTrigger value="tests">Test Harness</TabsTrigger>
          </TabsList>

          <TabsContent value="orchestration" className="flex-1 mt-0 min-h-0">
            <div className="grid grid-cols-12 gap-4 h-full">
              {/* Left Column - Task Queue */}
              <div className="col-span-5 h-[calc(100vh-220px)]">
                <TaskQueuePanel />
              </div>

              {/* Middle Column - Events */}
              <div className="col-span-4 h-[calc(100vh-220px)]">
                <EventLogPanel />
              </div>

              {/* Right Column - Budget & Context */}
              <div className="col-span-3 space-y-4">
                <BudgetPanel />
                <ContextPanel />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tests" className="flex-1 mt-0 min-h-0">
            <div className="h-[calc(100vh-220px)]">
              <TestHarnessPanel />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
