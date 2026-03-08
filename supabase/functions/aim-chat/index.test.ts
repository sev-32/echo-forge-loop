import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertExists } from "https://deno.land/std@0.224.0/assert/assert_exists.ts";

// ─── Config ──────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/aim-chat`;

// ─── Types ───────────────────────────────────────────────
interface RunCapture {
  events: Array<{ type: string; data: any; timestamp: number }>;
  plan: any | null;
  taskOutputs: string[];
  taskDeltas: Record<number, string>;
  verifications: any[];
  reflection: any | null;
  rulesGenerated: any[];
  runComplete: any | null;
  thoughts: Array<{ phase: string; content: string }>;
  memoryEvents: any[];
  sectionEvents: any[];
  continuationEvents: any[];
  errors: string[];
  totalDurationMs: number;
  rawEventTypes: string[];
}

// ─── SSE Stream Parser ──────────────────────────────────
async function captureRun(goal: string, maxRetries = 3): Promise<RunCapture> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const wait = 5000 * attempt;
      console.log(`  ⏳ Rate limited, waiting ${wait / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, wait));
    }

    const start = Date.now();
    const result: RunCapture = {
      events: [], plan: null, taskOutputs: [], taskDeltas: {},
      verifications: [], reflection: null, rulesGenerated: [],
      runComplete: null, thoughts: [], memoryEvents: [],
      sectionEvents: [], continuationEvents: [],
      errors: [], totalDurationMs: 0, rawEventTypes: [],
    };

    const resp = await fetch(EDGE_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: goal }] }),
    });

    if (resp.status === 429) {
      await resp.text(); // drain body
      continue;
    }
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }
    assertExists(resp.body, "Response must be a stream");

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }
  assertExists(resp.body, "Response must be a stream");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") break;

      try {
        const evt = JSON.parse(json);
        result.events.push({ type: evt.type, data: evt, timestamp: Date.now() });
        result.rawEventTypes.push(evt.type);

        switch (evt.type) {
          case "thinking":
            result.thoughts.push({ phase: evt.phase, content: evt.content });
            break;
          case "memory_detail":
            result.memoryEvents.push(evt);
            break;
          case "plan":
            result.plan = evt;
            break;
          case "task_delta":
            if (!result.taskDeltas[evt.task_index]) result.taskDeltas[evt.task_index] = "";
            result.taskDeltas[evt.task_index] += evt.delta;
            break;
          case "task_verified":
            result.verifications.push(evt.verification);
            break;
          case "task_complete": {
            const output = result.taskDeltas[evt.task_index];
            if (output) result.taskOutputs.push(output);
            break;
          }
          case "task_error":
            result.errors.push(evt.error);
            break;
          case "task_sections_planned":
          case "task_section_start":
            result.sectionEvents.push(evt);
            break;
          case "task_continuation":
            result.continuationEvents.push(evt);
            break;
          case "reflection":
            result.reflection = evt.data;
            break;
          case "rules_generated":
            result.rulesGenerated.push(...(evt.rules || []));
            break;
          case "run_complete":
            result.runComplete = evt;
            break;
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
    }

    result.totalDurationMs = Date.now() - start;
    return result;
  }
  throw new Error("Rate limited after all retries");
}

// ─── DB Query Helper ────────────────────────────────────
async function queryDB(table: string, filter: string) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  assert(resp.ok, `DB query failed: ${resp.status}`);
  return await resp.json();
}

// ═══════════════════════════════════════════════════════════
// TEST 1: Error handling (lightweight, no AI call)
// ═══════════════════════════════════════════════════════════
Deno.test("Error handling: rejects malformed request", async () => {
  const resp = await fetch(EDGE_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({}),
  });
  assertEquals(resp.status, 500);
  const body = await resp.json();
  assertExists(body.error, "Error response must have error field");
  console.log(`✅ Malformed request rejected: ${body.error}`);
});

// ═══════════════════════════════════════════════════════════
// TEST 2: FULL PIPELINE — one run, exhaustive assertions
// ═══════════════════════════════════════════════════════════
Deno.test("Full pipeline: thinking → plan → execute → verify → reflect → persist", async () => {
  const goal = "Explain the differences between SQL and NoSQL databases with pros and cons of each";
  console.log(`\n${"═".repeat(60)}`);
  console.log("  FULL END-TO-END PIPELINE TEST");
  console.log(`${"═".repeat(60)}`);
  console.log(`🎯 Goal: "${goal}"\n`);

  const run = await captureRun(goal);

  // ════════════════════════════════════════════════════════
  // PHASE 1: SSE PROTOCOL
  // ════════════════════════════════════════════════════════
  console.log("─── SSE PROTOCOL ───");
  assert(run.events.length >= 3, `Too few events: ${run.events.length}`);
  for (const evt of run.events) {
    assertExists(evt.type, "Every event must have 'type'");
  }
  console.log(`  ✅ ${run.events.length} valid SSE events received`);
  console.log(`  Event types: ${run.rawEventTypes.join(" → ")}`);

  // ════════════════════════════════════════════════════════
  // PHASE 2: THINKING / AI CONSCIOUSNESS
  // ════════════════════════════════════════════════════════
  console.log("\n─── AI CONSCIOUSNESS ───");
  assert(run.thoughts.length > 0, `No thinking events (${run.rawEventTypes.length} total events)`);
  for (const t of run.thoughts) {
    assertExists(t.phase, "Thought must have phase");
    assertExists(t.content, "Thought must have content");
    assert(t.content.length > 5, `Thought too short: "${t.content}"`);
  }
  const phases = [...new Set(run.thoughts.map(t => t.phase))];
  console.log(`  ✅ ${run.thoughts.length} thoughts across phases: ${phases.join(", ")}`);
  for (const t of run.thoughts) {
    console.log(`    [${t.phase}] ${t.content.slice(0, 120)}`);
  }

  // Thinking before plan
  const thinkIdx = run.rawEventTypes.indexOf("thinking");
  const planIdx = run.rawEventTypes.indexOf("plan");
  if (thinkIdx >= 0 && planIdx >= 0) {
    assert(thinkIdx < planIdx, "Thinking must precede plan");
  }

  // ════════════════════════════════════════════════════════
  // PHASE 3: MEMORY LOADING
  // ════════════════════════════════════════════════════════
  console.log("\n─── MEMORY LOADING ───");
  console.log(`  Memory events: ${run.memoryEvents.length}`);
  for (const m of run.memoryEvents) {
    console.log(`    ${m.detail_type || "memory"}: ${JSON.stringify(m).slice(0, 120)}`);
  }

  // ════════════════════════════════════════════════════════
  // PHASE 4: PLANNING
  // ════════════════════════════════════════════════════════
  console.log("\n─── PLANNING ───");
  assertExists(run.plan, "No plan event");
  assertExists(run.plan.tasks, "Plan must have tasks");
  assert(run.plan.tasks.length > 0, "Plan must have ≥1 task");
  const planGoal = run.plan.goal || run.plan.goal_summary;
  assertExists(planGoal, "Plan must have goal or goal_summary");
  assertExists(run.plan.overall_complexity, "Plan must have complexity");
  assert(
    ["simple", "moderate", "complex", "expert", "research-grade"].includes(run.plan.overall_complexity),
    `Invalid complexity: ${run.plan.overall_complexity}`
  );

  for (const task of run.plan.tasks) {
    assertExists(task.title, "Task must have title");
    assert(
      Array.isArray(task.acceptance_criteria) && task.acceptance_criteria.length > 0,
      `Task "${task.title}" missing acceptance criteria`
    );
  }

  console.log(`  ✅ Plan: "${planGoal}"`);
  console.log(`  Approach: ${run.plan.approach?.slice(0, 120)}`);
  console.log(`  Complexity: ${run.plan.overall_complexity}`);
  console.log(`  Tasks: ${run.plan.tasks.length}`);
  for (const t of run.plan.tasks) {
    console.log(`    → [${t.detail_level || '?'}] ${t.title} (${t.acceptance_criteria?.length || 0} criteria)`);
    for (const c of t.acceptance_criteria || []) {
      console.log(`        • ${c}`);
    }
  }

  // ════════════════════════════════════════════════════════
  // PHASE 5: TASK EXECUTION
  // ════════════════════════════════════════════════════════
  console.log("\n─── TASK EXECUTION ───");
  const deltaCount = Object.keys(run.taskDeltas).length;
  assert(deltaCount > 0 || run.errors.length > 0, "Must have deltas or errors");
  assert(run.taskOutputs.length > 0 || run.errors.length > 0, "No outputs or errors");

  for (let i = 0; i < run.taskOutputs.length; i++) {
    const out = run.taskOutputs[i];
    assert(out.length > 50, `Task ${i + 1} output too short (${out.length} chars)`);
    console.log(`  ✅ Task ${i + 1}: ${out.length} chars`);
    console.log(`    Preview: ${out.slice(0, 200).replace(/\n/g, " ")}…`);
  }
  if (run.errors.length > 0) {
    console.log(`  ⚠️ Errors: ${run.errors.length}`);
    run.errors.forEach(e => console.log(`    ${e}`));
  }

  // ════════════════════════════════════════════════════════
  // PHASE 6: VERIFICATION
  // ════════════════════════════════════════════════════════
  console.log("\n─── VERIFICATION ───");
  assert(run.verifications.length > 0, "No verifications");

  let totalScore = 0;
  let totalCriteria = 0;
  let metCriteria = 0;

  for (let i = 0; i < run.verifications.length; i++) {
    const v = run.verifications[i];
    assert(typeof v.passed === "boolean", `V${i} must have boolean passed`);
    assert(typeof v.score === "number", `V${i} must have numeric score`);
    assert(v.score >= 0 && v.score <= 100, `Score out of range: ${v.score}`);
    assertExists(v.summary, `V${i} must have summary`);
    assert(Array.isArray(v.criteria_results), `V${i} must have criteria_results`);

    totalScore += v.score;
    console.log(`  Task ${i + 1}: ${v.passed ? "✅ PASS" : "❌ FAIL"} — ${v.score}/100`);
    console.log(`    ${v.summary}`);

    for (const cr of v.criteria_results) {
      assert(typeof cr.met === "boolean", "Criterion must have boolean met");
      assertExists(cr.criterion, "Criterion must reference criterion text");
      assertExists(cr.reasoning, "Criterion must have reasoning");
      totalCriteria++;
      if (cr.met) metCriteria++;
      console.log(`      ${cr.met ? "✓" : "✗"} ${cr.criterion}`);
      console.log(`        → ${cr.reasoning?.slice(0, 100)}`);
    }
  }

  // ════════════════════════════════════════════════════════
  // PHASE 7: REFLECTION
  // ════════════════════════════════════════════════════════
  console.log("\n─── DEEP REFLECTION ───");
  assertExists(run.reflection, "No reflection");
  assertExists(run.reflection.summary, "Reflection must have summary");
  assert(run.reflection.summary.length > 20, "Reflection summary too short");

  console.log(`  Summary: ${run.reflection.summary}`);

  if (run.reflection.process_evaluation) {
    const pe = run.reflection.process_evaluation;
    assert(typeof pe.planning_score === "number", "Must have planning_score");
    assert(pe.planning_score >= 0 && pe.planning_score <= 100, `Planning score out of range: ${pe.planning_score}`);
    console.log(`  Planning: ${pe.planning_score}/100 — ${pe.planning_feedback?.slice(0, 100)}`);
  }
  if (run.reflection.strategy_assessment) {
    const sa = run.reflection.strategy_assessment;
    assert(typeof sa.effectiveness_score === "number", "Must have effectiveness_score");
    console.log(`  Strategy: ${sa.effectiveness_score}/100 — ${sa.feedback?.slice(0, 100)}`);
  }
  if (run.reflection.new_process_rules?.length > 0) {
    console.log(`  New rules: ${run.reflection.new_process_rules.length}`);
    for (const r of run.reflection.new_process_rules) {
      console.log(`    → [${r.category}] ${r.rule_text}`);
    }
  }

  // ════════════════════════════════════════════════════════
  // PHASE 8: RULE EVOLUTION
  // ════════════════════════════════════════════════════════
  console.log("\n─── RULE EVOLUTION ───");
  console.log(`  Rules generated: ${run.rulesGenerated.length}`);
  for (const r of run.rulesGenerated) {
    console.log(`    → ${JSON.stringify(r).slice(0, 120)}`);
  }

  // ════════════════════════════════════════════════════════
  // PHASE 9: PIPELINE ORDERING
  // ════════════════════════════════════════════════════════
  console.log("\n─── PIPELINE ORDERING ───");
  const types = run.rawEventTypes;

  // Plan before deltas
  const pIdx = types.indexOf("plan");
  const firstDelta = types.indexOf("task_delta");
  if (pIdx >= 0 && firstDelta >= 0) {
    assert(pIdx < firstDelta, "Plan must precede task deltas");
    console.log(`  ✅ Plan (${pIdx}) before first delta (${firstDelta})`);
  }

  // Deltas before complete
  const completeIdx = types.lastIndexOf("run_complete");
  const lastDelta = types.lastIndexOf("task_delta");
  if (completeIdx >= 0 && lastDelta >= 0) {
    assert(lastDelta < completeIdx, "All deltas before run_complete");
    console.log(`  ✅ Last delta (${lastDelta}) before complete (${completeIdx})`);
  }

  // Reflection before complete
  const reflIdx = types.lastIndexOf("reflection");
  if (reflIdx >= 0 && completeIdx >= 0) {
    assert(reflIdx < completeIdx, "Reflection before run_complete");
    console.log(`  ✅ Reflection (${reflIdx}) before complete (${completeIdx})`);
  }

  // ════════════════════════════════════════════════════════
  // PHASE 10: RUN COMPLETION
  // ════════════════════════════════════════════════════════
  console.log("\n─── COMPLETION ───");
  assertExists(run.runComplete, "No run_complete");
  assertExists(run.runComplete.run_id, "Must have run_id");
  assert(run.runComplete.total_tokens > 0, "Must have tokens > 0");
  assert(run.runComplete.task_count > 0, "Must have task_count > 0");
  assert(typeof run.runComplete.tasks_passed === "number", "Must have tasks_passed");

  console.log(`  ✅ Run ${run.runComplete.run_id}`);
  console.log(`  Tokens: ${run.runComplete.total_tokens}`);
  console.log(`  Tasks: ${run.runComplete.tasks_passed}/${run.runComplete.task_count} passed`);

  // ════════════════════════════════════════════════════════
  // PHASE 11: DATABASE PERSISTENCE
  // ════════════════════════════════════════════════════════
  console.log("\n─── DATABASE PERSISTENCE ───");
  const runId = run.runComplete.run_id;
  await new Promise(r => setTimeout(r, 3000));

  // Run traces
  const traces = await queryDB("run_traces", `run_id=eq.${runId}`);
  assert(traces.length > 0, `No trace for run ${runId}`);
  const trace = traces[0];
  assertEquals(trace.status, "complete");
  assertEquals(trace.run_id, runId);
  assert(trace.task_count > 0, "Trace task_count > 0");
  assert(trace.total_tokens > 0, "Trace total_tokens > 0");
  assertExists(trace.goal, "Trace must have goal");
  assertExists(trace.planning_reasoning, "Trace must have planning_reasoning");
  assertExists(trace.completed_at, "Trace must have completed_at");

  console.log(`  ✅ run_traces: saved`);
  console.log(`    Goal: ${trace.goal}`);
  console.log(`    Complexity: ${trace.overall_complexity}`);
  console.log(`    Tasks: ${trace.tasks_passed}/${trace.task_count}`);
  console.log(`    Avg score: ${trace.avg_score}`);
  console.log(`    Planning score: ${trace.planning_score}`);
  console.log(`    Strategy score: ${trace.strategy_score}`);
  console.log(`    Tokens: ${trace.total_tokens}`);
  console.log(`    Planning reasoning: ${trace.planning_reasoning?.slice(0, 100)}`);

  // Events table
  const events = await queryDB("events", `run_id=eq.${runId}&order=created_at.asc`);
  assert(events.length >= 2, `Expected ≥2 events, got ${events.length}`);
  const eventTypes = events.map((e: any) => e.event_type);
  console.log(`  ✅ events: ${events.length} rows — ${eventTypes.join(", ")}`);

  // Tasks table
  const tasks = await queryDB("tasks", `run_id=eq.${runId}&order=created_at.asc`);
  assert(tasks.length > 0, `No tasks for run ${runId}`);
  for (const task of tasks) {
    assertEquals(task.run_id, runId);
    assert(["done", "failed"].includes(task.status), `Unexpected status: ${task.status}`);
  }
  const doneCount = tasks.filter((t: any) => t.status === "done").length;
  console.log(`  ✅ tasks: ${doneCount}/${tasks.length} done`);
  tasks.forEach((t: any) => console.log(`    ${t.status.toUpperCase()}: ${t.title}`));

  // ════════════════════════════════════════════════════════
  // EFFECTIVENESS REPORT
  // ════════════════════════════════════════════════════════
  const avgScore = Math.round(totalScore / run.verifications.length);
  const passRate = Math.round((run.verifications.filter(v => v.passed).length / run.verifications.length) * 100);
  const criteriaRate = totalCriteria > 0 ? Math.round((metCriteria / totalCriteria) * 100) : 0;

  console.log(`\n${"═".repeat(60)}`);
  console.log("  📊 EFFECTIVENESS REPORT");
  console.log(`${"═".repeat(60)}`);
  console.log(`  Goal:               ${planGoal}`);
  console.log(`  Complexity:         ${run.plan.overall_complexity}`);
  console.log(`  Tasks:              ${run.runComplete.tasks_passed}/${run.runComplete.task_count} passed`);
  console.log(`  Avg verify score:   ${avgScore}/100`);
  console.log(`  Pass rate:          ${passRate}%`);
  console.log(`  Criteria met:       ${metCriteria}/${totalCriteria} (${criteriaRate}%)`);
  console.log(`  Planning score:     ${run.reflection?.process_evaluation?.planning_score ?? "N/A"}/100`);
  console.log(`  Strategy score:     ${run.reflection?.strategy_assessment?.effectiveness_score ?? "N/A"}/100`);
  console.log(`  Tokens used:        ${run.runComplete.total_tokens}`);
  console.log(`  Duration:           ${run.totalDurationMs}ms`);
  console.log(`  Events emitted:     ${run.events.length}`);
  console.log(`  Thinking steps:     ${run.thoughts.length}`);
  console.log(`  Rules evolved:      ${run.rulesGenerated.length}`);
  console.log(`  Errors:             ${run.errors.length}`);
  if (run.errors.length > 0) {
    run.errors.forEach(e => console.log(`    ⚠️ ${e}`));
  }
  console.log(`${"═".repeat(60)}`);

  // Final quality gates
  assert(avgScore >= 30, `Avg score too low: ${avgScore}`);
  assert(passRate >= 50, `Pass rate too low: ${passRate}%`);

  // ════════════════════════════════════════════════════════
  // FINAL TASK OUTPUTS
  // ════════════════════════════════════════════════════════
  console.log(`\n${"═".repeat(60)}`);
  console.log("  📝 FINAL TASK OUTPUTS");
  console.log(`${"═".repeat(60)}`);
  for (let i = 0; i < run.taskOutputs.length; i++) {
    console.log(`\n--- Task ${i + 1} ---`);
    console.log(run.taskOutputs[i]);
  }
  console.log(`\n${"═".repeat(60)}`);
  console.log("  ✅ ALL ASSERTIONS PASSED");
  console.log(`${"═".repeat(60)}`);
});
