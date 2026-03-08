
-- ============================================
-- SDF-CVF: Quartet Parity / Evolution Tracking
-- ============================================

CREATE TABLE public.quartet_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  
  -- The four artifact hashes
  code_hash text NOT NULL DEFAULT '',
  docs_hash text NOT NULL DEFAULT '',
  tests_hash text NOT NULL DEFAULT '',
  trace_hash text NOT NULL DEFAULT '',
  
  -- Parity computation
  parity_score real NOT NULL DEFAULT 0.0, -- 0-1, computed from 6 pairwise similarities
  parity_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { code_docs: float, code_tests: float, code_trace: float, docs_tests: float, docs_trace: float, tests_trace: float }
  
  gate_result public.gate_result NOT NULL DEFAULT 'pass',
  gate_threshold real NOT NULL DEFAULT 0.90,
  
  -- Blast radius prediction
  blast_radius jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { affected_systems: string[], risk_level: string, predicted_failures: string[] }
  
  -- Witness
  witness_id uuid REFERENCES public.witness_envelopes(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quartet_traces_run_id ON public.quartet_traces(run_id);
CREATE INDEX idx_quartet_traces_parity_score ON public.quartet_traces(parity_score);

ALTER TABLE public.quartet_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quartet traces readable by all" ON public.quartet_traces
  FOR SELECT USING (true);

CREATE POLICY "Quartet traces insertable by all" ON public.quartet_traces
  FOR INSERT WITH CHECK (true);

-- ============================================
-- SDF-CVF: DORA Metrics
-- ============================================

CREATE TABLE public.dora_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  
  deployment_frequency real NOT NULL DEFAULT 0.0, -- deploys per day
  lead_time_seconds integer NOT NULL DEFAULT 0,
  restore_time_seconds integer NOT NULL DEFAULT 0,
  change_failure_rate real NOT NULL DEFAULT 0.0, -- 0-1
  
  -- Computed tier: elite / high / medium / low
  tier text NOT NULL DEFAULT 'low',
  
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dora_metrics_run_id ON public.dora_metrics(run_id);
CREATE INDEX idx_dora_metrics_tier ON public.dora_metrics(tier);

ALTER TABLE public.dora_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DORA metrics readable by all" ON public.dora_metrics
  FOR SELECT USING (true);

CREATE POLICY "DORA metrics insertable by all" ON public.dora_metrics
  FOR INSERT WITH CHECK (true);

-- ============================================
-- CAS: Cognitive Analysis System
-- ============================================

CREATE TYPE public.attention_breadth AS ENUM ('narrow', 'normal', 'wide');

CREATE TYPE public.failure_mode AS ENUM (
  'categorization_error',
  'activation_gap', 
  'procedure_gap',
  'blind_spot',
  'anchoring_bias',
  'confirmation_bias',
  'shortcut_taking'
);

CREATE TABLE public.cognitive_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  task_id text DEFAULT NULL,
  plan_step_id uuid REFERENCES public.plan_steps(id),
  
  -- Cognitive state
  cognitive_load real NOT NULL DEFAULT 0.0, -- 0-1
  attention_breadth public.attention_breadth NOT NULL DEFAULT 'normal',
  
  -- Concept tracking
  active_concepts text[] NOT NULL DEFAULT '{}',
  cold_concepts text[] NOT NULL DEFAULT '{}',
  concept_churn_rate real NOT NULL DEFAULT 0.0, -- concepts entering/leaving per step
  
  -- Drift detection
  drift_detected boolean NOT NULL DEFAULT false,
  drift_score real NOT NULL DEFAULT 0.0, -- 0-1
  drift_details text DEFAULT NULL,
  
  -- Failure mode analysis
  failure_mode public.failure_mode DEFAULT NULL,
  failure_confidence real DEFAULT NULL,
  failure_details text DEFAULT NULL,
  
  -- Meta-cognitive metrics
  reasoning_depth integer NOT NULL DEFAULT 0, -- chain depth
  self_consistency_score real NOT NULL DEFAULT 1.0, -- 0-1
  uncertainty_awareness real NOT NULL DEFAULT 0.5, -- 0-1 (does the system know what it doesn't know?)
  
  -- Witness
  witness_id uuid REFERENCES public.witness_envelopes(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cognitive_snapshots_run_id ON public.cognitive_snapshots(run_id);
CREATE INDEX idx_cognitive_snapshots_task_id ON public.cognitive_snapshots(task_id);
CREATE INDEX idx_cognitive_snapshots_drift ON public.cognitive_snapshots(drift_detected);
CREATE INDEX idx_cognitive_snapshots_failure_mode ON public.cognitive_snapshots(failure_mode);
CREATE INDEX idx_cognitive_snapshots_cognitive_load ON public.cognitive_snapshots(cognitive_load);

ALTER TABLE public.cognitive_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cognitive snapshots readable by all" ON public.cognitive_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Cognitive snapshots insertable by all" ON public.cognitive_snapshots
  FOR INSERT WITH CHECK (true);
