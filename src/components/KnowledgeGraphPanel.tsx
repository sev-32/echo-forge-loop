import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize2, AlertTriangle, CheckCircle2, Scale, Shield } from 'lucide-react';
import { seg, type EvidenceNode, type EvidenceEdge, type Contradiction } from '@/lib/seg';

// ─── Layout types ────────────────────────────────────
interface LayoutNode extends EvidenceNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  contradicts: 'hsl(0, 85%, 60%)',
  weakly_contradicts: 'hsl(38, 92%, 55%)',
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
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const W = 800, H = 500;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [graph, contras] = await Promise.all([
        seg.getFullGraph(),
        seg.getContradictions(),
      ]);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setContradictions(contras);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const layoutNodes = useMemo(() => {
    if (nodes.length === 0) return [];
    return forceLayout(nodes, edges, W, H);
  }, [nodes, edges]);

  const nodeMap = useMemo(() => new Map(layoutNodes.map(n => [n.id, n])), [layoutNodes]);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // Contradiction node IDs for highlighting
  const contradictionNodeIds = useMemo(() => {
    const ids = new Set<string>();
    contradictions.filter(c => !c.resolution).forEach(c => {
      ids.add(c.node_a_id);
      ids.add(c.node_b_id);
    });
    return ids;
  }, [contradictions]);

  const unresolvedCount = contradictions.filter(c => !c.resolution).length;

  const handleMouseDown = (e: React.MouseEvent) => { dragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan(p => ({ x: p.x + (e.clientX - lastMouse.current.x), y: p.y + (e.clientY - lastMouse.current.y) }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { dragging.current = false; };

  const connectedEdges = selectedNode ? edges.filter(e => e.source_id === selectedNode.id || e.target_id === selectedNode.id) : [];

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
        <span className="font-semibold text-sm">Evidence Graph (SEG)</span>
        <Badge variant="outline" className="text-[10px]">{nodes.length} nodes • {edges.length} edges</Badge>
        {unresolvedCount > 0 && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" /> {unresolvedCount} conflict{unresolvedCount > 1 ? 's' : ''}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="h-7 w-7 p-0"><ZoomIn className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} className="h-7 w-7 p-0"><ZoomOut className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="h-7 w-7 p-0"><Maximize2 className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={loadData} disabled={loading} className="h-7 gap-1 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 w-fit">
          <TabsTrigger value="graph" className="text-xs gap-1"><Network className="h-3 w-3" />Graph</TabsTrigger>
          <TabsTrigger value="contradictions" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3" />Contradictions
            {unresolvedCount > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-1">{unresolvedCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ═══ GRAPH TAB ═══ */}
        <TabsContent value="graph" className="flex-1 flex min-h-0 mt-0">
          <div className="flex-1 flex min-h-0">
            {/* Graph Canvas */}
            <div className="flex-1 bg-background overflow-hidden cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
              {nodes.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No knowledge graph data yet. Run tasks with AI reflection to build the graph.
                </div>
              ) : (
                <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="select-none">
                  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* Contradiction links (dashed red) */}
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
                            stroke={isContraEdge ? 'hsl(0, 85%, 60%)' : isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                            strokeWidth={isHighlighted ? 2 : 1} strokeOpacity={isHighlighted ? 0.9 : 0.4}
                            strokeDasharray={isContraEdge ? '4 2' : undefined} />
                          <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 4}
                            fill="hsl(var(--muted-foreground))" fontSize={8} textAnchor="middle" opacity={isHighlighted ? 1 : 0.3}>
                            {e.relation}
                          </text>
                        </g>
                      );
                    })}
                    {/* Nodes */}
                    {layoutNodes.map(n => {
                      const isSelected = selectedNode?.id === n.id;
                      const isConnected = selectedNode && connectedEdges.some(e => e.source_id === n.id || e.target_id === n.id);
                      const isContradicted = contradictionNodeIds.has(n.id);
                      const opacity = selectedNode ? (isSelected || isConnected ? 1 : 0.25) : 1;
                      return (
                        <g key={n.id} onClick={(e) => { e.stopPropagation(); setSelectedNode(isSelected ? null : n); }} className="cursor-pointer">
                          {/* Contradiction ring */}
                          {isContradicted && (
                            <circle cx={n.x} cy={n.y} r={isSelected ? 14 : 11}
                              fill="none" stroke="hsl(0, 85%, 60%)" strokeWidth={2}
                              strokeDasharray="3 2" opacity={0.8} />
                          )}
                          <circle cx={n.x} cy={n.y} r={isSelected ? 10 : 7}
                            fill={getColor(n.node_type)} opacity={opacity}
                            stroke={isSelected ? 'hsl(var(--foreground))' : 'none'} strokeWidth={2} />
                          {/* Confidence indicator */}
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
                  <h3 className="text-xs font-bold truncate">{selectedNode.label}</h3>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: getColor(selectedNode.node_type), color: getColor(selectedNode.node_type) }}>
                      {selectedNode.node_type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{selectedNode.evidence_type}</Badge>
                    {selectedNode.confidence > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        conf: {(selectedNode.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  {contradictionNodeIds.has(selectedNode.id) && (
                    <Badge variant="destructive" className="text-[10px] mt-1 gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> Has contradictions
                    </Badge>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(selectedNode.created_at).toLocaleString()}</p>
                </div>

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Connections ({connectedEdges.length})</p>
                  <ScrollArea className="max-h-[200px]">
                    {connectedEdges.map(e => {
                      const other = e.source_id === selectedNode.id ? nodeMap.get(e.target_id) : nodeMap.get(e.source_id);
                      return (
                        <div key={e.id} className="text-[10px] py-1 border-b border-border/50">
                          <Badge variant={e.edge_type === 'contradicts' ? 'destructive' : 'outline'} className="text-[9px] px-1 py-0">
                            {e.edge_type}
                          </Badge>
                          <span className="ml-1 text-muted-foreground">{e.relation}</span>
                          <span className="ml-1 text-foreground">{other?.label || 'unknown'}</span>
                        </div>
                      );
                    })}
                  </ScrollArea>
                </div>

                <Button size="sm" variant="ghost" onClick={() => setSelectedNode(null)} className="w-full h-6 text-[10px]">Close</Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ CONTRADICTIONS TAB ═══ */}
        <TabsContent value="contradictions" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {contradictions.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No contradictions detected yet. As the knowledge graph grows, semantic conflicts will surface here.
                </div>
              ) : (
                <>
                  {/* Unresolved first */}
                  {contradictions.filter(c => !c.resolution).length > 0 && (
                    <div className="mb-3">
                      <h3 className="text-xs font-semibold text-destructive flex items-center gap-1 mb-2">
                        <AlertTriangle className="h-3 w-3" /> Unresolved ({contradictions.filter(c => !c.resolution).length})
                      </h3>
                      {contradictions.filter(c => !c.resolution).map(c => (
                        <ContradictionCard key={c.id} contradiction={c} nodeById={nodeById}
                          selected={selectedContradiction?.id === c.id}
                          onSelect={() => setSelectedContradiction(selectedContradiction?.id === c.id ? null : c)}
                          onResolve={handleResolve} resolving={resolving} />
                      ))}
                    </div>
                  )}
                  {/* Resolved */}
                  {contradictions.filter(c => c.resolution).length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                        <CheckCircle2 className="h-3 w-3" /> Resolved ({contradictions.filter(c => c.resolution).length})
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

      {/* Legend */}
      <div className="px-3 py-1.5 border-t border-border flex items-center gap-4 flex-wrap">
        {Object.entries(typeColors).filter(([k]) => k !== 'default').map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-muted-foreground capitalize">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <div className="w-4 h-0 border-t-2 border-dashed border-destructive" />
          <span className="text-[10px] text-muted-foreground">contradiction</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CONTRADICTION CARD
// ═══════════════════════════════════════════════════════

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
  const meta = c.metadata as any;

  return (
    <Card className={`mb-2 cursor-pointer transition-all ${selected ? 'ring-1 ring-primary' : ''} ${!c.resolution ? 'border-destructive/30' : 'opacity-70'}`}
      onClick={onSelect}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant={!c.resolution ? 'destructive' : 'secondary'} className="text-[9px] px-1.5 py-0">
                {c.stance.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                sim: {(c.similarity_score * 100).toFixed(0)}%
              </Badge>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {c.detection_method}
              </Badge>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center">
              <div className="text-[11px] font-medium truncate" title={nodeA?.label || meta?.node_a_label}>
                {nodeA?.label || meta?.node_a_label || c.node_a_id.slice(0, 8)}
              </div>
              <Scale className="h-3 w-3 text-muted-foreground" />
              <div className="text-[11px] font-medium truncate text-right" title={nodeB?.label || meta?.node_b_label}>
                {nodeB?.label || meta?.node_b_label || c.node_b_id.slice(0, 8)}
              </div>
            </div>
            {nodeA && nodeB && (
              <div className="grid grid-cols-[1fr_auto_1fr] gap-1 mt-0.5">
                <span className="text-[9px] text-muted-foreground">conf: {((nodeA.confidence ?? 0) * 100).toFixed(0)}%</span>
                <span />
                <span className="text-[9px] text-muted-foreground text-right">conf: {((nodeB.confidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>

        {c.resolution && (
          <div className="bg-secondary/50 rounded p-1.5">
            <Badge variant="secondary" className="text-[9px]">{c.resolution.replace('_', ' ')}</Badge>
            {c.resolution_reasoning && (
              <p className="text-[9px] text-muted-foreground mt-0.5">{c.resolution_reasoning}</p>
            )}
          </div>
        )}

        {/* Resolution controls */}
        {selected && !c.resolution && (
          <div className="space-y-1.5 pt-1 border-t border-border" onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Resolve</p>
            <textarea
              className="w-full text-[10px] bg-background border border-border rounded p-1.5 resize-none h-12"
              placeholder="Resolution reasoning..."
              value={reasoning}
              onChange={e => setReasoning(e.target.value)}
            />
            <div className="flex gap-1 flex-wrap">
              {[
                { value: 'a_wins', label: 'A wins', variant: 'outline' as const },
                { value: 'b_wins', label: 'B wins', variant: 'outline' as const },
                { value: 'both_valid', label: 'Both valid', variant: 'secondary' as const },
                { value: 'merged', label: 'Merge', variant: 'default' as const },
              ].map(opt => (
                <Button key={opt.value} size="sm" variant={opt.variant}
                  className="h-6 text-[10px] px-2"
                  disabled={resolving}
                  onClick={() => onResolve(c, opt.value, reasoning || `Resolved as ${opt.label}`)}>
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
