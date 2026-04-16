ALTER TABLE public.ion_commit_deltas ADD COLUMN IF NOT EXISTS review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.ion_commit_deltas ADD COLUMN IF NOT EXISTS protocol text;
ALTER TABLE public.ion_work_units ADD COLUMN IF NOT EXISTS tokens_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.ion_work_units ADD COLUMN IF NOT EXISTS context_version integer;