// ============================================
// SEG: Shared Evidence Graph — Evidence + Contradiction Detection
// ============================================

import { supabase } from '@/integrations/supabase/client';

// ============================================
// Types
// ============================================

export type EvidenceType = 'concept' | 'claim' | 'source' | 'derivation' | 'witness';
export type EdgeType = 'related_to' | 'supports' | 'contradicts' | 'derives' | 'witnesses' | 'supersedes';
export type ContradictionStance = 'contradicts' | 'weakly_contradicts' | 'tension';
export type ContradictionResolution = 'a_wins' | 'b_wins' | 'both_valid' | 'merged' | null;

export interface EvidenceNode {
  id: string;
  label: string;
  node_type: string;
  evidence_type: string;
  confidence: number;
  witness_id: string | null;
  run_id: string | null;
  atom_id: string | null;
  valid_time_start: string | null;
  valid_time_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface EvidenceEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  edge_type: string;
  weight: number;
  strength: number;
  witness_id: string | null;
  run_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Contradiction {
  id: string;
  node_a_id: string;
  node_b_id: string;
  similarity_score: number;
  stance: string;
  detection_method: string;
  resolution: string | null;
  resolution_reasoning: string | null;
  resolved_by_run_id: string | null;
  resolved_at: string | null;
  run_id: string | null;
  witness_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Semantic Similarity (token-based Jaccard + overlap)
// ============================================

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) { if (b.has(w)) intersection++; }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

/** Check if two labels are semantically similar enough to be potential contradictions */
function computeSimilarity(labelA: string, labelB: string): number {
  const tokA = tokenize(labelA);
  const tokB = tokenize(labelB);
  return jaccardSimilarity(tokA, tokB);
}

/** Detect stance between two nodes based on edge context and label analysis */
function detectStance(nodeA: EvidenceNode, nodeB: EvidenceNode, edges: EvidenceEdge[]): ContradictionStance | null {
  // Check if there's already a 'contradicts' edge between them
  const hasContradictEdge = edges.some(e =>
    (e.source_id === nodeA.id && e.target_id === nodeB.id && e.edge_type === 'contradicts') ||
    (e.source_id === nodeB.id && e.target_id === nodeA.id && e.edge_type === 'contradicts')
  );
  if (hasContradictEdge) return 'contradicts';

  // Negation patterns in labels
  const negationPairs = [
    [/\bnot\b/i, /\bshould\b/i], [/\bavoid\b/i, /\buse\b/i],
    [/\bdon't\b/i, /\bdo\b/i], [/\bnever\b/i, /\balways\b/i],
    [/\bdeprecated\b/i, /\brecommended\b/i], [/\banti-pattern\b/i, /\bbest practice\b/i],
    [/\bweak\b/i, /\bstrong\b/i], [/\bunsafe\b/i, /\bsafe\b/i],
  ];

  const la = nodeA.label.toLowerCase();
  const lb = nodeB.label.toLowerCase();

  for (const [patA, patB] of negationPairs) {
    if ((patA.test(la) && patB.test(lb)) || (patB.test(la) && patA.test(lb))) {
      return 'weakly_contradicts';
    }
  }

  // If same topic (high similarity) but different confidence directions, tension
  if (nodeA.confidence > 0 && nodeB.confidence > 0) {
    const confDiff = Math.abs(nodeA.confidence - nodeB.confidence);
    if (confDiff > 0.4) return 'tension';
  }

  return null;
}

// ============================================
// SEG Service
// ============================================

export class SharedEvidenceGraph {

  // --- Contradiction Detection ---

  /**
   * Scan new nodes against existing graph for contradictions.
   * Returns detected contradictions that were persisted.
   */
  async detectContradictions(newNodeIds: string[], runId: string, witnessId?: string): Promise<Contradiction[]> {
    if (newNodeIds.length === 0) return [];

    // Fetch new nodes
    const { data: newNodes } = await supabase
      .from('knowledge_nodes').select('*')
      .in('id', newNodeIds);
    if (!newNodes || newNodes.length === 0) return [];

    // Fetch existing nodes (excluding new ones) — limit to recent for performance
    const { data: existingNodes } = await supabase
      .from('knowledge_nodes').select('*')
      .not('id', 'in', `(${newNodeIds.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!existingNodes || existingNodes.length === 0) return [];

    // Fetch all edges for stance detection
    const { data: allEdges } = await supabase
      .from('knowledge_edges').select('*');

    const edges = (allEdges ?? []) as unknown as EvidenceEdge[];
    const detected: Contradiction[] = [];

    for (const newNode of newNodes as unknown as EvidenceNode[]) {
      for (const existing of existingNodes as unknown as EvidenceNode[]) {
        // Skip if same node type is concept and labels are too different
        const similarity = computeSimilarity(newNode.label, existing.label);

        // Only consider pairs with meaningful overlap (>= 0.3 Jaccard)
        if (similarity < 0.3) continue;

        const stance = detectStance(newNode, existing, edges);
        if (!stance) continue;

        // Create the contradiction record
        const { data, error } = await supabase
          .from('contradictions')
          .insert({
            node_a_id: newNode.id,
            node_b_id: existing.id,
            similarity_score: similarity,
            stance,
            detection_method: 'semantic_jaccard',
            run_id: runId,
            witness_id: witnessId ?? null,
            metadata: {
              node_a_label: newNode.label,
              node_b_label: existing.label,
              node_a_confidence: newNode.confidence,
              node_b_confidence: existing.confidence,
            },
          } as any)
          .select()
          .single();

        if (!error && data) {
          detected.push(data as unknown as Contradiction);
        }
      }
    }

    return detected;
  }

  // --- Node Creation with Evidence ---

  async createNode(params: {
    label: string;
    node_type?: string;
    evidence_type?: EvidenceType;
    confidence?: number;
    witness_id?: string;
    run_id?: string;
    atom_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<EvidenceNode | null> {
    const { data, error } = await supabase
      .from('knowledge_nodes')
      .insert({
        label: params.label,
        node_type: params.node_type ?? 'concept',
        evidence_type: params.evidence_type ?? 'concept',
        confidence: params.confidence ?? 0.5,
        witness_id: params.witness_id ?? null,
        run_id: params.run_id ?? null,
        atom_id: params.atom_id ?? null,
        metadata: params.metadata ?? {},
      } as any)
      .select()
      .single();

    if (error) { console.error('SEG: node creation error:', error); return null; }
    return data as unknown as EvidenceNode;
  }

  // --- Edge Creation with Evidence ---

  async createEdge(params: {
    source_id: string;
    target_id: string;
    relation?: string;
    edge_type?: EdgeType;
    weight?: number;
    strength?: number;
    witness_id?: string;
    run_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<EvidenceEdge | null> {
    const { data, error } = await supabase
      .from('knowledge_edges')
      .insert({
        source_id: params.source_id,
        target_id: params.target_id,
        relation: params.relation ?? 'related_to',
        edge_type: params.edge_type ?? 'related_to',
        weight: params.weight ?? 1.0,
        strength: params.strength ?? 0.5,
        witness_id: params.witness_id ?? null,
        run_id: params.run_id ?? null,
        metadata: params.metadata ?? {},
      } as any)
      .select()
      .single();

    if (error) { console.error('SEG: edge creation error:', error); return null; }
    return data as unknown as EvidenceEdge;
  }

  // --- Contradiction Management ---

  async resolveContradiction(contradictionId: string, resolution: ContradictionResolution, reasoning: string, resolvedByRunId?: string): Promise<boolean> {
    const { error } = await supabase
      .from('contradictions')
      .update({
        resolution,
        resolution_reasoning: reasoning,
        resolved_by_run_id: resolvedByRunId ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', contradictionId);

    return !error;
  }

  // --- Queries ---

  async getFullGraph(): Promise<{ nodes: EvidenceNode[]; edges: EvidenceEdge[] }> {
    const [nodesRes, edgesRes] = await Promise.all([
      supabase.from('knowledge_nodes').select('*').order('created_at', { ascending: false }),
      supabase.from('knowledge_edges').select('*'),
    ]);

    return {
      nodes: (nodesRes.data ?? []) as unknown as EvidenceNode[],
      edges: (edgesRes.data ?? []) as unknown as EvidenceEdge[],
    };
  }

  async getContradictions(options?: { unresolved_only?: boolean; run_id?: string }): Promise<Contradiction[]> {
    let query = supabase.from('contradictions').select('*').order('created_at', { ascending: false });

    if (options?.unresolved_only) query = query.is('resolution', null);
    if (options?.run_id) query = query.eq('run_id', options.run_id);

    const { data, error } = await query;
    if (error) { console.error('SEG: contradictions error:', error); return []; }
    return (data ?? []) as unknown as Contradiction[];
  }

  // --- Statistics ---

  async getStats(): Promise<{
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
    totalContradictions: number;
    unresolvedContradictions: number;
    avgConfidence: number;
  }> {
    const [nodesRes, edgesRes, contradictionsRes] = await Promise.all([
      supabase.from('knowledge_nodes').select('evidence_type, confidence'),
      supabase.from('knowledge_edges').select('edge_type'),
      supabase.from('contradictions').select('resolution'),
    ]);

    const nodes = nodesRes.data ?? [];
    const edges = edgesRes.data ?? [];
    const contradictions = contradictionsRes.data ?? [];

    const nodesByType: Record<string, number> = {};
    let totalConfidence = 0;
    for (const n of nodes) {
      const nt = (n as any).evidence_type || 'concept';
      nodesByType[nt] = (nodesByType[nt] || 0) + 1;
      totalConfidence += (n as any).confidence || 0;
    }

    const edgesByType: Record<string, number> = {};
    for (const e of edges) {
      const et = (e as any).edge_type || 'related_to';
      edgesByType[et] = (edgesByType[et] || 0) + 1;
    }

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType,
      edgesByType,
      totalContradictions: contradictions.length,
      unresolvedContradictions: contradictions.filter(c => (c as any).resolution === null).length,
      avgConfidence: nodes.length > 0 ? totalConfidence / nodes.length : 0,
    };
  }
}

// Singleton
export const seg = new SharedEvidenceGraph();
