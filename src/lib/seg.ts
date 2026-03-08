// ============================================
// SEG: Shared Evidence Graph — Evidence + Contradiction Detection
// ============================================
// Enhances the knowledge graph with evidence types, bitemporal tracking,
// confidence scores, and automated contradiction detection.

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
  evidence_type: EvidenceType;
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
  edge_type: EdgeType;
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
  stance: ContradictionStance;
  detection_method: string;
  resolution: ContradictionResolution;
  resolution_reasoning: string | null;
  resolved_by_run_id: string | null;
  resolved_at: string | null;
  run_id: string | null;
  witness_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// SEG Service
// ============================================

export class SharedEvidenceGraph {

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

  async createContradiction(params: {
    node_a_id: string;
    node_b_id: string;
    similarity_score: number;
    stance?: ContradictionStance;
    detection_method?: string;
    run_id?: string;
    witness_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Contradiction | null> {
    const { data, error } = await supabase
      .from('contradictions')
      .insert({
        node_a_id: params.node_a_id,
        node_b_id: params.node_b_id,
        similarity_score: params.similarity_score,
        stance: params.stance ?? 'contradicts',
        detection_method: params.detection_method ?? 'semantic',
        run_id: params.run_id ?? null,
        witness_id: params.witness_id ?? null,
        metadata: params.metadata ?? {},
      } as any)
      .select()
      .single();

    if (error) { console.error('SEG: contradiction creation error:', error); return null; }
    return data as unknown as Contradiction;
  }

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
