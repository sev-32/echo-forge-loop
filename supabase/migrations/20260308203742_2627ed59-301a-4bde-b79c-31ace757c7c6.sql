
-- ============================================
-- SEG: Shared Evidence Graph Enhancements
-- ============================================

-- Add evidence columns to knowledge_nodes
ALTER TABLE public.knowledge_nodes 
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'concept',
  ADD COLUMN IF NOT EXISTS valid_time_start timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_time_end timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS witness_id uuid REFERENCES public.witness_envelopes(id),
  ADD COLUMN IF NOT EXISTS run_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS atom_id uuid REFERENCES public.atoms(id);

-- Add evidence columns to knowledge_edges
ALTER TABLE public.knowledge_edges
  ADD COLUMN IF NOT EXISTS edge_type text NOT NULL DEFAULT 'related_to',
  ADD COLUMN IF NOT EXISTS strength real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS witness_id uuid REFERENCES public.witness_envelopes(id),
  ADD COLUMN IF NOT EXISTS run_id text DEFAULT NULL;

-- Contradictions table
CREATE TABLE public.contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The two conflicting nodes
  node_a_id uuid NOT NULL REFERENCES public.knowledge_nodes(id),
  node_b_id uuid NOT NULL REFERENCES public.knowledge_nodes(id),
  
  -- Detection
  similarity_score real NOT NULL DEFAULT 0.0,
  stance text NOT NULL DEFAULT 'contradicts', -- contradicts, weakly_contradicts, tension
  detection_method text NOT NULL DEFAULT 'semantic', -- semantic, logical, temporal
  
  -- Resolution
  resolution text DEFAULT NULL, -- null, a_wins, b_wins, both_valid, merged
  resolution_reasoning text DEFAULT NULL,
  resolved_by_run_id text DEFAULT NULL,
  resolved_at timestamptz DEFAULT NULL,
  
  -- Context
  run_id text,
  witness_id uuid REFERENCES public.witness_envelopes(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contradictions_node_a ON public.contradictions(node_a_id);
CREATE INDEX idx_contradictions_node_b ON public.contradictions(node_b_id);
CREATE INDEX idx_contradictions_run_id ON public.contradictions(run_id);
CREATE INDEX idx_contradictions_resolution ON public.contradictions(resolution);

ALTER TABLE public.contradictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contradictions readable by all" ON public.contradictions
  FOR SELECT USING (true);

CREATE POLICY "Contradictions insertable by all" ON public.contradictions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Contradictions updatable by all" ON public.contradictions
  FOR UPDATE USING (true);
