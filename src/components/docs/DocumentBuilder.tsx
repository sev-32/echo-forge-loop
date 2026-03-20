import { useState, useCallback, useEffect } from 'react';
import { useDocuments } from '@/hooks/use-documents';
import { DocSidebar } from './DocSidebar';
import { BlockEditor } from './BlockEditor';
import { AIWritingToolbar } from './AIWritingToolbar';
import { BlockTypeMenu } from './BlockTypeMenu';
import { DocStatusBar } from './DocStatusBar';
import { DocMissionPanel } from './MissionPanel';
import { WritingStyle, AIWritingAction, DocBlock, DocMission } from './types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function DocumentBuilder() {
  const {
    documents, activeDoc, activeDocId, blocks,
    createDocument, openDocument, updateDocument, deleteDocument,
    updateBlock, addBlock, removeBlock, moveBlock,
    getWordCount, getFullText,
  } = useDocuments();

  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState<string | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [showMission, setShowMission] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<WritingStyle>('technical');
  const [selectedText, setSelectedText] = useState('');

  // Sync style from doc
  useEffect(() => {
    if (activeDoc) setCurrentStyle(activeDoc.style);
  }, [activeDoc]);

  // Auto-save word count
  useEffect(() => {
    if (activeDocId) {
      const wc = getWordCount();
      updateDocument(activeDocId, { word_count: wc });
    }
  }, [blocks, activeDocId, getWordCount, updateDocument]);

  // Track text selection
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      setSelectedText(sel?.toString() || '');
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const handleAIAction = useCallback(async (actionType: AIWritingAction['type'], context: string) => {
    if (isAIProcessing) return;
    setIsAIProcessing(true);

    try {
      const textToProcess = context || getFullText();
      const { data, error } = await supabase.functions.invoke('doc-ai-write', {
        body: {
          action: actionType,
          content: textToProcess,
          style: currentStyle,
          docTitle: activeDoc?.title || 'Untitled',
          fullContext: getFullText().slice(0, 8000),
        }
      });

      if (error) throw error;

      if (data?.content) {
        if (actionType === 'outline') {
          // Parse outline into heading blocks
          const lines = data.content.split('\n').filter((l: string) => l.trim());
          for (const line of lines) {
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock) {
              const newId = addBlock(lastBlock.id, 'heading');
              updateBlock(newId, { content: line.replace(/^#+\s*/, '').trim(), metadata: { level: 2 } });
            }
          }
          toast.success('Outline generated');
        } else if (actionType === 'generate_section') {
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock) {
            const newId = addBlock(lastBlock.id, 'paragraph');
            updateBlock(newId, { content: data.content });
          }
          toast.success('Section generated');
        } else if (focusedBlockId) {
          updateBlock(focusedBlockId, { content: data.content });
          toast.success(`Block ${actionType}d`);
        }
      }
    } catch (err) {
      console.error('AI writing error:', err);
      toast.error('AI writing failed — check your connection');
    } finally {
      setIsAIProcessing(false);
    }
  }, [isAIProcessing, getFullText, currentStyle, activeDoc, blocks, addBlock, updateBlock, focusedBlockId]);

  const handleStyleChange = useCallback((style: WritingStyle) => {
    setCurrentStyle(style);
    if (activeDocId) updateDocument(activeDocId, { style });
  }, [activeDocId, updateDocument]);

  const handleBlockAdd = useCallback((afterId: string, type?: DocBlock['type']) => {
    const newId = addBlock(afterId, type);
    setFocusedBlockId(newId);
    return newId;
  }, [addBlock]);

  const handleMissionGenerate = useCallback(async (mission: DocMission) => {
    // Mission generation would call the AI to plan sections, then generate each
    toast.info('Mission planning started — AI is structuring your document...');
  }, []);

  const focusedBlock = blocks.find(b => b.id === focusedBlockId);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* AI Writing Toolbar */}
      {activeDoc && (
        <AIWritingToolbar
          selectedText={selectedText}
          onAction={handleAIAction}
          currentStyle={currentStyle}
          onStyleChange={handleStyleChange}
          isProcessing={isAIProcessing}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal">
          {/* Document Sidebar */}
          <ResizablePanel defaultSize={18} minSize={12} maxSize={28}>
            <DocSidebar
              documents={documents}
              activeId={activeDocId}
              onSelect={openDocument}
              onCreate={() => createDocument()}
              onDelete={deleteDocument}
            />
          </ResizablePanel>
          <ResizableHandle />

          {/* Editor */}
          <ResizablePanel defaultSize={showMission ? 58 : 82}>
            {activeDoc ? (
              <div className="h-full flex flex-col">
                {/* Document header */}
                <div className="px-6 pt-4 pb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowMission(!showMission)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all
                        ${showMission ? 'bg-primary/10 text-primary' : 'text-label-muted hover:bg-muted/50'}`}
                    >
                      ✦ Mission
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-label-muted">
                    <span>{blocks.length} blocks</span>
                    <span>·</span>
                    <span>{getWordCount()} words</span>
                  </div>
                </div>

                {/* Block editor area */}
                <ScrollArea className="flex-1">
                  <div className="max-w-[720px] mx-auto px-6 py-4 pb-32 relative">
                    {blocks.map(block => (
                      <div key={block.id} className="relative">
                        <BlockEditor
                          block={block}
                          onUpdate={updateBlock}
                          onAddAfter={handleBlockAdd}
                          onRemove={removeBlock}
                          onMove={moveBlock}
                          onFocus={setFocusedBlockId}
                          isFocused={focusedBlockId === block.id}
                        />
                        {showBlockMenu === block.id && (
                          <BlockTypeMenu
                            onSelect={(type, metadata) => {
                              const newId = addBlock(block.id, type);
                              if (metadata) updateBlock(newId, { metadata });
                              setFocusedBlockId(newId);
                            }}
                            onClose={() => setShowBlockMenu(null)}
                          />
                        )}
                      </div>
                    ))}

                    {/* Add block button */}
                    <button
                      onClick={() => {
                        const last = blocks[blocks.length - 1];
                        if (last) handleBlockAdd(last.id);
                      }}
                      className="mt-4 w-full py-2 border border-dashed border-border/50 rounded-md text-label-muted/30 hover:text-label-muted/60 hover:border-border transition-all text-sm"
                    >
                      + Add block
                    </button>
                  </div>
                </ScrollArea>

                {/* Status bar */}
                <DocStatusBar
                  doc={activeDoc}
                  wordCount={getWordCount()}
                  blockCount={blocks.length}
                  focusedBlockType={focusedBlock?.type}
                />
              </div>
            ) : (
              <EmptyState onCreateDocument={() => createDocument()} />
            )}
          </ResizablePanel>

          {/* Mission Panel */}
          {showMission && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={24} minSize={18} maxSize={35}>
                <DocMissionPanel onGenerate={handleMissionGenerate} isActive={isAIProcessing} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function EmptyState({ onCreateDocument }: { onCreateDocument: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/60">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
            <path d="M14 2v6h6"/>
            <path d="M16 13H8"/>
            <path d="M16 17H8"/>
            <path d="M10 9H8"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-label-primary mb-1">Document Builder</h2>
        <p className="text-sm text-label-muted mb-4">
          Create professional documents with AI-powered writing, style adaptation, and mission-driven generation.
        </p>
        <button
          onClick={onCreateDocument}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all active:scale-[0.97]"
        >
          ✦ New Document
        </button>
      </div>
    </div>
  );
}
