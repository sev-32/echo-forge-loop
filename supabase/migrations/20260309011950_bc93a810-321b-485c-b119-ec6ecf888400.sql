-- ============================================
-- Phase V: Bounded Autonomy Mission System
-- Per AIOS v1 Spec §30 - Mission Objects + Ledger
-- ============================================

-- Mission status states (§30.4)
CREATE TYPE public.mission_status AS ENUM (
  'drafted',
  'awaiting_approval',
  'approved',
  'active',
  'paused',
  'blocked',
  'completed',
  'failed',
  'aborted',
  'rolled_back'
);

-- Missions table (§30.3 Mission Object)
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Core fields
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status mission_status NOT NULL DEFAULT 'drafted',
  
  -- Autonomy control (§30.6 Autonomy Levels: 0=Advisory, 1=User-Stepped, 2=Bounded, 3=Managed)
  autonomy_tier INTEGER NOT NULL DEFAULT 0 CHECK (autonomy_tier >= 0 AND autonomy_tier <= 3),
  risk_class TEXT NOT NULL DEFAULT 'low' CHECK (risk_class IN ('minimal', 'low', 'moderate', 'high', 'critical')),
  
  -- Governance (§30.3)
  allowed_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget_limits JSONB NOT NULL DEFAULT '{"tokens": 50000, "steps": 20}'::jsonb,
  stop_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalation_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_plan TEXT,
  
  -- Linkage
  run_id TEXT,
  
  -- Tracking (§30.9 Mission Logging)
  confidence_trajectory JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Mission steps / action ledger (§30.9 Mission Logging)
CREATE TABLE public.mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  
  -- Step state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'failed', 'skipped')),
  action_summary TEXT NOT NULL,
  validation_summary TEXT,
  confidence DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Results
  result JSONB,
  artifacts_touched JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools_invoked JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  UNIQUE (mission_id, sequence_no)
);

-- Enable RLS (§15.2 Governance Mechanisms)
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_steps ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth in this project)
CREATE POLICY "missions_allow_all" 
  ON public.missions 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "mission_steps_allow_all" 
  ON public.mission_steps 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_missions_status ON public.missions(status);
CREATE INDEX idx_missions_autonomy_tier ON public.missions(autonomy_tier);
CREATE INDEX idx_mission_steps_mission_id ON public.mission_steps(mission_id);
CREATE INDEX idx_mission_steps_status ON public.mission_steps(status);

-- Auto-update timestamps
CREATE TRIGGER update_missions_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mission_steps_updated_at
  BEFORE UPDATE ON public.mission_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.missions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_steps;