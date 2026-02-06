// ============================================
// React Hooks for Journal & Context Banks
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { journal, JournalManager, JournalEntry, JournalEntryType, JournalPriority, ContextBank, PlanNode, KnowledgeGraph } from '@/lib/journal';

export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [stats, setStats] = useState(journal.getStats());

  const refresh = useCallback(() => {
    setEntries(journal.getAllEntries());
    setTags(journal.getAllTags());
    setStats(journal.getStats());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const createEntry = useCallback((
    type: JournalEntryType,
    title: string,
    content: string,
    options?: Parameters<JournalManager['createEntry']>[3]
  ) => {
    const entry = journal.createEntry(type, title, content, options);
    refresh();
    return entry;
  }, [refresh]);

  const updateEntry = useCallback((id: string, updates: Parameters<JournalManager['updateEntry']>[1]) => {
    const entry = journal.updateEntry(id, updates);
    refresh();
    return entry;
  }, [refresh]);

  const searchEntries = useCallback((query: string) => {
    return journal.searchEntries(query);
  }, []);

  return {
    entries,
    tags,
    stats,
    refresh,
    createEntry,
    updateEntry,
    searchEntries,
    getEntriesByType: (type: JournalEntryType) => journal.getEntriesByType(type),
    getEntriesByTag: (tag: string) => journal.getEntriesByTag(tag),
    getThread: (id: string) => journal.getThread(id),
  };
}

export function useContextBanks() {
  const [banks, setBanks] = useState<ContextBank[]>([]);

  const refresh = useCallback(() => {
    setBanks(journal.getAllContextBanks());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const createBank = useCallback((
    name: string,
    description: string,
    options?: Parameters<JournalManager['createContextBank']>[2]
  ) => {
    const bank = journal.createContextBank(name, description, options);
    refresh();
    return bank;
  }, [refresh]);

  const addEntry = useCallback((
    bankId: string,
    content: string,
    source: string,
    options?: Parameters<JournalManager['addToContextBank']>[3]
  ) => {
    const entry = journal.addToContextBank(bankId, content, source, options);
    refresh();
    return entry;
  }, [refresh]);

  const searchBank = useCallback((bankId: string, query: string) => {
    return journal.searchContextBank(bankId, query);
  }, []);

  return { banks, refresh, createBank, addEntry, searchBank };
}

export function usePlans() {
  const [plans, setPlans] = useState<PlanNode[]>([]);

  const refresh = useCallback(() => {
    setPlans(journal.getAllPlans());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const createPlan = useCallback((title: string, description: string) => {
    const plan = journal.createPlan(title, description);
    refresh();
    return plan;
  }, [refresh]);

  const updateStatus = useCallback((id: string, status: PlanNode['status']) => {
    journal.updatePlanStatus(id, status);
    refresh();
  }, [refresh]);

  const addNote = useCallback((id: string, note: string) => {
    journal.addPlanNote(id, note);
    refresh();
  }, [refresh]);

  return { plans, refresh, createPlan, updateStatus, addNote };
}

export function useKnowledgeGraph() {
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });

  const refresh = useCallback(() => {
    setGraph(journal.getKnowledgeGraph());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { graph, refresh };
}
