
-- ============================================
-- CMC: Core Memory Controller — Bitemporal Atoms
-- ============================================

-- Atom types enum
CREATE TYPE public.atom_type AS ENUM ('text', 'code', 'decision', 'reflection', 'plan', 'verification', 'discovery', 'constraint', 'artifact');

CREATE TABLE public.atoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Content
  content text NOT NULL,
  content_hash text NOT NULL, -- SHA-256
  atom_type public.atom_type NOT NULL DEFAULT 'text',
  
  -- Bitemporal
  transaction_time timestamptz NOT NULL DEFAULT now(), -- when recorded
  valid_time_start timestamptz NOT NULL DEFAULT now(), -- when became true
  valid_time_end timestamptz DEFAULT NULL, -- NULL = still valid
  
  -- Provenance
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { source: string, confidence: float, witness_id: uuid?, model_id: string?, operation: string }
  
  -- Relations
  run_id text,
  task_id text,
  superseded_by uuid REFERENCES public.atoms(id),
  
  -- Metadata
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  tokens_estimate integer NOT NULL DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for bitemporal queries
CREATE INDEX idx_atoms_run_id ON public.atoms(run_id);
CREATE INDEX idx_atoms_transaction_time ON public.atoms(transaction_time);
CREATE INDEX idx_atoms_valid_time ON public.atoms(valid_time_start, valid_time_end);
CREATE INDEX idx_atoms_atom_type ON public.atoms(atom_type);
CREATE INDEX idx_atoms_content_hash ON public.atoms(content_hash);
CREATE INDEX idx_atoms_task_id ON public.atoms(task_id);

-- RLS
ALTER TABLE public.atoms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atoms readable by all" ON public.atoms
  FOR SELECT USING (true);

CREATE POLICY "Atoms insertable by all" ON public.atoms
  FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE — atoms are immutable (corrections via superseded_by)

-- ============================================
-- CMC: Memory Snapshots — Immutable Checkpoints
-- ============================================

CREATE TABLE public.memory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_hash text NOT NULL, -- SHA-256 of all atom hashes
  atom_ids uuid[] NOT NULL DEFAULT '{}',
  atom_count integer NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'checkpoint',
  run_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_snapshots_run_id ON public.memory_snapshots(run_id);
CREATE INDEX idx_memory_snapshots_created_at ON public.memory_snapshots(created_at);

-- RLS — fully immutable
ALTER TABLE public.memory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Memory snapshots readable by all" ON public.memory_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Memory snapshots insertable by all" ON public.memory_snapshots
  FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE — snapshots are immutable
