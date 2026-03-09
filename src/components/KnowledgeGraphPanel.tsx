import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { GaugeRadial, StatusBadge } from '@/components/ui/instruments';
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize2, AlertTriangle, CheckCircle2, Shield } from 'lucide-react';
import { seg, type EvidenceNode, type EvidenceEdge, type Contradiction } from '@/lib/seg';

// ─── Layout types ────────────────────────────────────
interface LayoutNode extends EvidenceNode {
  x: number; y: number; vx: number; vy: number;
}

// ─── Colors ──────────────────────────────────────────
const typeColors: Record<string, string> = {
  concept: 'hsl(var(--primary))',
  entity: 'hsl(190, 80%, 45%)',
  process: 'hsl(260, 80%, 70%)',
  pattern: 'hsl(38, 92%, 55%)',
  discovery: 'hsl(0, 72%, 55%)',
  risk: 'hsl(0, 85%, 60%)',
  capability: 'hsl(160, 70%, 45%)',
  decision: 'hsl(280, 70%, 60%)',
  process_rule: 'hsl(45, 90%, 50%)',
  default: 'hsl(var(--muted-foreground))',
};

const stanceColors: Record<string, string> = {
  contradicts: 'hsl(var(--status-error))',
  weakly_contradicts: 'hsl(var(--status-warning))',
  tension: 'hsl(45, 90%, 50%)',
};

function getColor(type: string) { return typeColors[type] || typeColors.default; }

// ─── Force layout ────────────────────────────────────
function forceLayout(nodes: EvidenceNode[], edges: EvidenceEdge[], width: number, height: number, iterations = 80): LayoutNode[] {
  const ns: LayoutNode[] = nodes.map(n => ({ ...n, x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0 }));
  const nodeMap = new Map(ns.map(n => [n.id, n]));

  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations;
    for (let a = 0; a < ns.length; a++) {
      for (let b = a + 1; b < ns.length; b++) {
        const dx = ns[b].x - ns[a].x;
        const dy = ns[b].y - ns[a].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (200 * alpha) / dist;
        ns[a].vx -= (dx / dist) * force;
        ns[a].vy -= (dy / dist) * force;
        ns[b].vx += (dx / dist) * force;
        ns[b].vy += (dy / dist) * force;
      }
    }
    for (const e of edges) {
      const s = nodeMap.get(e.source_id);
      const t = nodeMap.get(e.target_id);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = dist * 0.01 * alpha * e.weight;
      s.vx += (dx / dist) * force;
      s.vy += (dy / dist) * force;
      t.vx -= (dx / dist) * force;
      t.vy -= (dy / dist) * force;
    }
    for (const n of ns) {
      n.vx += (width / 2 - n.x) * 0.005 * alpha;
      n.vy += (height / 2 - n.y) * 0.005 * alpha;
      n.x += n.vx * 0.5;
      n.y += n.vy * 0.5;
      n.vx *= 0.8;
      n.vy *= 0.8;
      n.x = Math.max(30, Math.min(width - 30, n.x));
      n.y = Math.max(30, Math.min(height - 30, n.y));
    }
  }
  return ns;
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export function KnowledgeGraphPanel() {
  const [nodes, setNodes] = useState<EvidenceNode[]>([]);
  const [edges, setEdges] = useState<EvidenceEdge[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EvidenceNode | null>(null);
  const [selectedContradiction, setSelectedContradiction] = useState<Contradiction | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tab, setTab] = useState('graph');
  const [resolving, setResolving] = useState(false);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const W = 800, H = 500;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [graph, contras] = await Promise.all([seg.getFullGraph(), seg.getContradictions()]);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setContradictions(contras);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const layoutNodes = useMemo(() => nodes.length === 0 ? [] : forceLayout(nodes, edges, W, H), [nodes, edges]);
  const nodeMap = useMemo(() => new Map(layoutNodes.map(n => [n.id, n])), [layoutNodes]);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const contradictionNodeIds = useMemo(() => {
    const ids = new Set<string>();
    contradictions.filter(c => !c.resolution).forEach(c => { ids.add(c.node_a_id); ids.add(c.node_b_id); });
    return ids;
  }, [contradictions]);

  const unresolvedCount = contradictions.filter(c => !c.resolution).length;
  const avgConfidence = nodes.length > 0 ? (nodes.reduce((s, n) => s + n.confidence, 0) / nodes.length) * 100 : 0;

  const connectedEdges = selectedNode ? edges.filter(e => e.source_id === selectedNode.id || e.target_id === selectedNode.id) : [];

  const handleMouseDown = (e: React.MouseEvent) => { dragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan(p => ({ x: p.x + (e.clientX - lastMouse.current.x), y: p.y + (e.clientY - lastMouse.current.y) }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { dragging.current = false; };

  async function handleResolve(c: Contradiction, resolution: string, reasoning: string) {
    setResolving(true);
    await seg.resolveContradiction(c.id, resolution as any, reasoning);
    await loadData();
    setSelectedContradiction(null);
    setResolving(false);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-mono font-bold text-label-primary tracking-widest uppercase">Evidence Graph</span>
        <Badge variant="outline" className="text-[9px] font-mono">{nodes.length} nodes · {edges.length} edges</Badge>
        {unresolvedCount > 0 && (
          <Badge variant="destructive" className="text-[9px] gap-1">
            <AlertTriangle className="h-3 w-3" /> {unresolvedCount} conflict{unresolvedCount > 1 ? 's' : ''}
          </Badge>
        )}

        {/* Mini gauges in header */}
        <div className="ml-auto flex items-center gap-3">
          <GaugeRadial value={avgConfidence} label="CONF" size={36} strokeWidth={2.5} showTicks={false} />
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="h-7 w-7 p-0"><ZoomIn className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} className="h-7 w-7 p-0"><ZoomOut className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="h-7 w-7 p-0"><Maximize2 className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={loadData} disabled={loading} className="h-7 w-7 p-0">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 w-fit">
          <TabsTrigger value="graph" className="text-[10px] gap-1"><Network className="h-3 w-3" />Graph</TabsTrigger>
          <TabsTrigger value="contradictions" className="text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" />Contradictions
            {unresolvedCount > 0 && <Badge variant="destructive" className="text-[8px] px-1 py-0 ml-1">{unresolvedCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ═══ GRAPH TAB ═══ */}
        <TabsContent value="graph" className="flex-1 flex min-h-0 mt-0">
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 bg-background overflow-hidden cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
              {nodes.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[10px] text-label-muted font-mono">
                  NO GRAPH DATA — RUN TASKS TO BUILD KNOWLEDGE
                </div>
              ) : (
                <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="select-none">
                  <defs>
                    <filter id="node-glow">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* Contradiction links */}
                    {contradictions.filter(c => !c.resolution).map(c => {
                      const a = nodeMap.get(c.node_a_id);
                      const b = nodeMap.get(c.node_b_id);
                      if (!a || !b) return null;
                      return (
                        <line key={`contra-${c.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke={stanceColors[c.stance] || stanceColors.contradicts}
                          strokeWidth={2.5} strokeDasharray="6 3" strokeOpacity={0.8} />
                      );
                    })}
                    {/* Edges */}
                    {edges.map(e => {
                      const s = nodeMap.get(e.source_id);
                      const t = nodeMap.get(e.target_id);
                      if (!s || !t) return null;
                      const isHighlighted = selectedNode && (e.source_id === selectedNode.id || e.target_id === selectedNode.id);
                      const isContraEdge = e.edge_type === 'contradicts';
                      return (
                        <g key={e.id}>
                          <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                            stroke={isContraEdge ? 'hsl(var(--status-error))' : isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                            strokeWidth={isHighlighted ? 2 : 1} strokeOpacity={isHighlighted ? 0.9 : 0.4}
                            strokeDasharray={isContraEdge ? '4 2' : undefined} />
                          {isHighlighted && (
                            <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 4}
                              fill="hsl(var(--muted-foreground))" fontSize={8} textAnchor="middle" opacity={0.8}>
                              {e.relation}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {/* Nodes */}
                    {layoutNodes.map(n => {
                      const isSelected = selectedNode?.id === n.id;
                      const isConnected = selectedNode && connectedEdges.some(e => e.source_id === n.id || e.target_id === n.id);
                      const isContradicted = contradictionNodeIds.has(n.id);
                      const opacity = selectedNode ? (isSelected || isConnected ? 1 : 0.2) : 1;
                      const nodeColor = getColor(n.node_type);
                      return (
                        <g key={n.id} onClick={(e) => { e.stopPropagation(); setSelectedNode(isSelected ? null : n); }} className="cursor-pointer">
                          {/* Glow ring for selected */}
                          {isSelected && (
                            <circle cx={n.x} cy={n.y} r={16} fill={nodeColor} opacity={0.15} filter="url(#node-glow)" />
                          )}
                          {/* Contradiction ring */}
                          {isContradicted && (
                            <circle cx={n.x} cy={n.y} r={isSelected ? 14 : 11}
                              fill="none" stroke="hsl(var(--status-error))" strokeWidth={2}
                              strokeDasharray="3 2" opacity={0.8} />
                          )}
                          {/* Main node */}
                          <circle cx={n.x} cy={n.y} r={isSelected ? 10 : 7}
                            fill={nodeColor} opacity={opacity}
                            stroke={isSelected ? 'hsl(var(--foreground))' : 'none'} strokeWidth={2}
                            style={isSelected ? { filter: `drop-shadow(0 0 4px ${nodeColor})` } : undefined} />
                          {/* Confidence arc */}
                          {n.confidence > 0 && (
                            <circle cx={n.x} cy={n.y} r={isSelected ? 10 : 7}
                              fill="none" stroke="hsl(var(--foreground))" strokeWidth={1}
                              strokeDasharray={`${n.confidence * 44} ${44 - n.confidence * 44}`}
                              opacity={0.3} />
                          )}
                          <text x={n.x} y={n.y + 16} fill="hsl(var(--foreground))" fontSize={9}
                            textAnchor="middle" opacity={opacity * 0.8} fontWeight={isSelected ? 'bold' : 'normal'}>
                            {n.label.length > 20 ? n.label.slice(0, 18) + '…' : n.label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              )}
            </div>

            {/* Detail Sidebar */}
            {selectedNode && (
              <div className="w-56 border-l border-border bg-card p-3 space-y-3">
                <div>
                  <h3 className="text-[10px] font-mono font-bold text-label-primary truncate">{selectedNode.label}</h3>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <StatusBadge status={selectedNode.node_type} />
                    <Badge variant="outline" className="text-[8px] h-4">{selectedNode.evidence_type}</Badge>
                    {selectedNode.confidence > 0 && (
                      <Badge variant="secondary" className="text-[8px] h-4">
                        {(selectedNode.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  {contradictionNodeIds.has(selectedNode.id) && (
                    <Badge variant="destructive" className="text-[8px] mt-1 gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> Contradicted
                    </Badge>
                  )}
                </div>

                <div>
                  <p className="text-[9px] text-label-muted uppercase mb-1 font-mono">Connections ({connectedEdges.length})</p>
                  <ScrollArea className="max-h-[200px]">
                    {connectedEdges.map(e => {
                      const other = e.source_id === selectedNode.id ? nodeMap.get(e.target_id) : nodeMap.get(e.source_id);
                      return (
                        <div key={e.id} className="text-[9px] py-1 border-b border-border/50">
                          <StatusBadge status={e.edge_type === 'contradicts' ? 'fail' : 'active'} size="sm" />
                          <span className="ml-1 text-label-muted">{e.relation}</span>
                          <span className="ml-1 text-label-primary">{other?.label || '?'}</span>
                        </div>
                      );
                    })}
                  </ScrollArea>
                </div>

                <Button size="sm" variant="ghost" onClick={() => setSelectedNode(null)} className="w-full h-6 text-[9px] font-mono">CLOSE</Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ CONTRADICTIONS TAB ═══ */}
        <TabsContent value="contradictions" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {contradictions.length === 0 ? (
                <div className="text-center py-12 text-[10px] text-label-muted font-mono">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  NO CONTRADICTIONS DETECTED
                </div>
              ) : (
                <>
                  {contradictions.filter(c => !c.resolution).length > 0 && (
                    <div className="mb-3">
                      <h3 className="text-[10px] font-mono font-semibold text-status-error flex items-center gap-1 mb-2">
                        <AlertTriangle className="h-3 w-3" /> UNRESOLVED ({contradictions.filter(c => !c.resolution).length})
                      </h3>
                      {contradictions.filter(c => !c.resolution).map(c => (
                        <ContradictionCard key={c.id} contradiction={c} nodeById={nodeById}
                          selected={selectedContradiction?.id === c.id}
                          onSelect={() => setSelectedContradiction(selectedContradiction?.id === c.id ? null : c)}
                          onResolve={handleResolve} resolving={resolving} />
                      ))}
                    </div>
                  )}
                  {contradictions.filter(c => c.resolution).length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-mono font-semibold text-label-muted flex items-center gap-1 mb-2">
                        <CheckCircle2 className="h-3 w-3" /> RESOLVED ({contradictions.filter(c => c.resolution).length})
                      </h3>
                      {contradictions.filter(c => c.resolution).map(c => (
                        <ContradictionCard key={c.id} contradiction={c} nodeById={nodeById}
                          selected={selectedContradiction?.id === c.id}
                          onSelect={() => setSelectedContradiction(selectedContradiction?.id === c.id ? null : c)}
                          onResolve={handleResolve} resolving={resolving} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Contradiction Card ──────────────────────────────
function ContradictionCard({ contradiction: c, nodeById, selected, onSelect, onResolve, resolving }: {
  contradiction: Contradiction;
  nodeById: Map<string, EvidenceNode>;
  selected: boolean;
  onSelect: () => void;
  onResolve: (c: Contradiction, resolution: string, reasoning: string) => void;
  resolving: boolean;
}) {
  const [reasoning, setReasoning] = useState('');
  const nodeA = nodeById.get(c.node_a_id);
  const nodeB = nodeById.get(c.node_b_id);

  return (
    <div className={`p-2 rounded border transition-colors cursor-pointer mb-1.5 ${selected ? 'border-primary bg-primary/5' : 'border-border/50 bg-card/50 hover:bg-card'}`}
      onClick={onSelect}>
      <div className="flex items-center gap-1.5 mb-1">
        <StatusBadge status={c.resolution ? 'done' : c.stance === 'contradicts' ? 'error' : 'warning'} size="sm" />
        <span className="text-[9px] font-mono text-label-muted">sim: {(c.similarity_score * 100).toFixed(0)}%</span>
        {c.resolution && <Badge variant="outline" className="text-[8px] h-4 ml-auto">{c.resolution}</Badge>}
      </div>
      <div className="text-[9px] space-y-0.5">
        <div><span className="text-label-muted font-mono">A:</span> <span className="text-label-primary">{nodeA?.label || c.node_a_id.slice(0, 8)}</span></div>
        <div><span className="text-label-muted font-mono">B:</span> <span className="text-label-primary">{nodeB?.label || c.node_b_id.slice(0, 8)}</span></div>
      </div>

      {selected && !c.resolution && (
        <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
          <Textarea value={reasoning} onChange={e => setReasoning(e.target.value)}
            placeholder="Resolution reasoning…" className="text-[10px] h-14 resize-none bg-background" />
          <div className="flex gap-1">
            {['a_wins', 'b_wins', 'both_valid', 'merged'].map(r => (
              <Button key={r} size="sm" variant="outline" disabled={resolving || !reasoning}
                onClick={() => onResolve(c, r, reasoning)}
                className="text-[8px] h-5 px-1.5 font-mono">
                {r.replace('_', ' ')}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
