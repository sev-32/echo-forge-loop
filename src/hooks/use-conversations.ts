import { useState, useEffect, useCallback } from 'react';
import { getPersistenceAdapter } from '@/lib/persistence-adapter';
import type { ChatMessage, Conversation } from '@/components/chat/types';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const adapter = getPersistenceAdapter();

  // Load conversation list
  const loadConversations = useCallback(async () => {
    const data = await adapter.listConversations(50);
    if (data.length) {
      setConversations(data.map((c) => ({ ...c, messages: [] })) as Conversation[]);
    }
    setLoading(false);
  }, [adapter]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load full conversation messages
  const loadConversation = useCallback(
    async (id: string) => {
      const data = await adapter.getConversation(id);
      if (data) {
        setActiveConversationId(id);
        return (data.messages as unknown as ChatMessage[]) || [];
      }
      return [];
    },
    [adapter]
  );

  // Create new conversation
  const createConversation = useCallback(
    async (title: string, messages: ChatMessage[]): Promise<string | null> => {
      const result = await adapter.createConversation(title, messages);
      if (result) {
        setActiveConversationId(result.id);
        loadConversations();
        return result.id;
      }
      return null;
    },
    [adapter, loadConversations]
  );

  // Update conversation messages
  const updateConversation = useCallback(
    async (id: string, messages: ChatMessage[], totalTokens?: number) => {
      await adapter.updateConversation(id, {
        messages,
        updated_at: new Date().toISOString(),
        ...(totalTokens !== undefined && { total_tokens: totalTokens }),
      });
    },
    [adapter]
  );

  // Delete conversation
  const deleteConversation = useCallback(
    async (id: string) => {
      await adapter.deleteConversation(id);
      if (activeConversationId === id) setActiveConversationId(null);
      loadConversations();
    },
    [adapter, activeConversationId, loadConversations]
  );

  // Start fresh
  const newConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  return {
    conversations,
    activeConversationId,
    loading,
    loadConversation,
    createConversation,
    updateConversation,
    deleteConversation,
    newConversation,
    refresh: loadConversations,
  };
}
