import { useState, useCallback, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { X, Save, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

interface EditorTab {
    path: string;
    language: string;
    content: string;
    originalContent: string;
    dirty: boolean;
}

interface MonacoEditorProps {
    initialFile?: { path: string; language: string };
    onFileChange?: (path: string) => void;
}

export function MonacoEditor({ initialFile, onFileChange }: MonacoEditorProps) {
    const [tabs, setTabs] = useState<EditorTab[]>([]);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const editorRef = useRef<any>(null);

    const openFile = useCallback(async (path: string, language: string) => {
        // Check if already open
        const existing = tabs.find(t => t.path === path);
        if (existing) {
            setActiveTab(path);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
            if (!res.ok) throw new Error('Failed to read file');
            const data = await res.json();

            const newTab: EditorTab = {
                path,
                language: data.language || language,
                content: data.content,
                originalContent: data.content,
                dirty: false,
            };

            setTabs(prev => [...prev, newTab]);
            setActiveTab(path);
            onFileChange?.(path);
        } catch (err) {
            console.error('Failed to open file:', err);
        }
    }, [tabs, onFileChange]);

    const closeTab = useCallback((path: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setTabs(prev => {
            const next = prev.filter(t => t.path !== path);
            if (activeTab === path) {
                setActiveTab(next.length > 0 ? next[next.length - 1].path : null);
            }
            return next;
        });
    }, [activeTab]);

    const saveFile = useCallback(async (path: string) => {
        const tab = tabs.find(t => t.path === path);
        if (!tab || !tab.dirty) return;

        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/files/write`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content: tab.content }),
            });
            if (!res.ok) throw new Error('Failed to save');

            setTabs(prev => prev.map(t =>
                t.path === path ? { ...t, dirty: false, originalContent: t.content } : t
            ));
        } catch (err) {
            console.error('Save failed:', err);
        } finally {
            setSaving(false);
        }
    }, [tabs]);

    const handleEditorChange = useCallback((value: string | undefined) => {
        if (!activeTab || value === undefined) return;
        setTabs(prev => prev.map(t =>
            t.path === activeTab
                ? { ...t, content: value, dirty: value !== t.originalContent }
                : t
        ));
    }, [activeTab]);

    const handleEditorMount = useCallback((editor: any, monaco: Monaco) => {
        editorRef.current = editor;

        // Ctrl+S / Cmd+S to save
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            if (activeTab) saveFile(activeTab);
        });

        // AIM-OS dark theme
        monaco.editor.defineTheme('echo-forge', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'c084fc' },
                { token: 'string', foreground: '86efac' },
                { token: 'number', foreground: 'fbbf24' },
                { token: 'type', foreground: '67e8f9' },
                { token: 'function', foreground: '60a5fa' },
                { token: 'variable', foreground: 'e2e8f0' },
            ],
            colors: {
                'editor.background': '#0d1117',
                'editor.foreground': '#e2e8f0',
                'editor.lineHighlightBackground': '#1e293b',
                'editor.selectionBackground': '#334155',
                'editorCursor.foreground': '#22d3ee',
                'editorLineNumber.foreground': '#475569',
                'editorLineNumber.activeForeground': '#94a3b8',
                'editor.inactiveSelectionBackground': '#1e293b80',
                'editorIndentGuide.background': '#1e293b',
                'editorIndentGuide.activeBackground': '#334155',
                'editorBracketMatch.background': '#334155',
                'editorBracketMatch.border': '#22d3ee40',
            },
        });
        monaco.editor.setTheme('echo-forge');
    }, [activeTab, saveFile]);

    const currentTab = tabs.find(t => t.path === activeTab);
    const filename = (path: string) => path.split('/').pop() || path;

    // Expose openFile for parent components
    (window as any).__echoForgeEditor = { openFile };

    return (
        <div className="h-full flex flex-col bg-[#0d1117]">
            {/* Tab Bar */}
            {tabs.length > 0 && (
                <div className="flex items-center bg-[#0a0f16] border-b border-white/5 overflow-x-auto scrollbar-none">
                    {tabs.map(tab => (
                        <button
                            key={tab.path}
                            onClick={() => setActiveTab(tab.path)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-white/5 min-w-0 group whitespace-nowrap",
                                activeTab === tab.path
                                    ? "bg-[#0d1117] text-gray-200 border-t-2 border-t-cyan-500"
                                    : "text-gray-500 hover:text-gray-300 hover:bg-white/3 border-t-2 border-t-transparent"
                            )}
                        >
                            {tab.dirty && (
                                <Circle className="w-2 h-2 fill-amber-400 text-amber-400 flex-shrink-0" />
                            )}
                            <span className="truncate max-w-[120px]">{filename(tab.path)}</span>
                            <X
                                className="w-3 h-3 text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 flex-shrink-0 ml-1"
                                onClick={(e) => closeTab(tab.path, e)}
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* Editor */}
            {currentTab ? (
                <div className="flex-1 relative">
                    <Editor
                        height="100%"
                        language={currentTab.language}
                        value={currentTab.content}
                        onChange={handleEditorChange}
                        onMount={handleEditorMount}
                        theme="echo-forge"
                        options={{
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                            fontLigatures: true,
                            minimap: { enabled: true, scale: 0.8, maxColumn: 80 },
                            lineNumbers: 'on',
                            renderLineHighlight: 'all',
                            scrollBeyondLastLine: false,
                            wordWrap: 'off',
                            tabSize: 2,
                            bracketPairColorization: { enabled: true },
                            guides: { bracketPairs: true, indentation: true },
                            cursorBlinking: 'smooth',
                            cursorSmoothCaretAnimation: 'on',
                            smoothScrolling: true,
                            padding: { top: 8, bottom: 8 },
                            suggest: {
                                showKeywords: true,
                                showSnippets: true,
                            },
                        }}
                    />
                    {/* Save indicator */}
                    {currentTab.dirty && (
                        <button
                            onClick={() => saveFile(currentTab.path)}
                            className={cn(
                                "absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs",
                                "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors",
                                saving && "opacity-50 pointer-events-none"
                            )}
                        >
                            <Save className="w-3 h-3" />
                            {saving ? 'Saving...' : 'Save (Ctrl+S)'}
                        </button>
                    )}
                </div>
            ) : (
                /* Empty state */
                <div className="flex-1 flex items-center justify-center text-gray-600">
                    <div className="text-center">
                        <div className="text-4xl mb-3 opacity-20"></div>
                        <div className="text-sm font-medium">Echo Forge IDE</div>
                        <div className="text-xs text-gray-700 mt-1">Open a file from the explorer to begin</div>
                        <div className="text-[10px] text-gray-800 mt-3">
                            Ctrl+S to save • Ctrl+P to search files
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
