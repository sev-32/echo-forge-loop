
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. Events (append-only event log with hash chaining)
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  hash_prev TEXT,
  hash_self TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_run_id ON public.events(run_id);
CREATE INDEX idx_events_type ON public.events(event_type);
CREATE INDEX idx_events_created ON public.events(created_at DESC);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events are readable by all" ON public.events FOR SELECT USING (true);
CREATE POLICY "Events are insertable by all" ON public.events FOR INSERT WITH CHECK (true);

-- 2. Snapshots
CREATE TABLE public.snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'periodic',
  state JSONB NOT NULL DEFAULT '{}',
  event_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_snapshots_run_id ON public.snapshots(run_id);
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots readable by all" ON public.snapshots FOR SELECT USING (true);
CREATE POLICY "Snapshots insertable by all" ON public.snapshots FOR INSERT WITH CHECK (true);

-- 3. Tasks
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','active','blocked','done','failed','canceled')),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  dependencies TEXT[] NOT NULL DEFAULT '{}',
  context_refs TEXT[] NOT NULL DEFAULT '{}',
  history JSONB NOT NULL DEFAULT '[]',
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_run_id ON public.tasks(run_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_priority ON public.tasks(priority DESC);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tasks readable by all" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Tasks insertable by all" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Tasks updatable by all" ON public.tasks FOR UPDATE USING (true);
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Journal Entries
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('plan','reflection','decision','discovery','correction','hypothesis','synthesis','process_note','question','observation')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  run_id TEXT,
  task_id TEXT,
  parent_id UUID REFERENCES public.journal_entries(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_journal_type ON public.journal_entries(entry_type);
CREATE INDEX idx_journal_run ON public.journal_entries(run_id);
CREATE INDEX idx_journal_tags ON public.journal_entries USING GIN(tags);
CREATE INDEX idx_journal_created ON public.journal_entries(created_at DESC);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Journal readable by all" ON public.journal_entries FOR SELECT USING (true);
CREATE POLICY "Journal insertable by all" ON public.journal_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Journal updatable by all" ON public.journal_entries FOR UPDATE USING (true);
CREATE TRIGGER update_journal_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Context Banks
CREATE TABLE public.context_banks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  max_tokens INTEGER NOT NULL DEFAULT 50000,
  auto_prune BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.context_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banks readable by all" ON public.context_banks FOR SELECT USING (true);
CREATE POLICY "Banks insertable by all" ON public.context_banks FOR INSERT WITH CHECK (true);
CREATE POLICY "Banks updatable by all" ON public.context_banks FOR UPDATE USING (true);

CREATE TABLE public.context_bank_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_id UUID NOT NULL REFERENCES public.context_banks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  priority INTEGER NOT NULL DEFAULT 50,
  tokens_estimate INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_cbe_bank ON public.context_bank_entries(bank_id);
CREATE INDEX idx_cbe_priority ON public.context_bank_entries(priority DESC);
ALTER TABLE public.context_bank_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CBE readable by all" ON public.context_bank_entries FOR SELECT USING (true);
CREATE POLICY "CBE insertable by all" ON public.context_bank_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "CBE deletable by all" ON public.context_bank_entries FOR DELETE USING (true);

-- 6. Knowledge Graph
CREATE TABLE public.knowledge_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  node_type TEXT NOT NULL DEFAULT 'concept',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "KN readable by all" ON public.knowledge_nodes FOR SELECT USING (true);
CREATE POLICY "KN insertable by all" ON public.knowledge_nodes FOR INSERT WITH CHECK (true);

CREATE TABLE public.knowledge_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'related_to',
  weight REAL NOT NULL DEFAULT 1.0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_ke_source ON public.knowledge_edges(source_id);
CREATE INDEX idx_ke_target ON public.knowledge_edges(target_id);
ALTER TABLE public.knowledge_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "KE readable by all" ON public.knowledge_edges FOR SELECT USING (true);
CREATE POLICY "KE insertable by all" ON public.knowledge_edges FOR INSERT WITH CHECK (true);

-- 7. Test Runs
CREATE TABLE public.test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id TEXT NOT NULL,
  suite_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','passed','failed','error')),
  score REAL,
  max_score REAL,
  duration_ms INTEGER,
  score_breakdown JSONB NOT NULL DEFAULT '{}',
  events_snapshot JSONB NOT NULL DEFAULT '[]',
  budget_snapshot JSONB NOT NULL DEFAULT '{}',
  spec_snapshot JSONB NOT NULL DEFAULT '{}',
  errors TEXT[] NOT NULL DEFAULT '{}',
  notes JSONB NOT NULL DEFAULT '[]',
  comparison JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_test_runs_test ON public.test_runs(test_id);
CREATE INDEX idx_test_runs_suite ON public.test_runs(suite_id);
CREATE INDEX idx_test_runs_status ON public.test_runs(status);
CREATE INDEX idx_test_runs_created ON public.test_runs(created_at DESC);
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Test runs readable by all" ON public.test_runs FOR SELECT USING (true);
CREATE POLICY "Test runs insertable by all" ON public.test_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Test runs updatable by all" ON public.test_runs FOR UPDATE USING (true);
