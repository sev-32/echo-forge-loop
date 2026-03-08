CREATE TABLE public.process_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_text text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  source_run_id text,
  confidence real NOT NULL DEFAULT 0.5,
  times_applied integer NOT NULL DEFAULT 0,
  times_helped integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.process_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rules readable" ON public.process_rules FOR SELECT USING (true);
CREATE POLICY "Rules insertable" ON public.process_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Rules updatable" ON public.process_rules FOR UPDATE USING (true);

CREATE TRIGGER update_process_rules_updated_at
  BEFORE UPDATE ON public.process_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();