
-- ============================================
-- ION v2: Sovereign Cognitive Kernel Tables
-- ============================================

-- Authority class enum
CREATE TYPE public.ion_authority_class AS ENUM (
  'authority', 'witness', 'plan', 'audit', 'generated_state', 'stale_competitor'
);

-- Run status enum
CREATE TYPE public.ion_run_status AS ENUM (
  'created', 'reconnaissance', 'evidence_pass', 'consolidation',
  'review', 'reconciliation', 'densification', 'expansion',
  'blocked', 'completed', 'failed', 'stopped'
);

-- Work unit status enum
CREATE TYPE public.ion_work_unit_status AS ENUM (
  'pending', 'assigned', 'running', 'completed', 'failed', 'blocked', 'skipped'
);

-- Protocol enum
CREATE TYPE public.ion_protocol AS ENUM (
  'reconnaissance', 'evidence', 'consolidation', 'review',
  'signal', 'reflection', 'system_map', 'system_evolution'
);

-- Commit delta status enum
CREATE TYPE public.ion_delta_status AS ENUM (
  'proposed', 'accepted', 'rejected', 'witness_only'
);

-- Open question status enum
CREATE TYPE public.ion_question_status AS ENUM (
  'open', 'answered', 'deferred', 'cancelled'
);

-- ═══ ION Runs ═══
CREATE TABLE public.ion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal text NOT NULL DEFAULT '',
  status ion_run_status NOT NULL DEFAULT 'created',
  autonomy_mode text NOT NULL DEFAULT 'supervised',
  priority_tier integer NOT NULL DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}',
  state_snapshot jsonb NOT NULL DEFAULT '{}',
  total_work_units integer NOT NULL DEFAULT 0,
  completed_work_units integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE public.ion_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ion_runs_allow_all" ON public.ion_runs FOR ALL TO public USING (true) WITH CHECK (true);

-- ═══ ION Context Packages ═══
CREATE TABLE public.ion_context_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ion_runs(id) ON DELETE CASCADE NOT NULL,
  version integer NOT NULL DEFAULT 1,
  doctrine_refs jsonb NOT NULL DEFAULT '[]',
  artifact_refs jsonb NOT NULL DEFAULT '[]',
  open_question_refs jsonb NOT NULL DEFAULT '[]',
  allowed_actions jsonb NOT NULL DEFAULT '[]',
  content text NOT NULL DEFAULT '',
  content_hash text NOT NULL DEFAULT '',
  tokens_estimate integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ion_context_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ion_context_packages_allow_all" ON public.ion_context_packages FOR ALL TO public USING (true) WITH CHECK (true);

-- ═══ ION Work Units ═══
CREATE TABLE public.ion_work_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ion_runs(id) ON DELETE CASCADE NOT NULL,
  protocol ion_protocol NOT NULL,
  shard_index integer NOT NULL DEFAULT 0,
  status ion_work_unit_status NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 50,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  dependencies uuid[] NOT NULL DEFAULT '{}',
  allowed_writes jsonb NOT NULL DEFAULT '[]',
  output_contract jsonb NOT NULL DEFAULT '{}',
  context_package_id uuid REFERENCES public.ion_context_packages(id),
  input_data jsonb NOT NULL DEFAULT '{}',
  result_data jsonb,
  error text,
  assigned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE public.ion_work_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ion_work_units_allow_all" ON public.ion_work_units FOR ALL TO public USING (true) WITH CHECK (true);

-- ═══ ION Commit Deltas ═══
CREATE TABLE public.ion_commit_deltas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_unit_id uuid REFERENCES public.ion_work_units(id) ON DELETE CASCADE NOT NULL,
  run_id uuid REFERENCES public.ion_runs(id) ON DELETE CASCADE NOT NULL,
  status ion_delta_status NOT NULL DEFAULT 'proposed',
  artifacts_created jsonb NOT NULL DEFAULT '[]',
  ledger_rows jsonb NOT NULL DEFAULT '[]',
  questions_raised jsonb NOT NULL DEFAULT '[]',
  signals_emitted jsonb NOT NULL DEFAULT '[]',
  contradictions_found jsonb NOT NULL DEFAULT '[]',
  confidence real NOT NULL DEFAULT 0.5,
  child_work_suggested jsonb NOT NULL DEFAULT '[]',
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE public.ion_commit_deltas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ion_commit_deltas_allow_all" ON public.ion_commit_deltas FOR ALL TO public USING (true) WITH CHECK (true);

-- ═══ ION Open Questions ═══
CREATE TABLE public.ion_open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ion_runs(id) ON DELETE CASCADE NOT NULL,
  question text NOT NULL,
  context text NOT NULL DEFAULT '',
  source_work_unit_id uuid REFERENCES public.ion_work_units(id),
  status ion_question_status NOT NULL DEFAULT 'open',
  answer text,
  priority integer NOT NULL DEFAULT 50,
  routed_to_work_unit_id uuid REFERENCES public.ion_work_units(id),
  answered_by_work_unit_id uuid REFERENCES public.ion_work_units(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE public.ion_open_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ion_open_questions_allow_all" ON public.ion_open_questions FOR ALL TO public USING (true) WITH CHECK (true);

-- ═══ ION Signals ═══
CREATE TABLE public.ion_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ion_runs(id) ON DELETE CASCADE NOT NULL,
  signal_type text NOT NULL,
  source_work_unit_id uuid REFERENCES public.ion_work_units(id),
  target_protocol ion_protocol,
  payload jsonb NOT NULL DEFAULT '{}',
  consumed boolean NOT NULL DEFAULT false,
  consumed_by_work_unit_id uuid REFERENCES public.ion_work_units(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ion_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ion_signals_allow_all" ON public.ion_signals FOR ALL TO public USING (true) WITH CHECK (true);

-- ═══ ION Artifacts ═══
CREATE TABLE public.ion_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.ion_runs(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  authority_class ion_authority_class NOT NULL DEFAULT 'witness',
  version integer NOT NULL DEFAULT 1,
  superseded_by uuid REFERENCES public.ion_artifacts(id),
  content_hash text NOT NULL DEFAULT '',
  created_by_work_unit_id uuid REFERENCES public.ion_work_units(id),
  artifact_type text NOT NULL DEFAULT 'document',
  tokens_estimate integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE public.ion_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ion_artifacts_allow_all" ON public.ion_artifacts FOR ALL TO public USING (true) WITH CHECK (true);

-- ═══ Enable Realtime ═══
ALTER PUBLICATION supabase_realtime ADD TABLE public.ion_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ion_work_units;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ion_commit_deltas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ion_open_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ion_signals;

-- ═══ Updated_at triggers ═══
CREATE TRIGGER ion_runs_updated_at BEFORE UPDATE ON public.ion_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
