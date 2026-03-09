// ─── Deep Research Client API ────────────────────────
// Streams research phases from the deep-research edge function

const RESEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deep-research`;

export interface ResearchDecomposition {
  main_thesis: string;
  sub_questions: Array<{ question: string; angle: string; priority: number }>;
  research_scope: string;
  key_domains: string[];
}

export interface ResearchFinding {
  question: string;
  angle: string;
  summary: string;
  detailed_analysis: string;
  confidence: number;
  key_facts: string[];
  uncertainties?: string[];
  connections?: string[];
}

export interface CrossReference {
  agreements: string[];
  contradictions: Array<{ claim_a: string; claim_b: string; resolution: string }>;
  gaps: string[];
  emergent_insights: string[];
  overall_confidence: number;
}

export interface ResearchResult {
  decomposition: ResearchDecomposition | null;
  findings: ResearchFinding[];
  crossReference: CrossReference | null;
  report: string;
  status: 'idle' | 'decomposing' | 'researching' | 'cross_referencing' | 'synthesizing' | 'persisting' | 'complete' | 'error';
  error?: string;
  meta?: { run_id: string; sub_questions: number; findings_count: number; contradictions_count: number; overall_confidence: number; gaps: string[] };
}

export async function streamDeepResearch(props: {
  query: string;
  depth?: 'standard' | 'deep';
  run_id?: string;
  onPhase: (phase: string, message: string) => void;
  onDecomposition: (data: ResearchDecomposition) => void;
  onSubResearchStart: (index: number, question: string, angle: string) => void;
  onSubResearchComplete: (index: number, finding: ResearchFinding) => void;
  onCrossReference: (data: CrossReference) => void;
  onReport: (content: string) => void;
  onComplete: (meta: ResearchResult['meta']) => void;
  onError: (error: string) => void;
}) {
  const resp = await fetch(RESEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ query: props.query, depth: props.depth || 'standard', run_id: props.run_id }),
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => 'Unknown error');
    props.onError(`Research failed: ${errText}`);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") return;

      try {
        const evt = JSON.parse(jsonStr);
        switch (evt.type) {
          case "phase": props.onPhase(evt.phase, evt.message); break;
          case "decomposition": props.onDecomposition(evt); break;
          case "sub_research_start": props.onSubResearchStart(evt.index, evt.question, evt.angle); break;
          case "sub_research_complete": props.onSubResearchComplete(evt.index, evt.finding); break;
          case "cross_reference": props.onCrossReference(evt); break;
          case "report": props.onReport(evt.content); break;
          case "complete": props.onComplete(evt); break;
          case "error": props.onError(evt.message); break;
        }
      } catch { /* partial JSON */ }
    }
  }
}
