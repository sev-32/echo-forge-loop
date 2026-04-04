import { useState, useCallback, useRef } from 'react';
import { CognitiveShell } from '@/components/shell/CognitiveShell';
import { PanelErrorBoundary } from '@/components/shell/ErrorBoundary';
import { AIMChat } from '@/components/AIMChat';
import { DocumentBuilder } from '@/components/docs/DocumentBuilder';
import { DeepResearchPanel } from '@/components/DeepResearchPanel';
import { IONPanel } from '@/components/IONPanel';
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
import { FileExplorer } from '@/components/ide/FileExplorer';
import { MonacoEditor } from '@/components/ide/MonacoEditor';
import { TerminalPanel } from '@/components/ide/TerminalPanel';
import { CodeGenPanel } from '@/components/ide/CodeGenPanel';
import { AutoDebugPanel } from '@/components/ide/AutoDebugPanel';
import { DiagnosticsPanel } from '@/components/ide/DiagnosticsPanel';
import { AutonomousPanel } from '@/components/ide/AutonomousPanel';
import { SecurityPanel } from '@/components/ide/SecurityPanel';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [activeFileContent, setActiveFileContent] = useState<string | undefined>();
  const [bottomTab, setBottomTab] = useState<'terminal' | 'codegen' | 'debug' | 'diagnostics' | 'autonomous' | 'security'>('terminal');
  const editorRef = useRef<any>(null);

  const handleFileSelect = useCallback((path: string, language: string) => {
    setSelectedFile(path);
    // Open file in Monaco editor via the global bridge
    const editor = (window as any).__echoForgeEditor;
    if (editor) editor.openFile(path, language);
  }, []);

  return (
    <CognitiveShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      systemStatus="idle"
    >
      <div className="h-full overflow-auto">
        {/* ═══ Documents ═══ */}
        <PanelErrorBoundary fallbackTitle="Documents">
          {activeTab === 'docs' && <DocumentBuilder />}
        </PanelErrorBoundary>

        {/* ═══ AI Chat ═══ */}
        <PanelErrorBoundary fallbackTitle="Chat">
          {activeTab === 'chat' && <AIMChat />}
        </PanelErrorBoundary>

        {/* ═══ IDE MODE ═══ */}
        <PanelErrorBoundary fallbackTitle="IDE">
          {activeTab === 'ide' && (
            <div className="h-full">
              <ResizablePanelGroup direction="vertical" className="h-full">
                {/* Top: File Explorer + Editor */}
                <ResizablePanel defaultSize={70} minSize={30}>
                  <ResizablePanelGroup direction="horizontal">
                    {/* File Explorer */}
                    <ResizablePanel defaultSize={20} minSize={12} maxSize={35}>
                      <FileExplorer
                        onFileSelect={handleFileSelect}
                        selectedFile={selectedFile}
                      />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    {/* Monaco Editor */}
                    <ResizablePanel defaultSize={80}>
                      <MonacoEditor
                        onFileChange={setSelectedFile}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
                <ResizableHandle withHandle />
                {/* Bottom: Terminal + CodeGen Tabs */}
                <ResizablePanel defaultSize={30} minSize={15} maxSize={60}>
                  <div className="h-full flex flex-col">
                    {/* Tab Bar */}
                    <div className="flex items-center gap-0.5 px-1 flex-shrink-0" style={{ background: 'hsl(var(--surface-2))', borderBottom: '1px solid hsl(var(--border))' }}>
                      <button
                        onClick={() => setBottomTab('terminal')}
                        className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${bottomTab === 'terminal'
                          ? 'border-b-2'
                          : ''
                          }`}
                        style={{
                          color: bottomTab === 'terminal' ? 'hsl(var(--primary))' : 'hsl(var(--label-muted))',
                          borderColor: bottomTab === 'terminal' ? 'hsl(var(--primary))' : 'transparent',
                        }}
                      >
                        ▶ Terminal
                      </button>
                      <button
                        onClick={() => setBottomTab('codegen')}
                        className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${bottomTab === 'codegen'
                          ? 'border-b-2'
                          : ''
                          }`}
                        style={{
                          color: bottomTab === 'codegen' ? 'hsl(var(--primary))' : 'hsl(var(--label-muted))',
                          borderColor: bottomTab === 'codegen' ? 'hsl(var(--primary))' : 'transparent',
                        }}
                      >
                        AI CODE GEN
                      </button>
                      <button
                        onClick={() => setBottomTab('debug')}
                        className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${bottomTab === 'debug'
                          ? 'border-b-2'
                          : ''
                          }`}
                        style={{
                          color: bottomTab === 'debug' ? 'hsl(0 70% 60%)' : 'hsl(var(--label-muted))',
                          borderColor: bottomTab === 'debug' ? 'hsl(0 70% 60%)' : 'transparent',
                        }}
                      >
                        DEBUG
                      </button>
                      <button
                        onClick={() => setBottomTab('diagnostics')}
                        className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${bottomTab === 'diagnostics'
                          ? 'border-b-2'
                          : ''
                          }`}
                        style={{
                          color: bottomTab === 'diagnostics' ? 'hsl(280 70% 65%)' : 'hsl(var(--label-muted))',
                          borderColor: bottomTab === 'diagnostics' ? 'hsl(280 70% 65%)' : 'transparent',
                        }}
                      >
                        DIAGNOSTICS
                      </button>
                      <button
                        onClick={() => setBottomTab('autonomous')}
                        className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${bottomTab === 'autonomous'
                          ? 'border-b-2'
                          : ''
                          }`}
                        style={{
                          color: bottomTab === 'autonomous' ? 'hsl(var(--amber))' : 'hsl(var(--label-muted))',
                          borderColor: bottomTab === 'autonomous' ? 'hsl(var(--amber))' : 'transparent',
                        }}
                      >
                        AUTONOMOUS
                      </button>
                      <button
                        onClick={() => setBottomTab('security')}
                        className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${bottomTab === 'security'
                          ? 'border-b-2'
                          : ''
                          }`}
                        style={{
                          color: bottomTab === 'security' ? 'hsl(145 70% 55%)' : 'hsl(var(--label-muted))',
                          borderColor: bottomTab === 'security' ? 'hsl(145 70% 55%)' : 'transparent',
                        }}
                      >
                        SECURITY
                      </button>
                    </div>
                    {/* Tab Content */}
                    <div className="flex-1 min-h-0">
                      {bottomTab === 'terminal' && <TerminalPanel />}
                      {bottomTab === 'codegen' && (
                        <CodeGenPanel
                          activeFile={selectedFile}
                          activeFileContent={activeFileContent}
                          onFilesChanged={(paths) => {
                            // Refresh the first changed file in editor
                            if (paths.length > 0) {
                              const editor = (window as any).__echoForgeEditor;
                              if (editor) editor.openFile(paths[0], '');
                            }
                          }}
                        />
                      )}
                      {bottomTab === 'debug' && (
                        <AutoDebugPanel
                          onFixApplied={(paths) => {
                            if (paths.length > 0) {
                              const editor = (window as any).__echoForgeEditor;
                              if (editor) editor.openFile(paths[0], '');
                            }
                          }}
                        />
                      )}
                      {bottomTab === 'diagnostics' && <DiagnosticsPanel />}
                      {bottomTab === 'autonomous' && (
                        <AutonomousPanel
                          activeFile={selectedFile}
                          activeFileContent={activeFileContent}
                          onFilesChanged={(paths) => {
                            if (paths.length > 0) {
                              const editor = (window as any).__echoForgeEditor;
                              if (editor) editor.openFile(paths[0], '');
                            }
                          }}
                        />
                      )}
                      {bottomTab === 'security' && <SecurityPanel />}
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          )}
        </PanelErrorBoundary>

        {/* ═══ Deep Research ═══ */}
        <PanelErrorBoundary fallbackTitle="Deep Research">
          {activeTab === 'research' && <DeepResearchPanel />}
        </PanelErrorBoundary>

        {/* ═══ ION Kernel ═══ */}
        <PanelErrorBoundary fallbackTitle="ION Kernel">
          {activeTab === 'ion' && <IONPanel />}
        </PanelErrorBoundary>

        {/* ═══ Other Panels ═══ */}
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
