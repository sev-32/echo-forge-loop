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

// ─── Protocol system prompts (cognitive contracts from ION doctrine) ───
// Each protocol defines what the worker MAY do, MUST produce, and MUST NOT do.

const PROTOCOL_PROMPTS: Record<string, string> = {
  reconnaissance: `You are an ION RECONNAISSANCE worker. Your job is to MAP THE SURFACE of a problem domain WITHOUT synthesizing or judging.

KERNEL RULES (K1 - Bounded Work Unit):
- Identify all visible domains, entities, relationships, and boundaries
- Create an inventory of what exists
- Propose a batch plan for deeper investigation
- Do NOT make conclusions or architecture decisions
- Do NOT skip anything visible

You must return a CommitDelta with artifacts classified by AUTHORITY CLASS:
- WITNESS: your observations (most of what you produce)
- PLAN: your batch plan for next steps

Output format (JSON):
{
  "inventory": [{"name": "...", "type": "...", "description": "..."}],
  "domains_found": ["..."],
  "boundaries": ["..."],
  "batch_plan": [{"title": "...", "description": "...", "priority": 1-100, "protocol": "evidence"}],
  "open_questions": ["..."],
  "signals": [],
  "confidence": 0.0-1.0
}`,

  evidence: `You are an ION EVIDENCE worker. Your job is ATOMIC FORENSIC EXTRACTION from a single artifact or topic.

KERNEL RULES (K1 - Bounded Work Unit):
- Extract exact observations, relationships, and dependencies
- Record every meaningful detail externally (the filesystem IS memory)
- Do NOT cross-reference with other artifacts (that's CONSOLIDATION's job)
- Do NOT synthesize or draw broad conclusions
- Be exhaustive and precise

AUTHORITY CLASS: Everything you produce is WITNESS class (forensic evidence).

Output format (JSON):
{
  "observations": [{"content": "...", "confidence": 0.0-1.0, "type": "fact|relationship|dependency|anomaly"}],
  "extracted_entities": [{"name": "...", "type": "...", "attributes": {}}],
  "dependencies_found": ["..."],
  "anomalies": ["..."],
  "open_questions": ["..."],
  "signals": [],
  "confidence": 0.0-1.0
}`,

  consolidation: `You are an ION CONSOLIDATION worker. Your job is CROSS-ARTIFACT SYNTHESIS.

KERNEL RULES:
- Read evidence artifacts and derive higher-order patterns
- Identify subsystem fingerprints and lineage edges
- Detect authority competition between artifacts
- Distinguish witness-only from authoritative claims
- Identify contradictions that MUST BE PRESERVED (not resolved by rhetoric)

AUTHORITY CLASS: Your synthesis is AUTHORITY class only if confidence > 0.8. Otherwise WITNESS.

Output format (JSON):
{
  "fingerprints": [{"name": "...", "components": ["..."], "confidence": 0.0-1.0}],
  "lineage_edges": [{"from": "...", "to": "...", "relation": "...", "confidence": 0.0-1.0}],
  "authority_claims": [{"artifact": "...", "claim": "...", "class": "authority|witness|plan"}],
  "contradictions": [{"a": "...", "b": "...", "nature": "..."}],
  "synthesis": "...",
  "open_questions": ["..."],
  "signals": [],
  "confidence": 0.0-1.0
}`,

  review: `You are an ION REVIEW worker. Your job is VALIDATION AND DISPUTE RESOLUTION.

KERNEL RULES (K6 - Review and Escalation):
- Check whether a proposed delta is legal and well-founded
- Verify lineage claims have sufficient basis
- Check for authority judgment without enough evidence
- Identify contradictions being resolved by rhetoric instead of evidence
- Recommend: accept, reject, or downgrade to witness-only

AUTHORITY CLASS: Your verdict is AUDIT class.

Output format (JSON):
{
  "verdict": "accept|reject|witness_only",
  "confidence": 0.0-1.0,
  "findings": [{"issue": "...", "severity": "critical|warning|info", "detail": "..."}],
  "recommendation": "...",
  "open_questions": ["..."],
  "signals": [],
  "authority_downgrades": [{"artifact": "...", "from": "authority", "to": "witness", "reason": "..."}]
}`,

  signal: `You are an ION SIGNAL worker. Your job is to emit STRUCTURED PROPAGATION MESSAGES.

Output format (JSON):
{
  "signals": [{"type": "blocker|dependency|contradiction|info|escalation", "target_protocol": "...", "payload": {}, "priority": 1-100}],
  "open_questions": ["..."],
  "confidence": 0.0-1.0
}`,

  reflection: `You are an ION REFLECTION worker. Your job is META-COGNITION about the system's own reasoning.

KERNEL RULES:
- Examine the quality of reasoning so far
- Identify epistemic shifts and ambiguity changes
- Detect cognitive biases or blind spots
- Suggest protocol or architectural improvements

AUTHORITY CLASS: Your output is AUDIT class.

Output format (JSON):
{
  "cognitive_assessment": "...",
  "biases_detected": ["..."],
  "blind_spots": ["..."],
  "epistemic_shifts": ["..."],
  "improvement_suggestions": ["..."],
  "quality_score": 0.0-1.0,
  "open_questions": ["..."],
  "signals": [],
  "confidence": 0.0-1.0
}`,

  system_map: `You are an ION SYSTEM_MAP worker. Map the architecture of the system being analyzed.

Output format (JSON):
{
  "components": [{"name": "...", "type": "...", "dependencies": ["..."], "description": "..."}],
  "connections": [{"from": "...", "to": "...", "type": "..."}],
  "layers": [{"name": "...", "components": ["..."]}],
  "open_questions": ["..."],
  "signals": [],
  "confidence": 0.0-1.0
}`,

  system_evolution: `You are an ION SYSTEM_EVOLUTION worker. Examine whether the protocol architecture itself needs modification.

Output format (JSON):
{
  "protocol_failures": ["..."],
  "architectural_gaps": ["..."],
  "proposed_changes": [{"target": "...", "change": "...", "rationale": "..."}],
  "open_questions": ["..."],
  "signals": [],
  "confidence": 0.0-1.0
}`,
};

// Protocol-to-model mapping (from ION architecture)
const PROTOCOL_MODELS: Record<string, string> = {
  reconnaissance: "google/gemini-3-flash-preview",
  evidence: "google/gemini-2.5-flash",
  consolidation: "google/gemini-2.5-pro",
  review: "google/gemini-2.5-flash",
  signal: "google/gemini-2.5-flash-lite",
  reflection: "google/gemini-2.5-pro",
  system_map: "google/gemini-2.5-flash",
  system_evolution: "google/gemini-2.5-pro",
};

// Protocol-to-authority class mapping
const PROTOCOL_AUTHORITY: Record<string, string> = {
  reconnaissance: "witness",
  evidence: "witness",
  consolidation: "authority",
  review: "audit",
  signal: "generated_state",
  reflection: "audit",
  system_map: "witness",
  system_evolution: "plan",
};

// Protocol-to-artifact type mapping
const PROTOCOL_ARTIFACT_TYPE: Record<string, string> = {
  reconnaissance: "reconnaissance_map",
  evidence: "evidence_extract",
  consolidation: "consolidation_report",
  review: "review_verdict",
  signal: "signal_emission",
  reflection: "reflection_report",
  system_map: "system_map",
  system_evolution: "evolution_proposal",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { work_unit_id, run_id } = await req.json();
    if (!work_unit_id || !run_id) throw new Error("work_unit_id and run_id required");

    const db = supabaseAdmin();

    // ─── Step 1: Load work unit (DISPATCHED → RUNNING transition) ───
    const { data: wu, error: wuErr } = await db
      .from("ion_work_units").select("*").eq("id", work_unit_id).single();
    if (wuErr || !wu) throw new Error(`Work unit not found: ${wuErr?.message}`);

    // Enforce state machine: only dispatched or pending can run
    if (!["dispatched", "pending", "running"].includes(wu.status)) {
      throw new Error(`Work unit not in dispatchable state: ${wu.status}`);
    }

    // Transition to RUNNING
    await db.from("ion_work_units").update({
      status: "running",
      assigned_at: wu.assigned_at || new Date().toISOString(),
    }).eq("id", work_unit_id);

    // ─── Step 2: Load context package ───
    let contextContent = "";
    if (wu.context_package_id) {
      const { data: ctx } = await db
        .from("ion_context_packages").select("*").eq("id", wu.context_package_id).single();
      if (ctx) contextContent = ctx.content;
    }

    // ─── Step 3: Load existing artifacts for run context ───
    const { data: artifacts } = await db
      .from("ion_artifacts")
      .select("name, content, authority_class, artifact_type")
      .eq("run_id", run_id)
      .order("created_at", { ascending: true })
      .limit(20);

    const artifactContext = (artifacts || [])
      .map((a: any) => `[${a.authority_class.toUpperCase()}] ${a.name}:\n${a.content.substring(0, 1000)}`)
      .join("\n\n---\n\n");

    // ─── Step 4: Build the prompt with kernel rules ───
    const protocol = wu.protocol as string;
    const systemPrompt = PROTOCOL_PROMPTS[protocol] || PROTOCOL_PROMPTS.evidence;
    const model = PROTOCOL_MODELS[protocol] || "google/gemini-3-flash-preview";

    const userPrompt = `Task: ${wu.title}
Description: ${wu.description}
Input data: ${JSON.stringify(wu.input_data)}

${contextContent ? `Context package:\n${contextContent}\n` : ""}
${artifactContext ? `Existing artifacts:\n${artifactContext}\n` : ""}

Execute this ${protocol.toUpperCase()} protocol work unit and return the result as specified in the output format.
Remember: You are producing a CommitDelta (proposed state mutation). The daemon will decide whether your output becomes AUTHORITY, WITNESS, or is rejected.`;

    // ─── Step 5: Call AI ───
    const aiResp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) {
        await db.from("ion_work_units").update({ status: "failed", error: "Rate limited" }).eq("id", work_unit_id);
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error (${aiResp.status}): ${errText}`);
    }

    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";
    const tokens = (aiData.usage?.prompt_tokens || 0) + (aiData.usage?.completion_tokens || 0);

    // ─── Step 6: Parse structured output ───
    let parsed: any;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw_output: rawContent, parse_error: true, confidence: 0.3 };
    }

    // ─── Step 7: Build CommitDelta artifacts ───
    const baseAuthority = PROTOCOL_AUTHORITY[protocol] || "witness";
    // If consolidation confidence < 0.8, downgrade to witness (kernel rule)
    const effectiveAuthority = protocol === "consolidation" && (parsed.confidence || 0) < 0.8
      ? "witness" : baseAuthority;

    const artifactsCreated = [{
      name: `${protocol}-${wu.title}`,
      content: JSON.stringify(parsed, null, 2),
      artifact_type: PROTOCOL_ARTIFACT_TYPE[protocol] || protocol,
      authority_class: effectiveAuthority,
    }];

    // ─── Step 8: Extract child work from batch_plan ───
    const childWork = (parsed.batch_plan || []).map((bp: any) => ({
      title: bp.title,
      description: bp.description,
      priority: bp.priority || 50,
      protocol: bp.protocol || "evidence",
      input_data: bp.input_data || {},
    }));

    // ─── Step 9: Create CommitDelta (PROPOSED) ───
    // Worker NEVER writes directly. It returns a proposed delta for daemon review.
    const { data: delta } = await db.from("ion_commit_deltas").insert({
      work_unit_id,
      run_id,
      status: "proposed",
      artifacts_created: artifactsCreated,
      questions_raised: parsed.open_questions || [],
      signals_emitted: parsed.signals || [],
      contradictions_found: parsed.contradictions || [],
      confidence: parsed.confidence || 0.7,
      child_work_suggested: childWork,
      review_reasons: [],
      protocol,
      metadata: { model, tokens, protocol, effective_authority: effectiveAuthority },
    }).select().single();

    // ─── Step 10: Transition to VALIDATING ───
    // (Daemon will pick this up and validate/review the delta)
    await db.from("ion_work_units").update({
      status: "validating",
      tokens_used: tokens,
      result_data: parsed,
    }).eq("id", work_unit_id);

    // ─── Step 11: Update run token count ───
    const { data: run } = await db.from("ion_runs").select("total_tokens").eq("id", run_id).single();
    if (run) {
      await db.from("ion_runs").update({
        total_tokens: (run.total_tokens || 0) + tokens,
      }).eq("id", run_id);
    }

    return new Response(JSON.stringify({
      status: "validating",
      delta_id: delta?.id,
      protocol,
      tokens,
      effective_authority: effectiveAuthority,
      artifacts_created: artifactsCreated.length,
      questions_raised: (parsed.open_questions || []).length,
      child_work_suggested: childWork.length,
      confidence: parsed.confidence || 0.7,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ion-worker error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
