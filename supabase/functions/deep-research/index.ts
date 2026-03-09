import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function callAI(apiKey: string, model: string, messages: any[], tools?: any[], toolChoice?: any) {
  const body: any = { model, messages };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI call failed [${resp.status}]: ${t}`);
  }
  return await resp.json();
}

function parseToolArgs(data: any): any {
  try { return JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'); }
  catch { return {}; }
}

async function sha256(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Research Pipeline ───────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, depth = "standard", run_id } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const runId = run_id || crypto.randomUUID();
    const researchModel = depth === "deep" ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: event, ...data })}\n\n`));
        };

        try {
          // ─── Phase 1: Decompose query into sub-questions ───
          send("phase", { phase: "decompose", message: "Decomposing research query into sub-questions..." });

          const decomposeResult = await callAI(LOVABLE_API_KEY, researchModel, [
            { role: "system", content: `You are a research decomposition expert. Break down complex questions into 3-6 focused sub-questions that together will comprehensively answer the original query. Consider different angles: technical, historical, comparative, practical, and theoretical.` },
            { role: "user", content: query },
          ], [{
            type: "function",
            function: {
              name: "decompose_query",
              description: "Break the research query into sub-questions",
              parameters: {
                type: "object",
                properties: {
                  main_thesis: { type: "string", description: "The central thesis to investigate" },
                  sub_questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        angle: { type: "string", enum: ["technical", "historical", "comparative", "practical", "theoretical", "evidence-based", "counter-argument"] },
                        priority: { type: "number", description: "1-10 importance" },
                      },
                      required: ["question", "angle", "priority"],
                    },
                  },
                  research_scope: { type: "string", description: "Brief scope definition" },
                  key_domains: { type: "array", items: { type: "string" }, description: "Knowledge domains to explore" },
                },
                required: ["main_thesis", "sub_questions", "research_scope", "key_domains"],
              },
            },
          }], { type: "function", function: { name: "decompose_query" } });

          const decomposition = parseToolArgs(decomposeResult);
          send("decomposition", decomposition);

          // ─── Phase 2: Parallel deep research on each sub-question ───
          send("phase", { phase: "research", message: `Researching ${decomposition.sub_questions?.length || 0} sub-questions in parallel...` });

          const subQuestions = (decomposition.sub_questions || []).slice(0, 6);
          const findings: any[] = [];

          // Research in parallel batches of 3
          for (let i = 0; i < subQuestions.length; i += 3) {
            const batch = subQuestions.slice(i, i + 3);
            const batchResults = await Promise.all(batch.map(async (sq: any, bIdx: number) => {
              const idx = i + bIdx;
              send("sub_research_start", { index: idx, question: sq.question, angle: sq.angle });

              const result = await callAI(LOVABLE_API_KEY, researchModel, [
                { role: "system", content: `You are an expert researcher. Provide a thorough, evidence-based analysis. Include specific data points, examples, and cite your reasoning. Be precise and comprehensive. Do not hedge excessively.` },
                { role: "user", content: `Research question (${sq.angle} angle): ${sq.question}\n\nContext: This is part of a larger research into: ${query}\nScope: ${decomposition.research_scope || 'comprehensive'}` },
              ], [{
                type: "function",
                function: {
                  name: "report_finding",
                  description: "Report research finding",
                  parameters: {
                    type: "object",
                    properties: {
                      summary: { type: "string", description: "2-3 sentence summary of finding" },
                      detailed_analysis: { type: "string", description: "Full analysis with evidence" },
                      confidence: { type: "number", description: "0-1 confidence in finding" },
                      key_facts: { type: "array", items: { type: "string" }, description: "Key facts discovered" },
                      uncertainties: { type: "array", items: { type: "string" }, description: "Areas of uncertainty" },
                      connections: { type: "array", items: { type: "string" }, description: "Connections to other sub-questions" },
                    },
                    required: ["summary", "detailed_analysis", "confidence", "key_facts"],
                  },
                },
              }], { type: "function", function: { name: "report_finding" } });

              const finding = parseToolArgs(result);
              send("sub_research_complete", { index: idx, finding: { ...finding, question: sq.question, angle: sq.angle } });
              return { ...finding, question: sq.question, angle: sq.angle };
            }));

            findings.push(...batchResults);
          }

          // ─── Phase 3: Cross-reference and identify contradictions ───
          send("phase", { phase: "cross_reference", message: "Cross-referencing findings and identifying contradictions..." });

          const crossRefResult = await callAI(LOVABLE_API_KEY, researchModel, [
            { role: "system", content: `You are a critical analyst. Review multiple research findings and identify agreements, contradictions, gaps, and emergent insights that weren't visible from individual findings.` },
            { role: "user", content: `Original query: ${query}\n\nFindings:\n${findings.map((f, i) => `[Finding ${i + 1} - ${f.angle}] ${f.question}\n${f.summary}\nConfidence: ${f.confidence}\nKey facts: ${(f.key_facts || []).join('; ')}\nUncertainties: ${(f.uncertainties || []).join('; ')}`).join('\n\n')}` },
          ], [{
            type: "function",
            function: {
              name: "cross_reference",
              description: "Cross-reference research findings",
              parameters: {
                type: "object",
                properties: {
                  agreements: { type: "array", items: { type: "string" }, description: "Points where findings agree" },
                  contradictions: { type: "array", items: { type: "object", properties: { claim_a: { type: "string" }, claim_b: { type: "string" }, resolution: { type: "string" } }, required: ["claim_a", "claim_b", "resolution"] } },
                  gaps: { type: "array", items: { type: "string" }, description: "Knowledge gaps identified" },
                  emergent_insights: { type: "array", items: { type: "string" }, description: "Insights from combining findings" },
                  overall_confidence: { type: "number", description: "0-1 overall confidence" },
                },
                required: ["agreements", "contradictions", "gaps", "emergent_insights", "overall_confidence"],
              },
            },
          }], { type: "function", function: { name: "cross_reference" } });

          const crossRef = parseToolArgs(crossRefResult);
          send("cross_reference", crossRef);

          // ─── Phase 4: Synthesize final research report ───
          send("phase", { phase: "synthesize", message: "Synthesizing comprehensive research report..." });

          const synthesisResult = await callAI(LOVABLE_API_KEY, researchModel, [
            { role: "system", content: `You are a world-class research synthesizer. Create a comprehensive, well-structured research report that integrates all findings. Use markdown formatting with headers, bullet points, and bold for key terms. Include a clear executive summary, detailed analysis sections, and actionable conclusions.` },
            { role: "user", content: `Create a comprehensive research report for: ${query}\n\nMain thesis: ${decomposition.main_thesis}\nScope: ${decomposition.research_scope}\nDomains: ${(decomposition.key_domains || []).join(', ')}\n\nFindings:\n${findings.map((f, i) => `### Finding ${i + 1}: ${f.question} (${f.angle})\n${f.detailed_analysis}\n**Confidence:** ${(f.confidence * 100).toFixed(0)}%\n**Key Facts:** ${(f.key_facts || []).join('; ')}`).join('\n\n')}\n\nCross-Reference Analysis:\n- Agreements: ${(crossRef.agreements || []).join('; ')}\n- Contradictions: ${(crossRef.contradictions || []).map((c: any) => `${c.claim_a} vs ${c.claim_b}: ${c.resolution}`).join('; ')}\n- Gaps: ${(crossRef.gaps || []).join('; ')}\n- Emergent insights: ${(crossRef.emergent_insights || []).join('; ')}\n- Overall confidence: ${((crossRef.overall_confidence || 0) * 100).toFixed(0)}%` },
          ]);

          const report = synthesisResult.choices?.[0]?.message?.content || "Report generation failed.";
          send("report", { content: report });

          // ─── Phase 5: Persist to knowledge graph ───
          send("phase", { phase: "persist", message: "Persisting research to knowledge graph..." });

          // Store as atom
          const contentHash = await sha256(report);
          await supabase.from('atoms').insert({
            content: report, content_hash: contentHash, atom_type: 'discovery',
            provenance: { source: 'deep-research', query, depth, sub_questions: subQuestions.length, confidence: crossRef.overall_confidence },
            run_id: runId, tokens_estimate: Math.ceil(report.length / 4),
          });

          // Extract and store knowledge nodes
          const nodeLabels = [
            ...(decomposition.key_domains || []),
            ...(findings.flatMap((f: any) => (f.key_facts || []).slice(0, 2))),
          ].slice(0, 10);

          for (const label of nodeLabels) {
            await supabase.from('knowledge_nodes').insert({
              label: label.slice(0, 200), node_type: 'research_finding',
              evidence_type: 'research', confidence: crossRef.overall_confidence || 0.7,
              run_id: runId, metadata: { source: 'deep-research', query },
            });
          }

          // Store contradictions
          if (crossRef.contradictions?.length > 0) {
            // Get recent nodes to link contradictions
            const { data: recentNodes } = await supabase.from('knowledge_nodes')
              .select('id').eq('run_id', runId).limit(10);
            if (recentNodes && recentNodes.length >= 2) {
              for (const contra of crossRef.contradictions.slice(0, 3)) {
                await supabase.from('contradictions').insert({
                  node_a_id: recentNodes[0].id, node_b_id: recentNodes[1].id,
                  detection_method: 'deep_research_cross_ref', stance: 'contradicts',
                  similarity_score: 0.5, run_id: runId,
                  metadata: { claim_a: contra.claim_a, claim_b: contra.claim_b, resolution: contra.resolution },
                });
              }
            }
          }

          // Journal entry
          await supabase.from('journal_entries').insert({
            title: `Deep Research: ${query.slice(0, 80)}`,
            content: `Research completed with ${findings.length} sub-findings. Overall confidence: ${((crossRef.overall_confidence || 0) * 100).toFixed(0)}%. Domains: ${(decomposition.key_domains || []).join(', ')}`,
            entry_type: 'research', priority: 'high', run_id: runId,
            tags: ['deep-research', ...(decomposition.key_domains || []).slice(0, 3)],
            metadata: { query, depth, sub_questions: subQuestions.length, overall_confidence: crossRef.overall_confidence },
          });

          send("complete", {
            run_id: runId,
            sub_questions: subQuestions.length,
            findings_count: findings.length,
            contradictions_count: (crossRef.contradictions || []).length,
            overall_confidence: crossRef.overall_confidence || 0,
            gaps: crossRef.gaps || [],
          });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Research error:", err);
          send("error", { message: err instanceof Error ? err.message : "Research failed" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("deep-research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
