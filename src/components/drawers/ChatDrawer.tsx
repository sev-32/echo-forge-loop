import { useState, useRef, useCallback, useEffect } from "react";
import { IconChevronRight } from "@/components/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function ChatDrawer() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || streaming) return;

        const userMsg: Message = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setStreaming(true);

        const assistantMsg: Message = { role: 'assistant', content: '' };
        setMessages(prev => [...prev, assistantMsg]);

        try {
            const resp = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg].map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!resp.ok || !resp.body) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });

                let nl: number;
                while ((nl = buf.indexOf('\n')) !== -1) {
                    let line = buf.slice(0, nl);
                    buf = buf.slice(nl + 1);
                    if (line.endsWith('\r')) line = line.slice(0, -1);
                    if (!line.startsWith('data: ')) continue;
                    const json = line.slice(6).trim();
                    if (json === '[DONE]') break;

                    try {
                        const evt = JSON.parse(json);
                        if (evt.type === 'task_delta') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = updated[updated.length - 1];
                                if (last.role === 'assistant') {
                                    last.content += evt.delta;
                                }
                                return [...updated];
                            });
                        }
                    } catch { /* partial JSON, keep buffering */ }
                }
            }
        } catch (err: any) {
            setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                    last.content = `Error: ${err.message || err}`;
                }
                return [...updated];
            });
        } finally {
            setStreaming(false);
        }
    }, [input, streaming, messages]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="panel-header">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-engraved">AI ASSISTANT</span>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1" ref={scrollRef}>
                <div className="p-3 space-y-3">
                    {messages.length === 0 && (
                        <div className="text-center py-8" style={{ color: 'hsl(var(--label-muted))' }}>
                            <div className="text-2xl mb-2 opacity-30">💬</div>
                            <div className="text-xs">Ask anything while you code</div>
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={cn(
                            "text-xs rounded-lg px-3 py-2 whitespace-pre-wrap",
                            msg.role === 'user'
                                ? "ml-6"
                                : "mr-2 surface-well"
                        )} style={msg.role === 'user' ? { background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--label-primary))' } : { color: 'hsl(var(--label-secondary))' }}>
                            {msg.content || (streaming ? '...' : '')}
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-end gap-1.5 surface-well rounded-lg px-2 py-1.5">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your code..."
                        rows={1}
                        className="flex-1 bg-transparent text-xs resize-none focus:outline-none"
                        style={{ color: 'hsl(var(--label-primary))', maxHeight: '80px' }}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={streaming || !input.trim()}
                        className="p-1 rounded disabled:opacity-30 hover:surface-raised"
                    >
                        <IconChevronRight className="w-3.5 h-3.5" style={{ color: 'hsl(var(--primary))' }} />
                    </button>
                </div>
            </div>
        </div>
    );
}
