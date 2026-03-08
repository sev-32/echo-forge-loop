
CREATE TABLE public.run_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  goal text NOT NULL,
  approach text NOT NULL DEFAULT '',
  overall_complexity text NOT NULL DEFAULT 'moderate',
  planning_reasoning text NOT NULL DEFAULT '',
  open_questions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running',
  total_tokens integer NOT NULL DEFAULT 0,
  task_count integer NOT NULL DEFAULT 0,
  tasks_passed integer NOT NULL DEFAULT 0,
  avg_score real,
  planning_score real,
  strategy_score real,
  memory_loaded jsonb NOT NULL DEFAULT '{}',
  thoughts jsonb NOT NULL DEFAULT '[]',
  tasks_detail jsonb NOT NULL DEFAULT '[]',
  reflection jsonb,
  generated_rules jsonb NOT NULL DEFAULT '[]',
  knowledge_update jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.run_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Run traces readable" ON public.run_traces FOR SELECT USING (true);
CREATE POLICY "Run traces insertable" ON public.run_traces FOR INSERT WITH CHECK (true);
CREATE POLICY "Run traces updatable" ON public.run_traces FOR UPDATE USING (true);
