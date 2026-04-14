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

// ─── Authority Classes (from ION kernel model.py) ───
const AUTHORITY_CLASSES = [
  "authority", "witness", "plan", "audit", "generated_state", "stale_competitor"
] as const;

// ─── Daemon Action Types (from ION kernel daemon.py) ───
enum DaemonActionType {
  CONSUME_SIGNAL = "CONSUME_SIGNAL",
  ESCALATE_REVIEW = "ESCALATE_REVIEW",
  ROUTE_OPEN_QUESTIONS = "ROUTE_OPEN_QUESTIONS",
  ISSUE_CHILD_WORK = "ISSUE_CHILD_WORK",
  DISPATCH_WORK = "DISPATCH_WORK",
  VALIDATE_DELTA = "VALIDATE_DELTA",
  PLAN_NEXT_PHASE = "PLAN_NEXT_PHASE",
  RECOVER_STALE = "RECOVER_STALE",
  COMPLETE_RUN = "COMPLETE_RUN",
  IDLE = "IDLE",
}

// Action priority rank (lower = higher priority, matching Python kernel)
const ACTION_RANK: Record<string, number> = {
  [DaemonActionType.CONSUME_SIGNAL]: 0,
  [DaemonActionType.RECOVER_STALE]: 1,
  [DaemonActionType.ESCALATE_REVIEW]: 2,
  [DaemonActionType.VALIDATE_DELTA]: 3,
  [DaemonActionType.ROUTE_OPEN_QUESTIONS]: 4,
  [DaemonActionType.ISSUE_CHILD_WORK]: 5,
  [DaemonActionType.DISPATCH_WORK]: 6,
  [DaemonActionType.PLAN_NEXT_PHASE]: 7,
  [DaemonActionType.COMPLETE_RUN]: 8,
  [DaemonActionType.IDLE]: 99,
};

interface ActionCandidate {
  action_type: DaemonActionType;
  reason: string;
  priority: number;
  work_unit_id?: string;
  delta_id?: string;
  question_id?: string;
  signal_id?: string;
  detail_count?: number;
}

// ─── Work unit status machine (from ION kernel model.py) ───
// PENDING → DISPATCHED → RUNNING → VALIDATING → COMMITTED/FAILED
const TERMINAL_STATUSES = ["completed", "failed", "skipped", "blocked"];
const ACTIVE_STATUSES = ["pending", "dispatched", "running", "validating", "assigned"];

// ─── Status transitions for run phases ───
const PHASE_SEQUENCE = [
  "created", "reconnaissance", "evidence_pass", "consolidation",
  "review", "reconciliation", "densification", "expansion", "completed"
];

const PROTOCOL_FOR_PHASE: Record<string, string> = {
  created: "reconnaissance",
  reconnaissance: "evidence",
  evidence_pass: "consolidation",
  consolidation: "review",
  review: "reconciliation",
  reconciliation: "reflection",
  densification: "evidence",
};

const NEXT_PHASE: Record<string, string> = {
  created: "reconnaissance",
  reconnaissance: "evidence_pass",
  evidence_pass: "consolidation",
  consolidation: "review",
  review: "reconciliation",
  reconciliation: "densification",
  densification: "expansion",
};

// ─── Validation logic (from ION kernel validation.py) ───

interface ValidationDecision {
  delta_status: string;
  work_unit_status: string;
  reasons: string[];
  authority_downgrades: Array<{ artifact_index: number; from: string; to: string }>;
}

function validateDelta(
  delta: any,
  workUnit: any,
  reviewThreshold: number = 0.6
): ValidationDecision {
  const reasons: string[] = [];
  const downgrades: Array<{ artifact_index: number; from: string; to: string }> = [];
  const artifacts = delta.artifacts_created || [];

  // No artifacts = reject
  if (artifacts.length === 0) {
    return { delta_status: "rejected", work_unit_status: "failed", reasons: ["NO_PRODUCED_ARTIFACTS"], authority_downgrades: [] };
  }

  // Check for stale competitor artifacts
  if (artifacts.some((a: any) => a.authority_class === "stale_competitor")) {
    return { delta_status: "proposed", work_unit_status: "validating", reasons: ["STALE_COMPETITOR_REVIEW"], authority_downgrades: [] };
  }

  // Low confidence = needs review
  if (delta.confidence < reviewThreshold) {
    return { delta_status: "proposed", work_unit_status: "validating", reasons: ["LOW_CONFIDENCE_REVIEW"], authority_downgrades: [] };
  }

  // Context version mismatch = downgrade AUTHORITY to WITNESS
  if (workUnit.context_version && delta.metadata?.context_version &&
      workUnit.context_version !== delta.metadata?.context_version) {
    artifacts.forEach((a: any, i: number) => {
      if (a.authority_class === "authority") {
        downgrades.push({ artifact_index: i, from: "authority", to: "witness" });
      }
    });
    if (downgrades.length > 0) {
      return { delta_status: "witness_only", work_unit_status: "completed", reasons: ["STALE_CONTEXT_AUTHORITY_DOWNGRADE"], authority_downgrades: downgrades };
    }
    reasons.push("STALE_CONTEXT_NONAUTHORITY");
  }

  return {
    delta_status: "accepted",
    work_unit_status: "completed",
    reasons: reasons.length > 0 ? reasons : ["VALID_FRESH_DELTA"],
    authority_downgrades: downgrades,
  };
}

// ─── Arbitration (from ION kernel daemon.py) ───

async function gatherCandidates(db: any, runId: string): Promise<ActionCandidate[]> {
  const candidates: ActionCandidate[] = [];

  // Load full state
  const [
    { data: run },
    { data: workUnits },
    { data: deltas },
    { data: questions },
    { data: signals },
  ] = await Promise.all([
    db.from("ion_runs").select("*").eq("id", runId).single(),
    db.from("ion_work_units").select("*").eq("run_id", runId).order("priority", { ascending: false }),
    db.from("ion_commit_deltas").select("*").eq("run_id", runId),
    db.from("ion_open_questions").select("*").eq("run_id", runId),
    db.from("ion_signals").select("*").eq("run_id", runId).eq("consumed", false),
  ]);

  if (!run || ["completed", "failed", "stopped"].includes(run.status)) {
    return [{ action_type: DaemonActionType.IDLE, reason: "RUN_TERMINAL", priority: 99 }];
  }

  // 1. Unconsumed signals (highest priority)
  for (const sig of (signals || [])) {
    candidates.push({
      action_type: DaemonActionType.CONSUME_SIGNAL,
      reason: `ACTIVE_SIGNAL:${sig.signal_type}`,
      priority: 0,
      signal_id: sig.id,
    });
  }

  // 2. Stale work units (recovery)
  const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const staleWUs = (workUnits || []).filter((wu: any) =>
    ["running", "dispatched"].includes(wu.status) && wu.assigned_at && wu.assigned_at < staleThreshold
  );
  if (staleWUs.length > 0) {
    candidates.push({
      action_type: DaemonActionType.RECOVER_STALE,
      reason: `STALE_WORK_UNITS:${staleWUs.length}`,
      priority: 1,
      detail_count: staleWUs.length,
    });
  }

  // 3. Proposed deltas needing validation/review
  const proposedDeltas = (deltas || []).filter((d: any) => d.status === "proposed");
  for (const delta of proposedDeltas) {
    candidates.push({
      action_type: DaemonActionType.VALIDATE_DELTA,
      reason: `VALIDATE:${delta.confidence?.toFixed(2)}`,
      priority: 3,
      delta_id: delta.id,
      work_unit_id: delta.work_unit_id,
    });
  }

  // 4. Accepted deltas with unrouted open questions
  const acceptedDeltas = (deltas || []).filter((d: any) =>
    ["accepted", "witness_only"].includes(d.status)
  );
  for (const delta of acceptedDeltas) {
    const qsRaised = delta.questions_raised || [];
    if (qsRaised.length > 0) {
      const existingQs = (questions || []).filter((q: any) => q.source_work_unit_id === delta.work_unit_id);
      if (existingQs.length < qsRaised.length) {
        candidates.push({
          action_type: DaemonActionType.ROUTE_OPEN_QUESTIONS,
          reason: "UNROUTED_QUESTIONS",
          priority: 4,
          delta_id: delta.id,
          work_unit_id: delta.work_unit_id,
          detail_count: qsRaised.length - existingQs.length,
        });
      }
    }
  }

  // 5. Accepted deltas with child work suggestions
  for (const delta of acceptedDeltas) {
    const childSuggestions = delta.child_work_suggested || [];
    if (childSuggestions.length > 0) {
      candidates.push({
        action_type: DaemonActionType.ISSUE_CHILD_WORK,
        reason: `CHILD_WORK:${childSuggestions.length}`,
        priority: 5,
        delta_id: delta.id,
        work_unit_id: delta.work_unit_id,
        detail_count: childSuggestions.length,
      });
    }
  }

  // 6. Pending work units ready for dispatch
  const pendingWUs = (workUnits || []).filter((wu: any) => wu.status === "pending");
  for (const wu of pendingWUs) {
    // Check dependencies
    const deps = wu.dependencies || [];
    const allDepsComplete = deps.length === 0 || deps.every((depId: string) =>
      (workUnits || []).some((w: any) => w.id === depId && w.status === "completed")
    );
    if (allDepsComplete) {
      candidates.push({
        action_type: DaemonActionType.DISPATCH_WORK,
        reason: `DISPATCH:${wu.protocol}:${wu.title}`,
        priority: 6,
        work_unit_id: wu.id,
      });
    }
  }

  // 7. Phase planning (no pending/active work, need to advance)
  const activeCount = (workUnits || []).filter((wu: any) => ACTIVE_STATUSES.includes(wu.status)).length;
  if (activeCount === 0 && pendingWUs.length === 0) {
    const completedCount = (workUnits || []).filter((wu: any) => wu.status === "completed").length;
    if (completedCount > 0) {
      const nextProto = PROTOCOL_FOR_PHASE[run.status];
      if (nextProto) {
        candidates.push({
          action_type: DaemonActionType.PLAN_NEXT_PHASE,
          reason: `ADVANCE:${run.status}→${NEXT_PHASE[run.status]}`,
          priority: 7,
        });
      } else {
        candidates.push({
          action_type: DaemonActionType.COMPLETE_RUN,
          reason: "ALL_PHASES_COMPLETE",
          priority: 8,
        });
      }
    }
  }

  if (candidates.length === 0) {
    // Check if there's still active work
    const runningCount = (workUnits || []).filter((wu: any) =>
      ["running", "dispatched", "validating"].includes(wu.status)
    ).length;
    if (runningCount > 0) {
      candidates.push({
        action_type: DaemonActionType.IDLE,
        reason: `WAITING:${runningCount}_IN_FLIGHT`,
        priority: 99,
      });
    } else {
      candidates.push({
        action_type: DaemonActionType.IDLE,
        reason: "NO_LAWFUL_ACTIONS",
        priority: 99,
      });
    }
  }

  return candidates.sort((a, b) => (ACTION_RANK[a.action_type] ?? 99) - (ACTION_RANK[b.action_type] ?? 99));
}

// ─── Action Executors ───

async function executeCandidate(db: any, runId: string, candidate: ActionCandidate): Promise<any> {
  switch (candidate.action_type) {
    case DaemonActionType.CONSUME_SIGNAL:
      return consumeSignal(db, runId, candidate.signal_id!);

    case DaemonActionType.RECOVER_STALE:
      return recoverStaleUnits(db, runId);

    case DaemonActionType.VALIDATE_DELTA:
      return validateAndReviewDelta(db, runId, candidate.delta_id!, candidate.work_unit_id);

    case DaemonActionType.ROUTE_OPEN_QUESTIONS:
      return routeOpenQuestions(db, runId, candidate.delta_id!, candidate.work_unit_id!);

    case DaemonActionType.ISSUE_CHILD_WORK:
      return issueChildWork(db, runId, candidate.delta_id!);

    case DaemonActionType.DISPATCH_WORK:
      return dispatchWorkUnit(db, runId, candidate.work_unit_id!);

    case DaemonActionType.PLAN_NEXT_PHASE:
      return planNextPhase(db, runId);

    case DaemonActionType.COMPLETE_RUN:
      return completeRun(db, runId);

    case DaemonActionType.IDLE:
      return { status: "idle", reason: candidate.reason };

    default:
      return { status: "unsupported", action: candidate.action_type };
  }
}

async function consumeSignal(db: any, runId: string, signalId: string) {
  await db.from("ion_signals").update({ consumed: true, consumed_by_work_unit_id: null }).eq("id", signalId);
  return { status: "executed", action: "CONSUME_SIGNAL", signal_id: signalId };
}

async function recoverStaleUnits(db: any, runId: string) {
  const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: staleWUs } = await db.from("ion_work_units")
    .select("id")
    .eq("run_id", runId)
    .in("status", ["running", "dispatched"])
    .lt("assigned_at", staleThreshold);

  let recovered = 0;
  for (const wu of (staleWUs || [])) {
    const { data: hasDelta } = await db.from("ion_commit_deltas")
      .select("id").eq("work_unit_id", wu.id).limit(1);
    if (hasDelta && hasDelta.length > 0) {
      await db.from("ion_work_units").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", wu.id);
    } else {
      await db.from("ion_work_units").update({ status: "failed", error: "Timed out" }).eq("id", wu.id);
    }
    recovered++;
  }
  return { status: "executed", action: "RECOVER_STALE", recovered };
}

async function validateAndReviewDelta(db: any, runId: string, deltaId: string, workUnitId?: string) {
  const { data: delta } = await db.from("ion_commit_deltas").select("*").eq("id", deltaId).single();
  if (!delta) return { status: "error", message: "Delta not found" };

  const { data: wu } = await db.from("ion_work_units").select("*").eq("id", delta.work_unit_id).single();
  const { data: run } = await db.from("ion_runs").select("autonomy_mode").eq("id", runId).single();

  const decision = validateDelta(delta, wu || {});
  const autonomy = run?.autonomy_mode || "supervised";

  // In supervised mode, only auto-accept if VALID_FRESH_DELTA; otherwise flag for review
  let finalDeltaStatus = decision.delta_status;
  if (autonomy === "supervised" && decision.delta_status === "accepted" && delta.confidence < 0.7) {
    finalDeltaStatus = "proposed"; // keep as proposed for manual review
    return {
      status: "review_needed",
      action: "VALIDATE_DELTA",
      delta_id: deltaId,
      confidence: delta.confidence,
      reasons: decision.reasons,
    };
  }

  // Apply authority downgrades
  const artifacts = [...(delta.artifacts_created || [])];
  for (const dg of decision.authority_downgrades) {
    if (artifacts[dg.artifact_index]) {
      artifacts[dg.artifact_index] = { ...artifacts[dg.artifact_index], authority_class: dg.to };
    }
  }

  // Update delta
  await db.from("ion_commit_deltas").update({
    status: finalDeltaStatus,
    reviewed_by: "daemon",
    reviewed_at: new Date().toISOString(),
    review_notes: decision.reasons.join("; "),
    review_reasons: decision.reasons,
    artifacts_created: artifacts,
  }).eq("id", deltaId);

  // Update work unit status
  if (decision.work_unit_status === "completed" || decision.work_unit_status === "failed") {
    await db.from("ion_work_units").update({
      status: decision.work_unit_status,
      completed_at: new Date().toISOString(),
    }).eq("id", delta.work_unit_id);
  }

  // Materialize artifacts if accepted
  if (["accepted", "witness_only"].includes(finalDeltaStatus)) {
    await materializeAcceptedDelta(db, runId, delta, artifacts, finalDeltaStatus);
  }

  return {
    status: "executed",
    action: "VALIDATE_DELTA",
    delta_id: deltaId,
    verdict: finalDeltaStatus,
    reasons: decision.reasons,
    downgrades: decision.authority_downgrades.length,
  };
}

async function materializeAcceptedDelta(db: any, runId: string, delta: any, artifacts: any[], deltaStatus: string) {
  // Materialize artifacts
  for (const art of artifacts) {
    await db.from("ion_artifacts").insert({
      run_id: runId,
      name: art.name || "unnamed",
      content: art.content || "",
      authority_class: deltaStatus === "witness_only" ? "witness" : (art.authority_class || "witness"),
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

async function routeOpenQuestions(db: any, runId: string, deltaId: string, workUnitId: string) {
  const { data: delta } = await db.from("ion_commit_deltas").select("questions_raised").eq("id", deltaId).single();
  const { data: existing } = await db.from("ion_open_questions").select("question").eq("source_work_unit_id", workUnitId);
  const existingTexts = new Set((existing || []).map((q: any) => q.question));

  let routed = 0;
  for (const q of (delta?.questions_raised || [])) {
    const text = typeof q === "string" ? q : q.question || String(q);
    if (!existingTexts.has(text)) {
      await db.from("ion_open_questions").insert({
        run_id: runId,
        question: text,
        source_work_unit_id: workUnitId,
        priority: typeof q === "object" ? q.priority || 50 : 50,
        context: typeof q === "object" ? q.context || "" : "",
      });
      routed++;
    }
  }
  return { status: "executed", action: "ROUTE_OPEN_QUESTIONS", routed };
}

async function issueChildWork(db: any, runId: string, deltaId: string) {
  const { data: delta } = await db.from("ion_commit_deltas")
    .select("child_work_suggested, work_unit_id, metadata").eq("id", deltaId).single();
  if (!delta) return { status: "error", message: "Delta not found" };

  const { data: parentWU } = await db.from("ion_work_units").select("protocol, context_package_id").eq("id", delta.work_unit_id).single();

  let issued = 0;
  for (const child of (delta.child_work_suggested || [])) {
    const protocol = child.protocol || parentWU?.protocol || "evidence";
    await db.from("ion_work_units").insert({
      run_id: runId,
      protocol,
      title: child.title || `Child: ${child.description?.substring(0, 50)}`,
      description: child.description || "",
      priority: child.priority || 50,
      input_data: child.input_data || {},
      context_package_id: parentWU?.context_package_id,
      dependencies: [],
    });
    issued++;
  }

  // Clear child_work_suggested so we don't re-issue
  await db.from("ion_commit_deltas").update({ child_work_suggested: [] }).eq("id", deltaId);

  // Update run total
  const { data: run } = await db.from("ion_runs").select("total_work_units").eq("id", runId).single();
  if (run) {
    await db.from("ion_runs").update({ total_work_units: (run.total_work_units || 0) + issued }).eq("id", runId);
  }

  return { status: "executed", action: "ISSUE_CHILD_WORK", issued };
}

async function dispatchWorkUnit(db: any, runId: string, workUnitId: string) {
  // Transition: PENDING → DISPATCHED → (worker sets RUNNING)
  await db.from("ion_work_units").update({
    status: "dispatched",
    assigned_at: new Date().toISOString(),
  }).eq("id", workUnitId);

  // Call ion-worker
  try {
    const workerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ion-worker`;
    const resp = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ work_unit_id: workUnitId, run_id: runId }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      await db.from("ion_work_units").update({ status: "failed", error: errText }).eq("id", workUnitId);
      return { status: "error", action: "DISPATCH_WORK", work_unit_id: workUnitId, message: errText };
    }

    const result = await resp.json();
    return { status: "executed", action: "DISPATCH_WORK", work_unit_id: workUnitId, result };
  } catch (err) {
    await db.from("ion_work_units").update({ status: "failed", error: String(err) }).eq("id", workUnitId);
    return { status: "error", action: "DISPATCH_WORK", work_unit_id: workUnitId, message: String(err) };
  }
}

async function planNextPhase(db: any, runId: string) {
  const { data: run } = await db.from("ion_runs").select("*").eq("id", runId).single();
  if (!run) return { status: "error", message: "Run not found" };

  const nextProtocol = PROTOCOL_FOR_PHASE[run.status];
  const nextPhase = NEXT_PHASE[run.status];

  if (!nextProtocol || !nextPhase) {
    return completeRun(db, runId);
  }

  // Load existing artifacts for planning context
  const { data: artifacts } = await db.from("ion_artifacts")
    .select("name, content, authority_class, artifact_type")
    .eq("run_id", runId).order("created_at").limit(20);

  const { data: openQs } = await db.from("ion_open_questions")
    .select("question").eq("run_id", runId).eq("status", "open");

  const artifactContext = (artifacts || [])
    .map((a: any) => `[${a.authority_class.toUpperCase()}] ${a.name}: ${a.content.substring(0, 300)}`)
    .join("\n\n");

  const planPrompt = `You are the ION sovereign daemon sequencer. You must plan bounded work units for the "${nextProtocol}" protocol phase.

KERNEL RULES:
- Each work unit must be bounded enough that another agent can see what was attempted, what changed, and what remains unresolved
- Workers return CommitDeltas (proposed state mutations), not truth. The daemon decides authority.
- Authority classes: AUTHORITY (governing law), WITNESS (forensic evidence), PLAN (intended movement), AUDIT (validation)

Run goal: ${run.goal}
Current phase: ${run.status} → transitioning to: ${nextPhase}
Protocol: ${nextProtocol}

Existing artifacts:
${artifactContext || "(none yet)"}

Open questions: ${(openQs || []).map((q: any) => q.question).join("; ") || "(none)"}

Create work unit(s) for this protocol. Each work unit should have a clear scope, bounded objective, and expected output.

Return ONLY a JSON array: [{ "title": "...", "description": "...", "priority": 1-100, "input_data": {} }]`;

  let planned: any[];
  try {
    const aiResp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: planPrompt }],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI planning failed:", t);
      planned = [{ title: `${nextProtocol} pass`, description: `Execute ${nextProtocol} for: ${run.goal}`, priority: 50, input_data: { goal: run.goal } }];
    } else {
      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content || "[]";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      planned = JSON.parse(cleaned);
      if (!Array.isArray(planned)) planned = [planned];
    }
  } catch {
    planned = [{ title: `${nextProtocol} pass`, description: `Execute ${nextProtocol} for: ${run.goal}`, priority: 50, input_data: { goal: run.goal } }];
  }

  // Create context package for this phase
  const { data: ctx } = await db.from("ion_context_packages").insert({
    run_id: runId,
    version: 1,
    content: JSON.stringify({ goal: run.goal, protocol: nextProtocol, phase: nextPhase }),
    content_hash: "",
    doctrine_refs: [],
    artifact_refs: (artifacts || []).map((a: any) => a.id || ""),
  }).select().single();

  // Create work units
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

  // Advance run phase
  await db.from("ion_runs").update({
    status: nextPhase,
    total_work_units: (run.total_work_units || 0) + planned.length,
  }).eq("id", runId);

  return { status: "executed", action: "PLAN_NEXT_PHASE", protocol: nextProtocol, phase: nextPhase, units_created: planned.length };
}

async function completeRun(db: any, runId: string) {
  await db.from("ion_runs").update({ status: "completed", stopped_at: new Date().toISOString() }).eq("id", runId);
  return { status: "executed", action: "COMPLETE_RUN" };
}

// ─── High-level API actions ───

async function startRun(db: any, goal: string, config: any = {}) {
  const { data: run, error } = await db.from("ion_runs").insert({
    goal,
    status: "created",
    autonomy_mode: config.autonomy_mode || "supervised",
    priority_tier: config.priority_tier || 1,
    config,
  }).select().single();

  if (error) throw new Error(`Failed to create run: ${error.message}`);

  const { data: ctx } = await db.from("ion_context_packages").insert({
    run_id: run.id, version: 1,
    content: JSON.stringify({ goal, config }),
    content_hash: "", doctrine_refs: [], artifact_refs: [],
  }).select().single();

  await db.from("ion_work_units").insert({
    run_id: run.id, protocol: "reconnaissance",
    title: "Initial Reconnaissance",
    description: `Map the surface of: ${goal}`,
    priority: 100, context_package_id: ctx?.id,
    input_data: { goal },
  });

  await db.from("ion_runs").update({ total_work_units: 1 }).eq("id", run.id);
  return { run };
}

async function stepOnce(db: any, runId: string) {
  const candidates = await gatherCandidates(db, runId);
  const chosen = candidates[0];

  if (!chosen || chosen.action_type === DaemonActionType.IDLE) {
    return { status: "idle", reason: chosen?.reason || "NO_ACTIONS", candidates: candidates.map(c => ({ action: c.action_type, reason: c.reason })) };
  }

  const result = await executeCandidate(db, runId, chosen);
  return {
    ...result,
    chosen_action: chosen.action_type,
    candidates_considered: candidates.length,
    all_candidates: candidates.map(c => ({ action: c.action_type, reason: c.reason, priority: c.priority })),
  };
}

async function getState(db: any, runId: string) {
  const [
    { data: run }, { data: workUnits }, { data: deltas },
    { data: questions }, { data: signals }, { data: artifacts },
  ] = await Promise.all([
    db.from("ion_runs").select("*").eq("id", runId).single(),
    db.from("ion_work_units").select("*").eq("run_id", runId).order("created_at"),
    db.from("ion_commit_deltas").select("*").eq("run_id", runId).order("created_at"),
    db.from("ion_open_questions").select("*").eq("run_id", runId),
    db.from("ion_signals").select("*").eq("run_id", runId),
    db.from("ion_artifacts").select("*").eq("run_id", runId).order("created_at"),
  ]);

  if (!run) throw new Error("Run not found");

  // Compute arbitration candidates for visibility
  const candidates = await gatherCandidates(db, runId);

  return {
    run,
    work_units: workUnits || [],
    deltas: deltas || [],
    questions: questions || [],
    signals: signals || [],
    artifacts: artifacts || [],
    arbitration: {
      candidates: candidates.map(c => ({ action: c.action_type, reason: c.reason, priority: c.priority })),
      chosen: candidates[0] ? { action: candidates[0].action_type, reason: candidates[0].reason } : null,
    },
  };
}

async function reviewDelta(db: any, runId: string, deltaId: string, verdict: string, notes?: string) {
  const validVerdicts = ["accept", "reject", "witness_only"];
  if (!validVerdicts.includes(verdict)) throw new Error(`Invalid verdict: ${verdict}`);

  const statusMap: Record<string, string> = { accept: "accepted", reject: "rejected", witness_only: "witness_only" };

  const { data: delta } = await db.from("ion_commit_deltas").select("*").eq("id", deltaId).single();
  if (!delta) throw new Error("Delta not found");

  await db.from("ion_commit_deltas").update({
    status: statusMap[verdict],
    reviewed_by: "operator",
    reviewed_at: new Date().toISOString(),
    review_notes: notes || "",
  }).eq("id", deltaId);

  if (["accept", "witness_only"].includes(verdict)) {
    const artifacts = delta.artifacts_created || [];
    await materializeAcceptedDelta(db, runId, delta, artifacts, statusMap[verdict]);
  }

  // Update work unit
  const wuStatus = verdict === "reject" ? "failed" : "completed";
  await db.from("ion_work_units").update({
    status: wuStatus,
    completed_at: new Date().toISOString(),
  }).eq("id", delta.work_unit_id);

  return { status: "reviewed", verdict, delta_id: deltaId };
}

async function answerQuestion(db: any, runId: string, questionId: string, answer: string) {
  await db.from("ion_open_questions").update({
    status: "answered", answer, answered_at: new Date().toISOString(),
  }).eq("id", questionId).eq("run_id", runId);
  return { status: "answered", question_id: questionId };
}

async function emitSignal(db: any, runId: string, signalType: string, payload: any, targetProtocol?: string) {
  const { data } = await db.from("ion_signals").insert({
    run_id: runId, signal_type: signalType,
    target_protocol: targetProtocol || null, payload: payload || {},
  }).select().single();
  return { status: "emitted", signal: data };
}

async function stopRun(db: any, runId: string) {
  await db.from("ion_runs").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("id", runId);
  await db.from("ion_work_units").update({ status: "skipped" }).eq("run_id", runId).in("status", ["pending", "dispatched"]);
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
    const { action, run_id, goal, config, delta_id, verdict, notes, max_steps,
            question_id, answer, signal_type, payload, target_protocol } = body;
    const db = supabaseAdmin();

    let result: any;

    switch (action) {
      case "start_run":
        if (!goal) throw new Error("goal is required");
        result = await startRun(db, goal, config);
        break;

      case "step":
        if (!run_id) throw new Error("run_id is required");
        result = await stepOnce(db, run_id);
        break;

      case "run_to_completion": {
        if (!run_id) throw new Error("run_id is required");
        const limit = Math.min(max_steps || 10, 25);
        const steps: any[] = [];
        for (let i = 0; i < limit; i++) {
          const r = await stepOnce(db, run_id);
          steps.push(r);
          if (["idle", "completed", "error"].includes(r.status) && r.reason !== "WAITING:1_IN_FLIGHT") break;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        result = { steps, total_steps: steps.length, final: steps[steps.length - 1] };
        break;
      }

      case "get_state":
        if (!run_id) throw new Error("run_id is required");
        result = await getState(db, run_id);
        break;

      case "review_delta":
        if (!run_id || !delta_id || !verdict) throw new Error("run_id, delta_id, and verdict required");
        result = await reviewDelta(db, run_id, delta_id, verdict, notes);
        break;

      case "answer_question":
        if (!run_id || !question_id || !answer) throw new Error("run_id, question_id, and answer required");
        result = await answerQuestion(db, run_id, question_id, answer);
        break;

      case "emit_signal":
        if (!run_id || !signal_type) throw new Error("run_id and signal_type required");
        result = await emitSignal(db, run_id, signal_type, payload, target_protocol);
        break;

      case "stop_run":
        if (!run_id) throw new Error("run_id is required");
        result = await stopRun(db, run_id);
        break;

      case "list_runs":
        result = await listRuns(db);
        break;

      default:
        throw new Error(`Unknown action: ${action}. Valid: start_run, step, run_to_completion, get_state, review_delta, answer_question, emit_signal, stop_run, list_runs`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ion-daemon error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
