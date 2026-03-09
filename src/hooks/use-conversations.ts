import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage, Conversation } from '@/components/chat/types';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, total_tokens, created_at, updated_at, last_run_id')
      .order('updated_at', { ascending: false })
      .limit(50);
    
    if (!error && data) {
      setConversations(data.map(c => ({ ...c, messages: [] })) as Conversation[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load full conversation messages
  const loadConversation = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!error && data) {
      setActiveConversationId(id);
      return (data.messages as unknown as ChatMessage[]) || [];
    }
    return [];
  }, []);

  // Create new conversation
  const createConversation = useCallback(async (title: string, messages: ChatMessage[]): Promise<string | null> => {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ title: title.slice(0, 100), messages: JSON.parse(JSON.stringify(messages)) })
      .select('id')
      .single();
    
    if (!error && data) {
      setActiveConversationId(data.id);
      loadConversations();
      return data.id;
    }
    return null;
  }, [loadConversations]);

  // Update conversation messages
  const updateConversation = useCallback(async (id: string, messages: ChatMessage[], totalTokens?: number) => {
    const update: any = {
      messages: JSON.parse(JSON.stringify(messages)),
      updated_at: new Date().toISOString(),
    };
    if (totalTokens !== undefined) update.total_tokens = totalTokens;
    
    await supabase.from('conversations').update(update).eq('id', id);
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from('conversations').delete().eq('id', id);
    if (activeConversationId === id) setActiveConversationId(null);
    loadConversations();
  }, [activeConversationId, loadConversations]);

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
