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

// ─── Priority tier computation ───
interface RunState {
  blockers: number;
  open_questions: number;
  pending_reviews: number;
  pending_work_units: number;
  completed_work_units: number;
  total_work_units: number;
  failed_work_units: number;
}

function computeNextProtocol(status: string, state: RunState): string | null {
  // Tier 1: Hard blockers
  if (state.blockers > 0) return null;

  // Tier 2: Protocol obligations  
  if (status === "created") return "reconnaissance";
  if (status === "reconnaissance") return "evidence";
  if (status === "evidence_pass") return "consolidation";
  if (status === "consolidation") return "review";
  if (status === "review") return "reconciliation";

  // Tier 3: Densification
  if (state.open_questions > 0) return "evidence";
  if (state.pending_reviews > 0) return "review";

  // Tier 4: Expansion
  if (status === "reconciliation" || status === "densification") return "expansion";

  return null;
}

// Map run status transitions
const STATUS_AFTER_PROTOCOL: Record<string, string> = {
  reconnaissance: "reconnaissance",
  evidence: "evidence_pass",
  consolidation: "consolidation",
  review: "review",
  reconciliation: "reconciliation",
  expansion: "expansion",
};

// ─── Action handlers ───

async function startRun(db: any, goal: string, config: any = {}) {
  const { data: run, error } = await db
    .from("ion_runs")
    .insert({
      goal,
      status: "created",
      autonomy_mode: config.autonomy_mode || "supervised",
      priority_tier: config.priority_tier || 1,
      config,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create run: ${error.message}`);

  // Create initial RECONNAISSANCE work unit
  const { data: ctx } = await db
    .from("ion_context_packages")
    .insert({
      run_id: run.id,
      version: 1,
      content: JSON.stringify({ goal, config }),
      content_hash: "",
      doctrine_refs: [],
      artifact_refs: [],
    })
    .select()
    .single();

  const { data: wu } = await db
    .from("ion_work_units")
    .insert({
      run_id: run.id,
      protocol: "reconnaissance",
      title: "Initial Reconnaissance",
      description: `Map the surface of: ${goal}`,
      priority: 100,
      context_package_id: ctx?.id,
      input_data: { goal },
    })
    .select()
    .single();

  await db.from("ion_runs").update({ total_work_units: 1 }).eq("id", run.id);

  return { run, work_unit: wu };
}

async function getState(db: any, runId: string) {
  const { data: run } = await db.from("ion_runs").select("*").eq("id", runId).single();
  if (!run) throw new Error("Run not found");

  const { data: workUnits } = await db
    .from("ion_work_units")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  const { data: deltas } = await db
    .from("ion_commit_deltas")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  const { data: questions } = await db
    .from("ion_open_questions")
    .select("*")
    .eq("run_id", runId);

  const { data: signals } = await db
    .from("ion_signals")
    .select("*")
    .eq("run_id", runId);

  const { data: artifacts } = await db
    .from("ion_artifacts")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  return {
    run,
    work_units: workUnits || [],
    deltas: deltas || [],
    questions: questions || [],
    signals: signals || [],
    artifacts: artifacts || [],
  };
}

async function step(db: any, runId: string) {
  const state = await getState(db, runId);
  const run = state.run;

  if (["completed", "failed", "stopped"].includes(run.status)) {
    return { status: "terminal", message: `Run is ${run.status}` };
  }

  // Find pending work units
  const pendingWU = state.work_units.filter((wu: any) => wu.status === "pending");
  const runningWU = state.work_units.filter((wu: any) => wu.status === "running");

  if (runningWU.length > 0) {
    // Recover stale running WUs (assigned > 2 min ago with no completion)
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const staleWUs = runningWU.filter((wu: any) => wu.assigned_at && wu.assigned_at < staleThreshold);
    if (staleWUs.length > 0) {
      for (const wu of staleWUs) {
        // Check if a delta was created (worker completed but WU status wasn't updated)
        const hasDelta = state.deltas.some((d: any) => d.work_unit_id === wu.id);
        if (hasDelta) {
          await db.from("ion_work_units").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", wu.id);
        } else {
          await db.from("ion_work_units").update({ status: "failed", error: "Timed out after 2 minutes" }).eq("id", wu.id);
        }
      }
      return { status: "recovered", recovered: staleWUs.length, message: "Recovered stale work units" };
    }
    return { status: "waiting", message: "Work units still running", running: runningWU.length };
  }

  // Check for proposed deltas needing review
  const proposedDeltas = state.deltas.filter((d: any) => d.status === "proposed");
  if (proposedDeltas.length > 0) {
    const autonomy = run.autonomy_mode || "supervised";
    if (autonomy === "autonomous") {
      // Auto-review all
      for (const delta of proposedDeltas) {
        await reviewDelta(db, runId, delta.id, "accept", "Daemon auto-review (autonomous mode)");
      }
      return { status: "reviewed", deltas_reviewed: proposedDeltas.length, mode: "auto" };
    } else {
      // In supervised mode, auto-review with lower confidence threshold
      const highConfidence = proposedDeltas.filter((d: any) => d.confidence >= 0.7);
      const lowConfidence = proposedDeltas.filter((d: any) => d.confidence < 0.7);
      
      for (const delta of highConfidence) {
        await reviewDelta(db, runId, delta.id, "accept", "Daemon auto-review (high confidence)");
      }
      
      if (lowConfidence.length > 0) {
        return {
          status: "review_needed",
          auto_reviewed: highConfidence.length,
          awaiting_review: lowConfidence.map((d: any) => ({
            id: d.id, confidence: d.confidence, work_unit_id: d.work_unit_id,
          })),
        };
      }
      return { status: "reviewed", deltas_reviewed: highConfidence.length, mode: "supervised" };
    }
  }

  if (pendingWU.length > 0) {
    // Execute the highest priority pending work unit
    const nextWU = pendingWU.sort((a: any, b: any) => b.priority - a.priority)[0];
    
    // Check dependencies
    if (nextWU.dependencies && nextWU.dependencies.length > 0) {
      const depStatuses = state.work_units
        .filter((wu: any) => nextWU.dependencies.includes(wu.id))
        .map((wu: any) => wu.status);
      
      if (depStatuses.some((s: string) => s !== "completed")) {
        return { status: "blocked", message: "Dependencies not met", work_unit: nextWU.id };
      }
    }

    // Mark as running
    await db.from("ion_work_units").update({
      status: "running",
      assigned_at: new Date().toISOString(),
    }).eq("id", nextWU.id);

    // Execute via ion-worker
    try {
      const workerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ion-worker`;
      const resp = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ work_unit_id: nextWU.id, run_id: runId }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        await db.from("ion_work_units").update({ status: "failed", error: errText }).eq("id", nextWU.id);
        return { status: "error", work_unit: nextWU.id, message: errText };
      }

      const result = await resp.json();
      return { status: "executed", work_unit: nextWU.id, result };
    } catch (err) {
      await db.from("ion_work_units").update({ status: "failed", error: String(err) }).eq("id", nextWU.id);
      return { status: "error", work_unit: nextWU.id, message: String(err) };
    }
  }

  // No pending work — compute next protocol
  const runState: RunState = {
    blockers: state.work_units.filter((wu: any) => wu.status === "blocked").length,
    open_questions: state.questions.filter((q: any) => q.status === "open").length,
    pending_reviews: state.deltas.filter((d: any) => d.status === "proposed").length,
    pending_work_units: pendingWU.length,
    completed_work_units: state.work_units.filter((wu: any) => wu.status === "completed").length,
    total_work_units: state.work_units.length,
    failed_work_units: state.work_units.filter((wu: any) => wu.status === "failed").length,
  };

  const nextProtocol = computeNextProtocol(run.status, runState);

  if (!nextProtocol) {
    // Check completion
    const activeWU = state.work_units.filter((wu: any) => !["completed", "failed", "skipped"].includes(wu.status));
    if (activeWU.length === 0 && runState.completed_work_units > 0) {
      await db.from("ion_runs").update({ status: "completed", stopped_at: new Date().toISOString() }).eq("id", runId);
      return { status: "completed", message: "All work units finished" };
    }
    return { status: "blocked", message: "No legal transitions available", state: runState };
  }

  // Plan next work units using AI
  const completedArtifacts = state.artifacts
    .map((a: any) => `[${a.authority_class}] ${a.name}: ${a.content.substring(0, 300)}`)
    .join("\n\n");

  const planPrompt = `You are the ION daemon sequencer. Create work unit(s) for protocol "${nextProtocol}".

Run goal: ${run.goal}
Current status: ${run.status}
Completed artifacts:
${completedArtifacts || "(none)"}
Open questions: ${state.questions.filter((q: any) => q.status === "open").map((q: any) => q.question).join("; ") || "(none)"}

Return a JSON array of work units. Each: { "title": "...", "description": "...", "priority": 1-100, "input_data": {} }
Return ONLY the JSON array, no markdown.`;

  const aiResp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: planPrompt }],
    }),
  });

  let planned: any[];
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("AI planning failed:", t);
    planned = [{ title: `${nextProtocol} pass`, description: `Execute ${nextProtocol} for: ${run.goal}`, priority: 50, input_data: { goal: run.goal } }];
  } else {
    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      planned = JSON.parse(cleaned);
      if (!Array.isArray(planned)) planned = [planned];
    } catch {
      planned = [{ title: `${nextProtocol} pass`, description: `Execute ${nextProtocol} for: ${run.goal}`, priority: 50, input_data: { goal: run.goal } }];
    }
  }

  // Create context package
  const { data: ctx } = await db.from("ion_context_packages").insert({
    run_id: runId,
    version: 1,
    content: JSON.stringify({ goal: run.goal, protocol: nextProtocol, artifacts: state.artifacts.map((a: any) => a.id) }),
    content_hash: "",
    doctrine_refs: [],
    artifact_refs: state.artifacts.map((a: any) => a.id),
  }).select().single();

  for (const p of planned) {
    await db.from("ion_work_units").insert({
      run_id: runId,
      protocol: nextProtocol,
      title: p.title || `${nextProtocol} unit`,
      description: p.description || "",
      priority: p.priority || 50,
      context_package_id: ctx?.id,
      input_data: p.input_data || {},
    });
  }

  await db.from("ion_runs").update({
    status: STATUS_AFTER_PROTOCOL[nextProtocol] || run.status,
    total_work_units: (run.total_work_units || 0) + planned.length,
  }).eq("id", runId);

  return { status: "planned", protocol: nextProtocol, units_created: planned.length };
}

async function reviewDelta(db: any, runId: string, deltaId: string, verdict: string, notes?: string) {
  const validVerdicts = ["accept", "reject", "witness_only"];
  if (!validVerdicts.includes(verdict)) throw new Error(`Invalid verdict: ${verdict}. Valid: ${validVerdicts.join(", ")}`);

  const statusMap: Record<string, string> = { accept: "accepted", reject: "rejected", witness_only: "witness_only" };

  // Fetch delta first
  const { data: delta } = await db.from("ion_commit_deltas").select("*").eq("id", deltaId).single();
  if (!delta) throw new Error("Delta not found");

  // Update delta status
  await db.from("ion_commit_deltas").update({
    status: statusMap[verdict],
    reviewed_by: "daemon",
    reviewed_at: new Date().toISOString(),
    review_notes: notes || "",
  }).eq("id", deltaId);

  // If accepted or witness_only, materialize artifacts
  if (verdict === "accept" || verdict === "witness_only") {
    const authorityClass = verdict === "accept" ? undefined : "witness"; // keep original if accepting
    const artifacts = delta.artifacts_created || [];
    for (const art of artifacts) {
      await db.from("ion_artifacts").insert({
        run_id: runId,
        name: art.name || "unnamed",
        content: art.content || "",
        authority_class: authorityClass || art.authority_class || "witness",
        content_hash: art.content_hash || "",
        created_by_work_unit_id: delta.work_unit_id,
        artifact_type: art.artifact_type || "document",
        metadata: art.metadata || {},
      });
    }

    // Materialize open questions
    for (const q of (delta.questions_raised || [])) {
      await db.from("ion_open_questions").insert({
        run_id: runId,
        question: typeof q === "string" ? q : q.question || String(q),
        source_work_unit_id: delta.work_unit_id,
        priority: typeof q === "object" ? q.priority || 50 : 50,
        context: typeof q === "object" ? q.context || "" : "",
      });
    }

    // Materialize signals
    for (const sig of (delta.signals_emitted || [])) {
      await db.from("ion_signals").insert({
        run_id: runId,
        signal_type: sig.type || "info",
        source_work_unit_id: delta.work_unit_id,
        target_protocol: sig.target_protocol || null,
        payload: sig.payload || sig,
      });
    }
  }

  return { status: "reviewed", verdict, delta_id: deltaId };
}

async function answerQuestion(db: any, runId: string, questionId: string, answer: string) {
  await db.from("ion_open_questions").update({
    status: "answered",
    answer,
    answered_at: new Date().toISOString(),
  }).eq("id", questionId).eq("run_id", runId);
  return { status: "answered", question_id: questionId };
}

async function emitSignal(db: any, runId: string, signalType: string, payload: any, targetProtocol?: string) {
  const { data } = await db.from("ion_signals").insert({
    run_id: runId,
    signal_type: signalType,
    target_protocol: targetProtocol || null,
    payload: payload || {},
  }).select().single();
  return { status: "emitted", signal: data };
}

async function stopRun(db: any, runId: string) {
  await db.from("ion_runs").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("id", runId);
  await db.from("ion_work_units").update({ status: "skipped" }).eq("run_id", runId).eq("status", "pending");
  return { status: "stopped" };
}

async function listRuns(db: any) {
  const { data } = await db.from("ion_runs").select("*").order("created_at", { ascending: false }).limit(50);
  return { runs: data || [] };
}

// ─── Main handler ───
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, run_id, goal, config, delta_id, verdict, notes, max_steps, question_id, answer, signal_type, payload, target_protocol } = body;
    const db = supabaseAdmin();

    let result: any;

    switch (action) {
      case "start_run":
        if (!goal) throw new Error("goal is required");
        result = await startRun(db, goal, config);
        break;

      case "step":
        if (!run_id) throw new Error("run_id is required");
        result = await step(db, run_id);
        break;

      case "run_to_completion": {
        if (!run_id) throw new Error("run_id is required");
        const limit = Math.min(max_steps || 10, 20);
        const steps: any[] = [];
        for (let i = 0; i < limit; i++) {
          const r = await step(db, run_id);
          steps.push(r);
          if (["completed", "failed", "stopped", "blocked", "terminal"].includes(r.status)) break;
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        result = { status: "ran", steps_executed: steps.length, steps };
        break;
      }

      case "review_delta":
        if (!run_id || !delta_id || !verdict) throw new Error("run_id, delta_id, verdict required");
        result = await reviewDelta(db, run_id, delta_id, verdict, notes);
        break;

      case "answer_question":
        if (!run_id || !question_id || !answer) throw new Error("run_id, question_id, answer required");
        result = await answerQuestion(db, run_id, question_id, answer);
        break;

      case "emit_signal":
        if (!run_id || !signal_type) throw new Error("run_id, signal_type required");
        result = await emitSignal(db, run_id, signal_type, payload, target_protocol);
        break;

      case "get_state":
        if (!run_id) throw new Error("run_id is required");
        result = await getState(db, run_id);
        break;

      case "stop":
        if (!run_id) throw new Error("run_id is required");
        result = await stopRun(db, run_id);
        break;

      case "list_runs":
        result = await listRuns(db);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ion-daemon error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
