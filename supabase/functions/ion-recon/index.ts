import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { run_id, action } = await req.json();
    if (!run_id) throw new Error("run_id is required");
    const db = supabaseAdmin();

    // Load all completed deltas and artifacts
    const { data: deltas } = await db.from("ion_commit_deltas").select("*").eq("run_id", run_id).eq("status", "accepted");
    const { data: artifacts } = await db.from("ion_artifacts").select("*").eq("run_id", run_id);
    const { data: questions } = await db.from("ion_open_questions").select("*").eq("run_id", run_id).eq("status", "open");
    const { data: run } = await db.from("ion_runs").select("*").eq("id", run_id).single();

    if (!run) throw new Error("Run not found");

    const artifactSummary = (artifacts || []).map((a: any) =>
      `[${a.authority_class}] ${a.name} (${a.artifact_type}): ${a.content.substring(0, 500)}`
    ).join("\n\n");

    const questionSummary = (questions || []).map((q: any) => `- ${q.question}`).join("\n");

    const reconPrompt = `You are the ION Reconciliation Engine. Your job is to merge, reconcile, and resolve the distributed cognitive work performed so far.

Run goal: ${run.goal}

Artifacts produced (${(artifacts || []).length}):
${artifactSummary}

Open questions (${(questions || []).length}):
${questionSummary || "(none)"}

Tasks:
1. Merge overlapping findings from parallel work units
2. Answer open questions using completed evidence
3. Detect unbound or unsupported claims
4. Identify contradictions that remain live vs resolved
5. Produce a reconciled summary

Return JSON:
{
  "reconciled_summary": "...",
  "answered_questions": [{"question_id": "...", "answer": "..."}],
  "live_contradictions": [{"description": "...", "severity": "high|medium|low"}],
  "unbound_claims": ["..."],
  "merged_findings": ["..."],
  "recommendations": ["..."],
  "confidence": 0.0-1.0
}`;

    const aiResp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: reconPrompt }],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI error: ${t}`);
    }

    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";
    const tokens = (aiData.usage?.prompt_tokens || 0) + (aiData.usage?.completion_tokens || 0);

    let parsed: any;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { reconciled_summary: rawContent, confidence: 0.5 };
    }

    // Store reconciliation as an authority artifact
    await db.from("ion_artifacts").insert({
      run_id,
      name: "reconciliation-report",
      content: parsed.reconciled_summary || JSON.stringify(parsed, null, 2),
      authority_class: "authority",
      artifact_type: "reconciliation",
      metadata: { tokens, answered: (parsed.answered_questions || []).length },
    });

    // Answer open questions
    for (const aq of (parsed.answered_questions || [])) {
      if (aq.question_id) {
        await db.from("ion_open_questions").update({
          status: "answered",
          answer: aq.answer,
          answered_at: new Date().toISOString(),
        }).eq("id", aq.question_id);
      }
    }

    // Update run tokens
    await db.from("ion_runs").update({
      total_tokens: (run.total_tokens || 0) + tokens,
    }).eq("id", run_id);

    return new Response(JSON.stringify({
      status: "reconciled",
      summary: parsed.reconciled_summary?.substring(0, 500),
      answered_questions: (parsed.answered_questions || []).length,
      live_contradictions: (parsed.live_contradictions || []).length,
      confidence: parsed.confidence || 0.5,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ion-recon error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
