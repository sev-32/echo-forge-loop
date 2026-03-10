import { useState, useEffect, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconActivity } from "@/components/icons";

const API = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

interface LogEntry {
    timestamp: string;
    level: string;
    source: string;
    message: string;
}

const LEVEL_CLASSES: Record<string, string> = {
    ERROR: 'text-status-error',
    WARNING: 'text-status-warning',
    INFO: 'text-status-info',
    DEBUG: 'text-label-engraved',
};

export function DiagnosticsPanel() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState('');
    const [levelFilter, setLevelFilter] = useState('');
    const [isLive, setIsLive] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const esRef = useRef<EventSource | null>(null);

    // Fetch logs
    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (levelFilter) params.set('level', levelFilter);
            const resp = await fetch(`${API}/ide/diagnostics?${params}`);
            const data = await resp.json();
            setLogs(data.logs || []);
        } catch { /* ignore */ }
    }, [levelFilter]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    // Live streaming
    useEffect(() => {
        if (!isLive) { esRef.current?.close(); return; }
        const es = new EventSource(`${API}/ide/diagnostics/stream`);
        esRef.current = es;
        es.onmessage = (e) => {
            try {
                const entry = JSON.parse(e.data);
                setLogs(prev => [...prev.slice(-200), entry]);
            } catch { /* ignore */ }
        };
        return () => es.close();
    }, [isLive]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs.length]);

    const filtered = logs.filter(l =>
        (!filter || l.message.toLowerCase().includes(filter.toLowerCase())) &&
        (!levelFilter || l.level === levelFilter)
    );

    return (
        <div className="h-full flex flex-col" style={{ background: 'hsl(var(--surface-0))' }}>
            {/* Header */}
            <div className="panel-header flex-shrink-0">
                <div className="flex items-center gap-2 flex-1">
                    {/* Level badges */}
                    {['ERROR', 'WARNING', 'INFO'].map(lvl => (
                        <button
                            key={lvl}
                            onClick={() => setLevelFilter(levelFilter === lvl ? '' : lvl)}
                            className={`text-[8px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-all ${levelFilter === lvl ? 'surface-raised' : ''
                                } ${LEVEL_CLASSES[lvl] || 'text-label-muted'}`}
                        >
                            {lvl}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1.5">
                    <input
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter..."
                        className="w-24 h-5 px-1.5 text-[9px] font-mono rounded surface-well text-label-secondary placeholder:text-label-engraved focus:outline-none focus:amber-ring"
                    />
                    <button
                        onClick={() => setIsLive(!isLive)}
                        className={`text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded transition-all ${isLive ? 'surface-raised text-status-success' : 'text-label-engraved'
                            }`}
                    >
                        {isLive ? 'LIVE █' : 'LIVE'}
                    </button>
                    <button onClick={fetchLogs} className="text-label-engraved hover:text-label-secondary text-[10px]">↻</button>
                    <button onClick={() => setLogs([])} className="text-label-engraved hover:text-status-error text-[10px]">✕</button>
                </div>
            </div>

            {/* Log Stream */}
            <ScrollArea className="flex-1" ref={scrollRef}>
                <div className="p-2 space-y-0.5">
                    {filtered.length === 0 ? (
                        <div className="text-center py-8">
                            <IconActivity size={20} className="text-label-engraved mx-auto mb-2" />
                            <span className="text-engraved">NO DIAGNOSTIC LOGS YET</span>
                            <p className="text-[9px] text-label-engraved mt-1">Toggle LIVE to stream in real-time</p>
                        </div>
                    ) : (
                        filtered.map((log, i) => (
                            <div key={i} className="surface-well rounded px-2 py-1 group hover:amber-glow transition-all">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-mono font-semibold uppercase tracking-wider ${LEVEL_CLASSES[log.level] || 'text-label-muted'}`}>
                                        {log.level}
                                    </span>
                                    <span className="text-[9px] text-label-engraved font-mono">{log.source}</span>
                                    <span className="text-[9px] text-label-engraved font-mono ml-auto">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <p className="text-[10px] text-label-secondary truncate mt-0.5 font-mono">{log.message}</p>
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
