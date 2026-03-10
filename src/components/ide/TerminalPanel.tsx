import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Plus, X, Terminal as TermIcon, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

interface TermSession {
    id: string;
    cwd: string;
    shell: string;
    output: string[];
    running: boolean;
}

export function TerminalPanel() {
    const [sessions, setSessions] = useState<TermSession[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [command, setCommand] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const outputRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-create first session
    useEffect(() => {
        if (sessions.length === 0) createSession();
    }, []);

    // Auto-scroll output
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [sessions, activeSession]);

    const createSession = async () => {
        try {
            const res = await fetch(`${API_BASE}/terminal/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            const session: TermSession = {
                id: data.session_id,
                cwd: data.cwd,
                shell: data.shell,
                output: [`\x1b[36m● Terminal session ${data.session_id}\x1b[0m`, `\x1b[90m  ${data.cwd}\x1b[0m`, ''],
                running: false,
            };
            setSessions(prev => [...prev, session]);
            setActiveSession(data.session_id);
        } catch (err) {
            console.error('Failed to create terminal session:', err);
        }
    };

    const closeSession = (id: string) => {
        setSessions(prev => {
            const next = prev.filter(s => s.id !== id);
            if (activeSession === id) {
                setActiveSession(next.length > 0 ? next[0].id : null);
            }
            return next;
        });
        fetch(`${API_BASE}/terminal/${id}`, { method: 'DELETE' }).catch(() => { });
    };

    const executeCommand = async () => {
        const cmd = command.trim();
        if (!cmd || !activeSession) return;

        // Add to history
        setHistory(prev => [...prev.filter(h => h !== cmd), cmd]);
        setHistoryIndex(-1);
        setCommand('');

        // Add command to output
        setSessions(prev => prev.map(s =>
            s.id === activeSession
                ? { ...s, output: [...s.output, `\x1b[32m❯\x1b[0m ${cmd}`], running: true }
                : s
        ));

        try {
            const res = await fetch(`${API_BASE}/terminal/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: activeSession, command: cmd, timeout: 30 }),
            });
            const data = await res.json();

            setSessions(prev => prev.map(s => {
                if (s.id !== activeSession) return s;
                const newOutput = [...s.output];
                if (data.stdout) newOutput.push(...data.stdout.split('\n'));
                if (data.stderr) newOutput.push(...data.stderr.split('\n').map((l: string) => `\x1b[31m${l}\x1b[0m`));
                if (data.error) newOutput.push(`\x1b[31m${data.error}\x1b[0m`);
                newOutput.push('');
                return { ...s, output: newOutput, running: false };
            }));
        } catch (err: any) {
            setSessions(prev => prev.map(s =>
                s.id === activeSession
                    ? { ...s, output: [...s.output, `\x1b[31mError: ${err.message}\x1b[0m`, ''], running: false }
                    : s
            ));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            executeCommand();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const newIndex = Math.min(historyIndex + 1, history.length - 1);
            setHistoryIndex(newIndex);
            if (newIndex >= 0) setCommand(history[history.length - 1 - newIndex]);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            if (newIndex >= 0) setCommand(history[history.length - 1 - newIndex]);
            else setCommand('');
        }
    };

    // Parse ANSI-like codes to styled spans
    const renderLine = (line: string, idx: number) => {
        const segments: { text: string; color?: string }[] = [];
        let remaining = line;
        const ansiRegex = /\x1b\[(\d+)m/;

        let currentColor: string | undefined;
        while (remaining.length > 0) {
            const match = remaining.match(ansiRegex);
            if (!match || match.index === undefined) {
                segments.push({ text: remaining, color: currentColor });
                break;
            }
            if (match.index > 0) {
                segments.push({ text: remaining.slice(0, match.index), color: currentColor });
            }
            const code = parseInt(match[1]);
            if (code === 0) currentColor = undefined;
            else if (code === 31) currentColor = 'text-red-400';
            else if (code === 32) currentColor = 'text-emerald-400';
            else if (code === 33) currentColor = 'text-amber-400';
            else if (code === 36) currentColor = 'text-cyan-400';
            else if (code === 90) currentColor = 'text-gray-500';
            remaining = remaining.slice(match.index + match[0].length);
        }

        return (
            <div key={idx} className="leading-5 min-h-[20px]">
                {segments.map((seg, i) => (
                    <span key={i} className={seg.color}>{seg.text}</span>
                ))}
            </div>
        );
    };

    const current = sessions.find(s => s.id === activeSession);

    return (
        <div className="h-full flex flex-col bg-[#0a0f16] border-t border-white/5">
            {/* Tab bar */}
            <div className="flex items-center bg-[#080c12] border-b border-white/5">
                <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
                    {sessions.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSession(s.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1 text-xs group",
                                s.id === activeSession
                                    ? "text-cyan-300 bg-[#0a0f16]"
                                    : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            <TermIcon className="w-3 h-3" />
                            {s.id}
                            {s.running && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
                            <X
                                className="w-3 h-3 opacity-0 group-hover:opacity-100 hover:text-red-400"
                                onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                            />
                        </button>
                    ))}
                </div>
                <button
                    onClick={createSession}
                    className="p-1.5 hover:bg-white/5 text-gray-500 hover:text-gray-300"
                    title="New Terminal"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Output */}
            <div
                ref={outputRef}
                className="flex-1 overflow-auto px-3 py-2 font-mono text-xs text-gray-300"
                onClick={() => inputRef.current?.focus()}
            >
                {current?.output.map((line, i) => renderLine(line, i))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-t border-white/5">
                <span className="text-emerald-400 text-xs font-mono">❯</span>
                <input
                    ref={inputRef}
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={current?.running ? 'Running...' : 'Enter command...'}
                    disabled={current?.running}
                    className="flex-1 bg-transparent text-xs font-mono text-gray-200 focus:outline-none placeholder:text-gray-600 disabled:opacity-50"
                />
                <button
                    onClick={executeCommand}
                    disabled={current?.running || !command.trim()}
                    className="p-1 hover:bg-white/5 rounded disabled:opacity-30"
                >
                    <Play className="w-3.5 h-3.5 text-cyan-400" />
                </button>
            </div>
        </div>
    );
}
