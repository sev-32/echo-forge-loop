import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import * as persistence from '@/lib/persistence';

interface KGNode {
  id: string;
  label: string;
  node_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  // layout
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface KGEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  weight: number;
  metadata: Record<string, unknown>;
}

const typeColors: Record<string, string> = {
  concept: 'hsl(142, 76%, 45%)',
  entity: 'hsl(190, 80%, 45%)',
  process: 'hsl(260, 80%, 70%)',
  pattern: 'hsl(38, 92%, 55%)',
  discovery: 'hsl(0, 72%, 55%)',
  default: 'hsl(215, 15%, 55%)',
};

function getColor(type: string) { return typeColors[type] || typeColors.default; }

// Simple force-directed layout
function forceLayout(nodes: KGNode[], edges: KGEdge[], width: number, height: number, iterations = 80) {
  const ns = nodes.map(n => ({ ...n, x: n.x ?? Math.random() * width, y: n.y ?? Math.random() * height, vx: 0, vy: 0 }));
  const nodeMap = new Map(ns.map(n => [n.id, n]));

  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations;
    // Repulsion
    for (let a = 0; a < ns.length; a++) {
      for (let b = a + 1; b < ns.length; b++) {
        const dx = ns[b].x! - ns[a].x!;
        const dy = ns[b].y! - ns[a].y!;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (200 * alpha) / dist;
        ns[a].vx! -= (dx / dist) * force;
        ns[a].vy! -= (dy / dist) * force;
        ns[b].vx! += (dx / dist) * force;
        ns[b].vy! += (dy / dist) * force;
      }
    }
    // Attraction along edges
    for (const e of edges) {
      const s = nodeMap.get(e.source_id);
      const t = nodeMap.get(e.target_id);
      if (!s || !t) continue;
      const dx = t.x! - s.x!;
      const dy = t.y! - s.y!;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = dist * 0.01 * alpha * e.weight;
      s.vx! += (dx / dist) * force;
      s.vy! += (dy / dist) * force;
      t.vx! -= (dx / dist) * force;
      t.vy! -= (dy / dist) * force;
    }
    // Center gravity
    for (const n of ns) {
      n.vx! += (width / 2 - n.x!) * 0.005 * alpha;
      n.vy! += (height / 2 - n.y!) * 0.005 * alpha;
      n.x! += n.vx! * 0.5;
      n.y! += n.vy! * 0.5;
      n.vx! *= 0.8;
      n.vy! *= 0.8;
      n.x = Math.max(30, Math.min(width - 30, n.x!));
      n.y = Math.max(30, Math.min(height - 30, n.y!));
    }
  }
  return ns;
}

export function KnowledgeGraphPanel() {
  const [nodes, setNodes] = useState<KGNode[]>([]);
  const [edges, setEdges] = useState<KGEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const W = 800, H = 500;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const kg = await persistence.fetchKnowledgeGraph();
      setNodes(kg.nodes as KGNode[]);
      setEdges(kg.edges as KGEdge[]);
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

  const handleMouseDown = (e: React.MouseEvent) => { dragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan(p => ({ x: p.x + (e.clientX - lastMouse.current.x), y: p.y + (e.clientY - lastMouse.current.y) }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { dragging.current = false; };

  const connectedEdges = selectedNode ? edges.filter(e => e.source_id === selectedNode.id || e.target_id === selectedNode.id) : [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Knowledge Graph</span>
        <Badge variant="outline" className="text-[10px]">{nodes.length} nodes • {edges.length} edges</Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="h-7 w-7 p-0"><ZoomIn className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} className="h-7 w-7 p-0"><ZoomOut className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="h-7 w-7 p-0"><Maximize2 className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={loadData} disabled={loading} className="h-7 gap-1 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Graph Canvas */}
        <div className="flex-1 bg-surface-0 overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          {nodes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No knowledge graph data yet. Run tasks with AI reflection to build the graph.
            </div>
          ) : (
            <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="select-none">
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {edges.map(e => {
                  const s = nodeMap.get(e.source_id);
                  const t = nodeMap.get(e.target_id);
                  if (!s || !t) return null;
                  const isHighlighted = selectedNode && (e.source_id === selectedNode.id || e.target_id === selectedNode.id);
                  return (
                    <g key={e.id}>
                      <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                        stroke={isHighlighted ? 'hsl(142, 76%, 45%)' : 'hsl(220, 16%, 30%)'}
                        strokeWidth={isHighlighted ? 2 : 1} strokeOpacity={isHighlighted ? 0.9 : 0.4} />
                      <text x={(s.x! + t.x!) / 2} y={(s.y! + t.y!) / 2 - 4}
                        fill="hsl(215, 15%, 55%)" fontSize={8} textAnchor="middle" opacity={isHighlighted ? 1 : 0.3}>
                        {e.relation}
                      </text>
                    </g>
                  );
                })}
                {/* Nodes */}
                {layoutNodes.map(n => {
                  const isSelected = selectedNode?.id === n.id;
                  const isConnected = selectedNode && connectedEdges.some(e => e.source_id === n.id || e.target_id === n.id);
                  const opacity = selectedNode ? (isSelected || isConnected ? 1 : 0.25) : 1;
                  return (
                    <g key={n.id} onClick={(e) => { e.stopPropagation(); setSelectedNode(isSelected ? null : n); }} className="cursor-pointer">
                      <circle cx={n.x} cy={n.y} r={isSelected ? 10 : 7}
                        fill={getColor(n.node_type)} opacity={opacity}
                        stroke={isSelected ? '#fff' : 'none'} strokeWidth={2} />
                      <text x={n.x} y={n.y! + 16} fill="hsl(210, 20%, 85%)" fontSize={9}
                        textAnchor="middle" opacity={opacity} fontWeight={isSelected ? 'bold' : 'normal'}>
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
          <div className="w-56 border-l border-border bg-surface-1 p-3 space-y-3">
            <div>
              <h3 className="text-xs font-bold truncate">{selectedNode.label}</h3>
              <Badge variant="outline" className="text-[10px] mt-1" style={{ borderColor: getColor(selectedNode.node_type), color: getColor(selectedNode.node_type) }}>
                {selectedNode.node_type}
              </Badge>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(selectedNode.created_at).toLocaleString()}</p>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Connections ({connectedEdges.length})</p>
              <ScrollArea className="max-h-[200px]">
                {connectedEdges.map(e => {
                  const other = e.source_id === selectedNode.id ? nodeMap.get(e.target_id) : nodeMap.get(e.source_id);
                  return (
                    <div key={e.id} className="text-[10px] py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{e.relation}</span>
                      <span className="ml-1 text-foreground">{other?.label || 'unknown'}</span>
                      <Badge variant="outline" className="text-[9px] ml-1 px-1 py-0">w:{e.weight}</Badge>
                    </div>
                  );
                })}
              </ScrollArea>
            </div>

            {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Metadata</p>
                <pre className="text-[9px] bg-surface-0 rounded p-1.5 overflow-auto max-h-[100px] text-muted-foreground">
                  {JSON.stringify(selectedNode.metadata, null, 1)}
                </pre>
              </div>
            )}

            <Button size="sm" variant="ghost" onClick={() => setSelectedNode(null)} className="w-full h-6 text-[10px]">Close</Button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-1.5 border-t border-border flex items-center gap-4">
        {Object.entries(typeColors).filter(([k]) => k !== 'default').map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-muted-foreground capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
