import { useState, useCallback } from 'react';
import { DocumentMeta, DocBlock, WritingStyle, DocStatus } from '@/components/docs/types';

function generateId() { return crypto.randomUUID(); }

function createEmptyDoc(title = 'Untitled Document'): DocumentMeta {
  return {
    id: generateId(),
    title,
    status: 'draft',
    style: 'technical',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    word_count: 0,
    tags: [],
  };
}

function createDefaultBlocks(): DocBlock[] {
  return [
    { id: generateId(), type: 'heading', content: '', order: 0, metadata: { level: 1 } },
    { id: generateId(), type: 'paragraph', content: '', order: 1 },
  ];
}

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentMeta[]>(() => {
    const saved = localStorage.getItem('aim-docs');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DocBlock[]>([]);

  const save = useCallback((docs: DocumentMeta[]) => {
    setDocuments(docs);
    localStorage.setItem('aim-docs', JSON.stringify(docs));
  }, []);

  const saveBlocks = useCallback((docId: string, b: DocBlock[]) => {
    setBlocks(b);
    localStorage.setItem(`aim-doc-blocks-${docId}`, JSON.stringify(b));
  }, []);

  const createDocument = useCallback((title?: string) => {
    const doc = createEmptyDoc(title);
    const newBlocks = createDefaultBlocks();
    const updated = [doc, ...documents];
    save(updated);
    saveBlocks(doc.id, newBlocks);
    setActiveDocId(doc.id);
    setBlocks(newBlocks);
    return doc;
  }, [documents, save, saveBlocks]);

  const openDocument = useCallback((id: string) => {
    setActiveDocId(id);
    const saved = localStorage.getItem(`aim-doc-blocks-${id}`);
    setBlocks(saved ? JSON.parse(saved) : createDefaultBlocks());
  }, []);

  const updateDocument = useCallback((id: string, updates: Partial<DocumentMeta>) => {
    const updated = documents.map(d => d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } : d);
    save(updated);
  }, [documents, save]);

  const deleteDocument = useCallback((id: string) => {
    save(documents.filter(d => d.id !== id));
    localStorage.removeItem(`aim-doc-blocks-${id}`);
    if (activeDocId === id) { setActiveDocId(null); setBlocks([]); }
  }, [documents, activeDocId, save]);

  const updateBlock = useCallback((blockId: string, updates: Partial<DocBlock>) => {
    const updated = blocks.map(b => b.id === blockId ? { ...b, ...updates } : b);
    if (activeDocId) saveBlocks(activeDocId, updated);
    else setBlocks(updated);
  }, [blocks, activeDocId, saveBlocks]);

  const addBlock = useCallback((afterId: string, type: DocBlock['type'] = 'paragraph') => {
    const idx = blocks.findIndex(b => b.id === afterId);
    const newBlock: DocBlock = { id: generateId(), type, content: '', order: idx + 1, metadata: type === 'heading' ? { level: 2 } : undefined };
    const updated = [...blocks.slice(0, idx + 1), newBlock, ...blocks.slice(idx + 1).map(b => ({ ...b, order: b.order + 1 }))];
    if (activeDocId) saveBlocks(activeDocId, updated);
    else setBlocks(updated);
    return newBlock.id;
  }, [blocks, activeDocId, saveBlocks]);

  const removeBlock = useCallback((blockId: string) => {
    if (blocks.length <= 1) return;
    const updated = blocks.filter(b => b.id !== blockId).map((b, i) => ({ ...b, order: i }));
    if (activeDocId) saveBlocks(activeDocId, updated);
    else setBlocks(updated);
  }, [blocks, activeDocId, saveBlocks]);

  const moveBlock = useCallback((blockId: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex(b => b.id === blockId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === blocks.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...blocks];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const reordered = updated.map((b, i) => ({ ...b, order: i }));
    if (activeDocId) saveBlocks(activeDocId, reordered);
    else setBlocks(reordered);
  }, [blocks, activeDocId, saveBlocks]);

  const getWordCount = useCallback(() => {
    return blocks.reduce((sum, b) => sum + b.content.split(/\s+/).filter(w => w.length > 0).length, 0);
  }, [blocks]);

  const getFullText = useCallback(() => {
    return blocks.map(b => b.content).join('\n\n');
  }, [blocks]);

  const activeDoc = documents.find(d => d.id === activeDocId) || null;

  return {
    documents, activeDoc, activeDocId, blocks,
    createDocument, openDocument, updateDocument, deleteDocument,
    updateBlock, addBlock, removeBlock, moveBlock,
    getWordCount, getFullText,
  };
}
