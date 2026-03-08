import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Trash2, Zap, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aim-chat`;

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, mode: 'autonomous' }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    onError(data.error || `Error ${resp.status}`);
    return;
  }

  if (!resp.body) { onError("No response body"); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Final flush
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

function formatMarkdown(text: string) {
  // Simple markdown rendering
  return text
    .replace(/^### (.*$)/gm, '<h3 class="text-sm font-bold text-foreground mt-3 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-base font-bold text-foreground mt-4 mb-2">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-lg font-bold text-foreground mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-secondary px-1 py-0.5 rounded text-xs font-mono text-accent">$1</code>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 text-muted-foreground">• $1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 text-muted-foreground">$1. $2</li>')
    .replace(/\n/g, '<br/>');
}

const EXAMPLE_PROMPTS = [
  "Analyze the pros and cons of microservices vs monolith architecture for a startup",
  "Create a comprehensive testing strategy for an AI-powered application",
  "Design a database schema for a project management tool",
  "Write a technical specification for a real-time collaboration feature",
];

export function AIMChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    let assistantContent = '';
    const assistantId = crypto.randomUUID();

    // Add empty assistant message
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }]);

    const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      await streamChat({
        messages: allMessages,
        onDelta: (chunk) => {
          assistantContent += chunk;
          setMessages(prev => prev.map(m => 
            m.id === assistantId ? { ...m, content: assistantContent } : m
          ));
        },
        onDone: () => {
          setIsStreaming(false);
        },
        onError: (err) => {
          toast.error(err);
          setIsStreaming(false);
          // Remove empty assistant message on error
          setMessages(prev => prev.filter(m => m.id !== assistantId));
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Stream failed');
      setIsStreaming(false);
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    }
  }, [messages, isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-16 h-16 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-foreground">AIM-OS</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Give me a goal. I'll break it down, execute it step by step, verify my work, and show you everything.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => send(prompt)}
                  className="text-left text-xs p-3 rounded-lg border border-border bg-card hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border'
              }`}>
                {msg.role === 'assistant' ? (
                  msg.content ? (
                    <div
                      className="text-sm leading-relaxed text-secondary-foreground prose-aim"
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>AIM-OS is thinking...</span>
                    </div>
                  )
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
                <div className="text-[10px] mt-1 opacity-50">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-md bg-secondary border border-border flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {isStreaming && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-10">
            <Zap className="h-3 w-3 text-primary animate-pulse" />
            <span>AIM-OS is executing...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 bg-card">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setMessages([]); }}
              className="flex-shrink-0 h-10 w-10"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Give AIM-OS a goal..."
              rows={1}
              className="w-full resize-none bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-[120px]"
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
              disabled={isStreaming}
            />
          </div>
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="flex-shrink-0 h-10 w-10"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="text-center mt-2">
          <Badge variant="outline" className="text-[10px]">
            Powered by AIM-OS • Gemini 3 Flash
          </Badge>
        </div>
      </div>
    </div>
  );
}
