
-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.run_traces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cognitive_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.witness_envelopes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.atoms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
