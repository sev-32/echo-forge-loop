
-- ============================================
-- APOE: Adaptive Plan Orchestration Engine
-- ============================================

-- Step types
CREATE TYPE public.plan_step_type AS ENUM ('retrieve', 'reason', 'build', 'verify', 'critique', 'plan', 'witness', 'operate');

-- Roles
CREATE TYPE public.apoe_role AS ENUM ('planner', 'retriever', 'reasoner', 'verifier', 'builder', 'critic', 'operator', 'witness');

-- Gate types
CREATE TYPE public.gate_type AS ENUM ('quality', 'safety', 'policy');

-- Gate results
CREATE TYPE public.gate_result AS ENUM ('pass', 'fail', 'warn', 'abstain');

-- Plan statuses
CREATE TYPE public.plan_status AS ENUM ('draft', 'active', 'completed', 'failed', 'cancelled');

-- Step statuses
CREATE TYPE public.step_status AS ENUM ('pending', 'active', 'completed', 'failed', 'skipped', 'blocked');

-- ============================================
-- Execution Plans
-- ============================================

CREATE TABLE public.execution_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  
  -- The typed DAG (ACL format)
  plan_acl jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { steps: [...], edges: [...], roles: {...}, gates: [...] }
  
  -- Status
  status public.plan_status NOT NULL DEFAULT 'draft',
  
  -- Budget for entire plan
  budget_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { max_tokens, max_tool_calls, max_wall_time_seconds, max_iterations }
  
  budget_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { tokens, tool_calls, wall_time_seconds, iterations }
  
  -- Gates configuration
  gates_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { quality_threshold, safety_checks, policy_rules }
  
  -- Goal decomposition
  goal text NOT NULL DEFAULT '',
  complexity text NOT NULL DEFAULT 'moderate',
  reasoning text NOT NULL DEFAULT '',
  
  -- Metadata
  total_steps integer NOT NULL DEFAULT 0,
  completed_steps integer NOT NULL DEFAULT 0,
  failed_steps integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz DEFAULT NULL
);

CREATE INDEX idx_execution_plans_run_id ON public.execution_plans(run_id);
CREATE INDEX idx_execution_plans_status ON public.execution_plans(status);

ALTER TABLE public.execution_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Execution plans readable by all" ON public.execution_plans
  FOR SELECT USING (true);

CREATE POLICY "Execution plans insertable by all" ON public.execution_plans
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Execution plans updatable by all" ON public.execution_plans
  FOR UPDATE USING (true);

-- ============================================
-- Plan Steps — Individual typed steps within a plan
-- ============================================

CREATE TABLE public.plan_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  
  -- Step identity
  step_index integer NOT NULL DEFAULT 0,
  step_type public.plan_step_type NOT NULL,
  assigned_role public.apoe_role NOT NULL,
  
  -- Description
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  
  -- Budget for this step
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { max_tokens, max_tool_calls, max_time_seconds }
  
  budget_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Gate before execution
  gate_before public.gate_type DEFAULT NULL,
  gate_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  gate_result public.gate_result DEFAULT NULL,
  gate_details jsonb DEFAULT NULL,
  
  -- I/O linkage to CMC atoms
  input_refs uuid[] NOT NULL DEFAULT '{}',
  output_refs uuid[] NOT NULL DEFAULT '{}',
  
  -- Witness linkage to VIF
  witness_id uuid REFERENCES public.witness_envelopes(id),
  
  -- Dependencies (other step IDs)
  depends_on uuid[] NOT NULL DEFAULT '{}',
  
  -- Status
  status public.step_status NOT NULL DEFAULT 'pending',
  error text DEFAULT NULL,
  
  -- Timing
  started_at timestamptz DEFAULT NULL,
  completed_at timestamptz DEFAULT NULL,
  
  -- Output
  result jsonb DEFAULT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_steps_plan_id ON public.plan_steps(plan_id);
CREATE INDEX idx_plan_steps_status ON public.plan_steps(status);
CREATE INDEX idx_plan_steps_assigned_role ON public.plan_steps(assigned_role);
CREATE INDEX idx_plan_steps_step_type ON public.plan_steps(step_type);
CREATE INDEX idx_plan_steps_witness_id ON public.plan_steps(witness_id);

ALTER TABLE public.plan_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plan steps readable by all" ON public.plan_steps
  FOR SELECT USING (true);

CREATE POLICY "Plan steps insertable by all" ON public.plan_steps
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Plan steps updatable by all" ON public.plan_steps
  FOR UPDATE USING (true);
