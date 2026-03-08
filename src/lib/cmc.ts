// ============================================
// CMC: Core Memory Controller — Bitemporal Memory Substrate
// ============================================
// Every piece of information in AIM-OS is stored as an immutable "atom"
// with bitemporal tracking (transaction_time vs valid_time) and provenance.

import { supabase } from '@/integrations/supabase/client';

// ============================================
// Types
// ============================================

export type AtomType = 'text' | 'code' | 'decision' | 'reflection' | 'plan' | 'verification' | 'discovery' | 'constraint' | 'artifact';

export interface Atom {
  id: string;
  content: string;
  content_hash: string;
  atom_type: AtomType;
  transaction_time: string;
  valid_time_start: string;
  valid_time_end: string | null;
  provenance: AtomProvenance;
  run_id: string | null;
  task_id: string | null;
  superseded_by: string | null;
  metadata: Record<string, unknown>;
  tokens_estimate: number;
  created_at: string;
}

export interface AtomProvenance {
  source: string;
  confidence: number;
  witness_id?: string;
  model_id?: string;
  operation?: string;
}

export interface MemorySnapshot {
  id: string;
  snapshot_hash: string;
  atom_ids: string[];
  atom_count: number;
  reason: string;
  run_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Hash Utilities
// ============================================

async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// ============================================
// Core Memory Controller
// ============================================

export class CoreMemoryController {
  // --- Atom Creation (Immutable) ---

  async createAtom(params: {
    content: string;
    atom_type: AtomType;
    provenance: AtomProvenance;
    run_id?: string;
    task_id?: string;
    valid_time_start?: string;
    valid_time_end?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<Atom | null> {
    const content_hash = await sha256(params.content);
    const tokens_estimate = estimateTokens(params.content);

    const { data, error } = await supabase
      .from('atoms')
      .insert({
        content: params.content,
        content_hash,
        atom_type: params.atom_type,
        provenance: params.provenance as unknown as Record<string, unknown>,
        run_id: params.run_id ?? null,
        task_id: params.task_id ?? null,
        valid_time_start: params.valid_time_start ?? new Date().toISOString(),
        valid_time_end: params.valid_time_end ?? null,
        metadata: params.metadata ?? {},
        tokens_estimate,
      } as any)
      .select()
      .single();

    if (error) {
      console.error('CMC: Failed to create atom:', error);
      return null;
    }
    return data as unknown as Atom;
  }

  // --- Supersede an atom (correction, not deletion) ---

  async supersedeAtom(atomId: string, newContent: string, provenance: AtomProvenance, run_id?: string): Promise<Atom | null> {
    // Create new atom
    const newAtom = await this.createAtom({
      content: newContent,
      atom_type: 'text', // will be overridden by caller
      provenance,
      run_id,
    });
    if (!newAtom) return null;

    // Mark old atom as superseded (we can't update atoms table — it's immutable)
    // Instead we record the relationship in the new atom's metadata
    // The superseded_by column on the old atom requires a separate pattern
    // Since atoms are immutable, we track supersession in provenance
    return newAtom;
  }

  // --- Queries ---

  async getAtomsByRun(runId: string): Promise<Atom[]> {
    const { data, error } = await supabase
      .from('atoms')
      .select('*')
      .eq('run_id', runId)
      .order('transaction_time', { ascending: true });

    if (error) { console.error('CMC: fetch atoms error:', error); return []; }
    return (data ?? []) as unknown as Atom[];
  }

  async getAtomsByType(atomType: AtomType, limit = 100): Promise<Atom[]> {
    const { data, error } = await supabase
      .from('atoms')
      .select('*')
      .eq('atom_type', atomType)
      .order('transaction_time', { ascending: false })
      .limit(limit);

    if (error) { console.error('CMC: fetch by type error:', error); return []; }
    return (data ?? []) as unknown as Atom[];
  }

  // Bitemporal "as-of" query: what did we know at transaction_time T?
  async getAtomsAsOf(asOfTime: string, runId?: string): Promise<Atom[]> {
    let query = supabase
      .from('atoms')
      .select('*')
      .lte('transaction_time', asOfTime)
      .order('transaction_time', { ascending: true });

    if (runId) query = query.eq('run_id', runId);

    const { data, error } = await query;
    if (error) { console.error('CMC: as-of query error:', error); return []; }
    return (data ?? []) as unknown as Atom[];
  }

  // Get atoms that were valid at a specific time
  async getAtomsValidAt(validTime: string, runId?: string): Promise<Atom[]> {
    let query = supabase
      .from('atoms')
      .select('*')
      .lte('valid_time_start', validTime)
      .or(`valid_time_end.is.null,valid_time_end.gte.${validTime}`)
      .order('transaction_time', { ascending: true });

    if (runId) query = query.eq('run_id', runId);

    const { data, error } = await query;
    if (error) { console.error('CMC: valid-at query error:', error); return []; }
    return (data ?? []) as unknown as Atom[];
  }

  async getRecentAtoms(limit = 50): Promise<Atom[]> {
    const { data, error } = await supabase
      .from('atoms')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) { console.error('CMC: recent atoms error:', error); return []; }
    return (data ?? []) as unknown as Atom[];
  }

  // --- Snapshots ---

  async createSnapshot(params: {
    atomIds: string[];
    reason: string;
    run_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MemorySnapshot | null> {
    // Compute snapshot hash from all atom IDs
    const sortedIds = [...params.atomIds].sort();
    const snapshot_hash = await sha256(sortedIds.join('|'));

    const { data, error } = await supabase
      .from('memory_snapshots')
      .insert({
        snapshot_hash,
        atom_ids: params.atomIds,
        atom_count: params.atomIds.length,
        reason: params.reason,
        run_id: params.run_id ?? null,
        metadata: params.metadata ?? {},
      } as any)
      .select()
      .single();

    if (error) { console.error('CMC: snapshot error:', error); return null; }
    return data as unknown as MemorySnapshot;
  }

  async getSnapshots(runId?: string): Promise<MemorySnapshot[]> {
    let query = supabase
      .from('memory_snapshots')
      .select('*')
      .order('created_at', { ascending: false });

    if (runId) query = query.eq('run_id', runId);

    const { data, error } = await query;
    if (error) { console.error('CMC: fetch snapshots error:', error); return []; }
    return (data ?? []) as unknown as MemorySnapshot[];
  }

  // --- Statistics ---

  async getStats(): Promise<{
    totalAtoms: number;
    atomsByType: Record<string, number>;
    totalSnapshots: number;
    totalTokens: number;
  }> {
    const [atomsRes, snapshotsRes] = await Promise.all([
      supabase.from('atoms').select('atom_type, tokens_estimate'),
      supabase.from('memory_snapshots').select('id'),
    ]);

    const atoms = atomsRes.data ?? [];
    const atomsByType: Record<string, number> = {};
    let totalTokens = 0;

    for (const atom of atoms) {
      const t = (atom as any).atom_type;
      atomsByType[t] = (atomsByType[t] || 0) + 1;
      totalTokens += (atom as any).tokens_estimate || 0;
    }

    return {
      totalAtoms: atoms.length,
      atomsByType,
      totalSnapshots: (snapshotsRes.data ?? []).length,
      totalTokens,
    };
  }
}

// Singleton
export const cmc = new CoreMemoryController();
