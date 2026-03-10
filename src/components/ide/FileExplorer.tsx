import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Search, RefreshCw, Plus, FileText, Code, Database, Image, Settings, FileJson, Terminal, GitBranch } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const API_BASE = (import.meta.env.VITE_CHAT_URL || 'http://localhost:5002').replace(/\/chat$/, '');

// File type icon mapping
const getFileIcon = (name: string, language?: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const iconClass = "w-4 h-4 flex-shrink-0";
    switch (ext) {
        case 'ts': case 'tsx': return <Code className={cn(iconClass, "text-blue-400")} />;
        case 'js': case 'jsx': return <Code className={cn(iconClass, "text-yellow-400")} />;
        case 'py': return <Code className={cn(iconClass, "text-green-400")} />;
        case 'json': return <FileJson className={cn(iconClass, "text-amber-400")} />;
        case 'md': return <FileText className={cn(iconClass, "text-gray-400")} />;
        case 'css': case 'scss': return <Code className={cn(iconClass, "text-pink-400")} />;
        case 'html': return <Code className={cn(iconClass, "text-orange-400")} />;
        case 'sql': return <Database className={cn(iconClass, "text-cyan-400")} />;
        case 'png': case 'jpg': case 'svg': case 'gif': return <Image className={cn(iconClass, "text-purple-400")} />;
        case 'sh': case 'ps1': case 'bash': return <Terminal className={cn(iconClass, "text-emerald-400")} />;
        case 'env': return <Settings className={cn(iconClass, "text-gray-500")} />;
        case 'gitignore': return <GitBranch className={cn(iconClass, "text-red-400")} />;
        default: return <File className={cn(iconClass, "text-gray-400")} />;
    }
};

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    language?: string;
    size?: number;
    children?: FileNode[];
}

interface FileExplorerProps {
    onFileSelect: (path: string, language: string) => void;
    selectedFile?: string;
}

function TreeNode({ node, depth, onFileSelect, selectedFile, expandedPaths, toggleExpanded }: {
    node: FileNode;
    depth: number;
    onFileSelect: (path: string, language: string) => void;
    selectedFile?: string;
    expandedPaths: Set<string>;
    toggleExpanded: (path: string) => void;
}) {
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedFile === node.path;
    const isDir = node.type === 'directory';

    const handleClick = () => {
        if (isDir) {
            toggleExpanded(node.path);
        } else {
            onFileSelect(node.path, node.language || 'plaintext');
        }
    };

    return (
        <div>
            <button
                onClick={handleClick}
                className={cn(
                    "flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded text-sm hover:bg-white/5 transition-colors group",
                    isSelected && "bg-cyan-500/15 text-cyan-300",
                    !isSelected && "text-gray-300"
                )}
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
            >
                {isDir ? (
                    <>
                        {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        )}
                        {isExpanded ? (
                            <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        ) : (
                            <Folder className="w-4 h-4 text-amber-400/70 flex-shrink-0" />
                        )}
                    </>
                ) : (
                    <>
                        <span className="w-3.5 flex-shrink-0" />
                        {getFileIcon(node.name, node.language)}
                    </>
                )}
                <span className="truncate text-xs">{node.name}</span>
            </button>
            {isDir && isExpanded && node.children && (
                <div>
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            onFileSelect={onFileSelect}
                            selectedFile={selectedFile}
                            expandedPaths={expandedPaths}
                            toggleExpanded={toggleExpanded}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FileExplorer({ onFileSelect, selectedFile }: FileExplorerProps) {
    const [tree, setTree] = useState<FileNode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FileNode[]>([]);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['', 'src', 'server', 'src/components']));

    const fetchTree = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/files/tree?depth=4`);
            if (!res.ok) throw new Error('Failed to load file tree');
            const data = await res.json();
            setTree(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTree(); }, [fetchTree]);

    const toggleExpanded = useCallback((path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }, []);

    // File search
    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/files/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
                if (res.ok) setSearchResults(await res.json());
            } catch { }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    return (
        <div className="h-full flex flex-col bg-[#0d1117] border-r border-white/5">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">Explorer</span>
                <button onClick={fetchTree} className="p-0.5 hover:bg-white/5 rounded" title="Refresh">
                    <RefreshCw className={cn("w-3.5 h-3.5 text-gray-500", loading && "animate-spin")} />
                </button>
            </div>

            {/* Search */}
            <div className="px-2 py-1.5 border-b border-white/5">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search files..."
                        className="h-6 pl-6 text-xs bg-white/5 border-white/10 focus:border-cyan-500/50"
                    />
                </div>
            </div>

            {/* Tree / Search Results */}
            <ScrollArea className="flex-1">
                <div className="py-1">
                    {error && (
                        <div className="px-3 py-2 text-xs text-red-400">{error}</div>
                    )}
                    {searchQuery && searchResults.length > 0 ? (
                        searchResults.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => item.type === 'file' && onFileSelect(item.path, item.language || 'plaintext')}
                                className="flex items-center gap-1.5 w-full text-left py-1 px-3 text-xs hover:bg-white/5 text-gray-300"
                            >
                                {getFileIcon(item.name)}
                                <span className="truncate">{item.path}</span>
                            </button>
                        ))
                    ) : tree && !searchQuery ? (
                        tree.children?.map((child) => (
                            <TreeNode
                                key={child.path}
                                node={child}
                                depth={0}
                                onFileSelect={onFileSelect}
                                selectedFile={selectedFile}
                                expandedPaths={expandedPaths}
                                toggleExpanded={toggleExpanded}
                            />
                        ))
                    ) : !loading ? (
                        <div className="px-3 py-4 text-xs text-gray-500 text-center">No files found</div>
                    ) : null}
                </div>
            </ScrollArea>
        </div>
    );
}
