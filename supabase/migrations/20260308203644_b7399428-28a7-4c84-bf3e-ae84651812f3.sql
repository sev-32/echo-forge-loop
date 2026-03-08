
-- ============================================
-- VIF: Verifiable Intelligence Framework
-- ============================================

-- Confidence bands enum
CREATE TYPE public.confidence_band AS ENUM ('A', 'B', 'C');

-- Kappa gate results
CREATE TYPE public.kappa_gate_result AS ENUM ('pass', 'abstain', 'fail');

-- Operation types for VIF
CREATE TYPE public.vif_operation_type AS ENUM ('plan', 'execute', 'verify', 'reflect', 'critique', 'retrieve', 'build');

CREATE TABLE public.witness_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Operation context
  operation_type public.vif_operation_type NOT NULL,
  model_id text NOT NULL DEFAULT 'unknown',
  
  -- Hash chain for integrity
  prompt_hash text NOT NULL,
  context_hash text NOT NULL DEFAULT '',
  response_hash text NOT NULL,
  
  -- Confidence assessment
  confidence_score real NOT NULL DEFAULT 0.5,
  confidence_band public.confidence_band NOT NULL DEFAULT 'C',
  
  -- Kappa gating
  kappa_gate_result public.kappa_gate_result NOT NULL DEFAULT 'pass',
  kappa_threshold real NOT NULL DEFAULT 0.7,
  
  -- Calibration tracking
  ece_contribution real DEFAULT NULL,
  actual_accuracy real DEFAULT NULL, -- filled in post-hoc for calibration
  
  -- Relations
  atom_id uuid REFERENCES public.atoms(id),
  run_id text,
  task_id text,
  plan_step_id uuid, -- links to APOE plan_steps when created
  
  -- Metadata
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer DEFAULT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_witness_envelopes_run_id ON public.witness_envelopes(run_id);
CREATE INDEX idx_witness_envelopes_task_id ON public.witness_envelopes(task_id);
CREATE INDEX idx_witness_envelopes_operation_type ON public.witness_envelopes(operation_type);
CREATE INDEX idx_witness_envelopes_confidence_band ON public.witness_envelopes(confidence_band);
CREATE INDEX idx_witness_envelopes_kappa_result ON public.witness_envelopes(kappa_gate_result);
CREATE INDEX idx_witness_envelopes_atom_id ON public.witness_envelopes(atom_id);

ALTER TABLE public.witness_envelopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Witness envelopes readable by all" ON public.witness_envelopes
  FOR SELECT USING (true);

CREATE POLICY "Witness envelopes insertable by all" ON public.witness_envelopes
  FOR INSERT WITH CHECK (true);

-- Allow updating actual_accuracy for calibration
CREATE POLICY "Witness envelopes updatable by all" ON public.witness_envelopes
  FOR UPDATE USING (true);

-- ============================================
-- VIF: ECE Tracking for Calibration Curves
-- ============================================

CREATE TABLE public.ece_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  witness_id uuid REFERENCES public.witness_envelopes(id),
  
  -- Calibration data
  predicted_confidence real NOT NULL,
  actual_accuracy real DEFAULT NULL, -- filled post-hoc
  bin integer NOT NULL DEFAULT 0, -- 0-9 for 10-bin calibration
  
  -- Aggregation helpers
  operation_type public.vif_operation_type NOT NULL,
  model_id text NOT NULL DEFAULT 'unknown',
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ece_tracking_run_id ON public.ece_tracking(run_id);
CREATE INDEX idx_ece_tracking_bin ON public.ece_tracking(bin);
CREATE INDEX idx_ece_tracking_model_id ON public.ece_tracking(model_id);

ALTER TABLE public.ece_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ECE tracking readable by all" ON public.ece_tracking
  FOR SELECT USING (true);

CREATE POLICY "ECE tracking insertable by all" ON public.ece_tracking
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ECE tracking updatable by all" ON public.ece_tracking
  FOR UPDATE USING (true);
