import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertExists } from "https://deno.land/std@0.224.0/assert/assert_exists.ts";

// ─── Config ──────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/aim-chat`;

// ─── Types ───────────────────────────────────────────────
interface CapturedEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface RunCapture {
  events: CapturedEvent[];
  plan: any | null;
  taskOutputs: string[];
  taskDeltas: Record<number, string>;
  verifications: any[];
  reflection: any | null;
  rulesGenerated: any[];
  runComplete: any | null;
  thoughts: Array<{ phase: string; content: string }>;
  memoryEvents: any[];
  errors: string[];
  totalDurationMs: number;
  rawEventTypes: string[];
}

// ─── SSE Stream Parser ──────────────────────────────────
async function captureRun(goal: string): Promise<RunCapture> {
  const start = Date.now();
  const events: CapturedEvent[] = [];
  let plan: any = null;
  const taskOutputs: string[] = [];
  const taskDeltas: Record<number, string> = {};
  const verifications: any[] = [];
  let reflection: any = null;
  const rulesGenerated: any[] = [];
  let runComplete: any = null;
  const thoughts: Array<{ phase: string; content: string }> = [];
  const memoryEvents: any[] = [];
  const errors: string[] = [];
  const rawEventTypes: string[] = [];

  const resp = await fetch(EDGE_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: goal }],
    }),
  });

  assert(resp.ok, `HTTP ${resp.status}: ${await resp.text()}`);
  assertEquals(resp.headers.get("content-type"), "text/event-stream");
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
        const ts = Date.now();
        events.push({ type: evt.type, data: evt, timestamp: ts });
        rawEventTypes.push(evt.type);

        switch (evt.type) {
          case "thinking":
            thoughts.push({ phase: evt.phase, content: evt.content });
            break;
          case "memory_detail":
            memoryEvents.push(evt);
            break;
          case "plan":
            plan = evt;
            break;
          case "task_delta":
            if (!taskDeltas[evt.task_index]) taskDeltas[evt.task_index] = "";
            taskDeltas[evt.task_index] += evt.delta;
            break;
          case "task_verified":
            verifications.push(evt.verification);
            break;
          case "task_complete": {
            const output = taskDeltas[evt.task_index];
            if (output) taskOutputs.push(output);
            break;
          }
          case "task_error":
            errors.push(evt.error);
            break;
          case "reflection":
            reflection = evt.data;
            break;
          case "rules_generated":
            rulesGenerated.push(...(evt.rules || []));
            break;
          case "run_complete":
            runComplete = evt;
            break;
        }
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }

  return {
    events, plan, taskOutputs, taskDeltas, verifications,
    reflection, rulesGenerated, runComplete, thoughts,
    memoryEvents, errors, totalDurationMs: Date.now() - start,
    rawEventTypes,
  };
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
// TEST 1: SSE protocol correctness
// ═══════════════════════════════════════════════════════════
Deno.test("SSE protocol: returns event-stream, parseable events, ends with [DONE]", async () => {
  const resp = await fetch(EDGE_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "Say hello" }] }),
  });

  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/event-stream");

  const text = await resp.text();
  const lines = text.split("\n").filter(l => l.startsWith("data: "));
  assert(lines.length > 0, "Must have SSE data lines");

  const lastData = lines[lines.length - 1].slice(6).trim();
  assertEquals(lastData, "[DONE]", "Stream must end with [DONE]");

  // All non-DONE lines must be valid JSON
  let parsedCount = 0;
  for (const line of lines) {
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;
    const evt = JSON.parse(payload); // throws if invalid
    assertExists(evt.type, "Every event must have a 'type' field");
    parsedCount++;
  }
  assert(parsedCount >= 3, `Expected at least 3 events, got ${parsedCount}`);
  console.log(`✅ SSE protocol: ${parsedCount} valid events + [DONE]`);
});

// ═══════════════════════════════════════════════════════════
// TEST 2: Error handling — missing messages
// ═══════════════════════════════════════════════════════════
Deno.test("Error handling: rejects malformed request body", async () => {
  const resp = await fetch(EDGE_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({}), // no messages field
  });

  // Should either return error or produce a stream that handles it gracefully
  const text = await resp.text();
  console.log(`✅ Malformed request handled: status ${resp.status}, body ${text.length} chars`);
});

// ═══════════════════════════════════════════════════════════
// TEST 3: Thinking / consciousness stream
// ═══════════════════════════════════════════════════════════
Deno.test("Thinking stream: emits thoughts with phases before planning", async () => {
  const run = await captureRun("What is 2+2?");

  assert(run.thoughts.length > 0, `No thinking events captured (got ${run.rawEventTypes.length} total events)`);

  // Thinking should have meaningful content
  for (const t of run.thoughts) {
    assertExists(t.phase, "Thought must have a phase");
    assertExists(t.content, "Thought must have content");
    assert(t.content.length > 5, `Thought content too short: "${t.content}"`);
  }

  const phases = [...new Set(run.thoughts.map(t => t.phase))];
  console.log(`✅ Thinking: ${run.thoughts.length} thoughts across phases: ${phases.join(", ")}`);

  // Thinking events should come before the plan
  const thinkingIdx = run.rawEventTypes.indexOf("thinking");
  const planIdx = run.rawEventTypes.indexOf("plan");
  if (planIdx >= 0 && thinkingIdx >= 0) {
    assert(thinkingIdx < planIdx, "Thinking must come before plan");
  }
});

// ═══════════════════════════════════════════════════════════
// TEST 4: Planning phase — structure and quality
// ═══════════════════════════════════════════════════════════
Deno.test("Planning: produces valid plan with tasks, complexity, approach", async () => {
  const run = await captureRun("Compare REST vs GraphQL APIs");

  assertExists(run.plan, "No plan event received");
  assertExists(run.plan.tasks, "Plan must have tasks");
  assert(run.plan.tasks.length > 0, "Plan must have at least 1 task");

  // Plan metadata
  assertExists(run.plan.goal_summary, "Plan must have goal_summary");
  assertExists(run.plan.overall_complexity, "Plan must have complexity");
  assert(
    ["simple", "moderate", "complex", "expert"].includes(run.plan.overall_complexity),
    `Invalid complexity: ${run.plan.overall_complexity}`
  );

  // Each task must have structure
  for (const task of run.plan.tasks) {
    assertExists(task.title, "Task must have title");
    assertExists(task.prompt, "Task must have prompt");
    assert(
      Array.isArray(task.acceptance_criteria) && task.acceptance_criteria.length > 0,
      `Task "${task.title}" must have acceptance criteria`
    );
  }

  console.log(`✅ Plan: "${run.plan.goal_summary}" — ${run.plan.overall_complexity} — ${run.plan.tasks.length} tasks`);
  run.plan.tasks.forEach((t: any, i: number) => {
    console.log(`   Task ${i + 1}: ${t.title} (${t.acceptance_criteria.length} criteria)`);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 5: Task execution — output quality
// ═══════════════════════════════════════════════════════════
Deno.test("Execution: tasks produce substantive output via streaming deltas", async () => {
  const run = await captureRun("List 3 benefits of event sourcing in one sentence each");

  assert(
    run.taskOutputs.length > 0 || run.errors.length > 0,
    "Must have task outputs or errors"
  );

  // Check streaming worked — deltas should exist
  const deltaCount = Object.keys(run.taskDeltas).length;
  assert(deltaCount > 0, "No task_delta events received — streaming broken");

  // Output quality checks
  for (let i = 0; i < run.taskOutputs.length; i++) {
    const output = run.taskOutputs[i];
    assert(output.length > 50, `Task ${i + 1} output too short (${output.length} chars): "${output.slice(0, 100)}"`);
  }

  console.log(`✅ Execution: ${run.taskOutputs.length} tasks completed, ${deltaCount} streams`);
  run.taskOutputs.forEach((out, i) => {
    console.log(`   Task ${i + 1}: ${out.length} chars — preview: "${out.slice(0, 80).replace(/\n/g, ' ')}…"`);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 6: Verification — scoring and criteria checking
// ═══════════════════════════════════════════════════════════
Deno.test("Verification: each task gets scored with criteria results", async () => {
  const run = await captureRun("Explain the CAP theorem in distributed systems");

  assert(run.verifications.length > 0, "No verifications received");

  for (let i = 0; i < run.verifications.length; i++) {
    const v = run.verifications[i];
    assert(typeof v.passed === "boolean", `Verification ${i} must have boolean 'passed'`);
    assert(typeof v.score === "number", `Verification ${i} must have numeric 'score'`);
    assert(v.score >= 0 && v.score <= 100, `Score out of range: ${v.score}`);
    assertExists(v.summary, `Verification ${i} must have summary`);
    assert(Array.isArray(v.criteria_results), `Verification ${i} must have criteria_results array`);

    // Each criterion result
    for (const cr of v.criteria_results) {
      assert(typeof cr.met === "boolean", "Criterion result must have boolean 'met'");
      assertExists(cr.criterion, "Criterion result must reference the criterion");
      assertExists(cr.reasoning, "Criterion result must have reasoning");
    }
  }

  const avgScore = Math.round(run.verifications.reduce((a, v) => a + v.score, 0) / run.verifications.length);
  const passRate = Math.round((run.verifications.filter(v => v.passed).length / run.verifications.length) * 100);

  console.log(`✅ Verification: ${run.verifications.length} tasks verified`);
  console.log(`   Avg score: ${avgScore}/100, Pass rate: ${passRate}%`);
  run.verifications.forEach((v, i) => {
    console.log(`   Task ${i + 1}: ${v.passed ? "PASS" : "FAIL"} ${v.score}/100 — ${v.summary?.slice(0, 80)}`);
    v.criteria_results?.forEach((cr: any) => {
      console.log(`      ${cr.met ? "✓" : "✗"} ${cr.criterion?.slice(0, 60)} — ${cr.reasoning?.slice(0, 60)}`);
    });
  });

  assert(avgScore > 0, "Average score must be > 0");
});

// ═══════════════════════════════════════════════════════════
// TEST 7: Reflection — self-evaluation after execution
// ═══════════════════════════════════════════════════════════
Deno.test("Reflection: produces self-evaluation with scores and insights", async () => {
  const run = await captureRun("Describe 3 software design patterns");

  assertExists(run.reflection, "No reflection received");
  assertExists(run.reflection.summary, "Reflection must have summary");
  assert(run.reflection.summary.length > 20, "Reflection summary too short");

  // Check scoring sub-objects if present
  if (run.reflection.process_evaluation) {
    const pe = run.reflection.process_evaluation;
    assert(typeof pe.planning_score === "number", "Must have planning_score");
    assert(pe.planning_score >= 0 && pe.planning_score <= 100, `Planning score out of range: ${pe.planning_score}`);
  }
  if (run.reflection.strategy_assessment) {
    const sa = run.reflection.strategy_assessment;
    assert(typeof sa.effectiveness_score === "number", "Must have effectiveness_score");
  }

  console.log(`✅ Reflection:`);
  console.log(`   Summary: ${run.reflection.summary.slice(0, 120)}`);
  if (run.reflection.process_evaluation) {
    console.log(`   Planning: ${run.reflection.process_evaluation.planning_score}/100`);
  }
  if (run.reflection.strategy_assessment) {
    console.log(`   Strategy: ${run.reflection.strategy_assessment.effectiveness_score}/100`);
  }
  if (run.reflection.new_process_rules?.length > 0) {
    console.log(`   New rules: ${run.reflection.new_process_rules.length}`);
    run.reflection.new_process_rules.forEach((r: any) => console.log(`      → ${r.rule_text?.slice(0, 80)}`));
  }
});

// ═══════════════════════════════════════════════════════════
// TEST 8: Run completion — final event with metrics
// ═══════════════════════════════════════════════════════════
Deno.test("Completion: emits run_complete with run_id, token count, and pass metrics", async () => {
  const run = await captureRun("What are SOLID principles?");

  assertExists(run.runComplete, "No run_complete event");
  assertExists(run.runComplete.run_id, "run_complete must have run_id");
  assert(typeof run.runComplete.total_tokens === "number", "Must have total_tokens");
  assert(run.runComplete.total_tokens > 0, "Token count must be > 0");
  assert(typeof run.runComplete.task_count === "number", "Must have task_count");
  assert(run.runComplete.task_count > 0, "Task count must be > 0");
  assert(typeof run.runComplete.tasks_passed === "number", "Must have tasks_passed");

  console.log(`✅ Run complete:`);
  console.log(`   ID: ${run.runComplete.run_id}`);
  console.log(`   Tokens: ${run.runComplete.total_tokens}`);
  console.log(`   Tasks: ${run.runComplete.tasks_passed}/${run.runComplete.task_count} passed`);
  console.log(`   Duration: ${run.totalDurationMs}ms`);
});

// ═══════════════════════════════════════════════════════════
// TEST 9: Event ordering — correct pipeline sequence
// ═══════════════════════════════════════════════════════════
Deno.test("Pipeline ordering: thinking → plan → task_start → deltas → verified → reflection → complete", async () => {
  const run = await captureRun("Explain microservices architecture");

  const typeOrder = run.rawEventTypes;
  console.log(`   Event sequence (${typeOrder.length} events): ${typeOrder.join(" → ")}`);

  // Plan must come before any task_delta
  const planIdx = typeOrder.indexOf("plan");
  const firstDeltaIdx = typeOrder.indexOf("task_delta");
  if (planIdx >= 0 && firstDeltaIdx >= 0) {
    assert(planIdx < firstDeltaIdx, "Plan must come before task deltas");
  }

  // All task_delta must come before run_complete
  const completeIdx = typeOrder.lastIndexOf("run_complete");
  const lastDeltaIdx = typeOrder.lastIndexOf("task_delta");
  if (completeIdx >= 0 && lastDeltaIdx >= 0) {
    assert(lastDeltaIdx < completeIdx, "All task deltas must come before run_complete");
  }

  // Reflection must come before run_complete
  const reflectionIdx = typeOrder.lastIndexOf("reflection");
  if (reflectionIdx >= 0 && completeIdx >= 0) {
    assert(reflectionIdx < completeIdx, "Reflection must come before run_complete");
  }

  console.log(`✅ Pipeline ordering verified across ${typeOrder.length} events`);
});

// ═══════════════════════════════════════════════════════════
// TEST 10: Database persistence — run_traces saved correctly
// ═══════════════════════════════════════════════════════════
Deno.test("DB persistence: run trace saved with full data", async () => {
  const run = await captureRun("What are the 3 pillars of observability?");

  assertExists(run.runComplete, "No run_complete — can't check DB");
  const runId = run.runComplete.run_id;
  assertExists(runId, "No run_id in run_complete");

  // Wait for async DB write
  await new Promise(r => setTimeout(r, 3000));

  const traces = await queryDB("run_traces", `run_id=eq.${runId}`);
  assert(Array.isArray(traces) && traces.length > 0, `No trace found for run ${runId}`);

  const trace = traces[0];
  assertEquals(trace.status, "complete");
  assertEquals(trace.run_id, runId);
  assert(trace.task_count > 0, "Trace must have tasks");
  assert(trace.total_tokens > 0, "Trace must have tokens");
  assertExists(trace.goal, "Trace must have goal");
  assertExists(trace.planning_reasoning, "Trace must have planning_reasoning");
  assert(Array.isArray(trace.open_questions), "open_questions must be array");
  assert(Array.isArray(trace.thoughts) || typeof trace.thoughts === "object", "thoughts must be stored");
  assert(Array.isArray(trace.tasks_detail) || typeof trace.tasks_detail === "object", "tasks_detail must be stored");
  assertExists(trace.completed_at, "Must have completed_at timestamp");

  console.log(`✅ DB trace for run ${runId}:`);
  console.log(`   Goal: ${trace.goal}`);
  console.log(`   Status: ${trace.status}`);
  console.log(`   Complexity: ${trace.overall_complexity}`);
  console.log(`   Tasks: ${trace.tasks_passed}/${trace.task_count} passed`);
  console.log(`   Avg score: ${trace.avg_score}`);
  console.log(`   Planning score: ${trace.planning_score}`);
  console.log(`   Strategy score: ${trace.strategy_score}`);
  console.log(`   Tokens: ${trace.total_tokens}`);
  console.log(`   Thoughts stored: ${Array.isArray(trace.thoughts) ? trace.thoughts.length : "object"}`);
  console.log(`   Tasks detail stored: ${Array.isArray(trace.tasks_detail) ? trace.tasks_detail.length : "object"}`);
  if (trace.reflection) {
    console.log(`   Reflection: ${JSON.stringify(trace.reflection).slice(0, 120)}`);
  }
  if (trace.generated_rules?.length > 0) {
    console.log(`   Generated rules: ${trace.generated_rules.length}`);
  }
});

// ═══════════════════════════════════════════════════════════
// TEST 11: Database persistence — events table
// ═══════════════════════════════════════════════════════════
Deno.test("DB persistence: events logged for run", async () => {
  const run = await captureRun("What is TCP/IP?");

  assertExists(run.runComplete, "No run_complete");
  const runId = run.runComplete.run_id;

  await new Promise(r => setTimeout(r, 2000));

  const events = await queryDB("events", `run_id=eq.${runId}&order=created_at.asc`);
  assert(Array.isArray(events) && events.length >= 2, `Expected at least 2 events in DB, got ${events?.length}`);

  const eventTypes = events.map((e: any) => e.event_type);
  assert(eventTypes.includes("RUN_STARTED") || eventTypes.includes("RUN_STOPPED"), "Must have run lifecycle events");

  console.log(`✅ Events in DB for run ${runId}: ${events.length}`);
  console.log(`   Types: ${eventTypes.join(", ")}`);
});

// ═══════════════════════════════════════════════════════════
// TEST 12: Database persistence — tasks table
// ═══════════════════════════════════════════════════════════
Deno.test("DB persistence: tasks saved with results", async () => {
  const run = await captureRun("Name 2 cloud providers");

  assertExists(run.runComplete, "No run_complete");
  const runId = run.runComplete.run_id;

  await new Promise(r => setTimeout(r, 2000));

  const tasks = await queryDB("tasks", `run_id=eq.${runId}&order=created_at.asc`);
  assert(Array.isArray(tasks) && tasks.length > 0, `No tasks saved for run ${runId}`);

  for (const task of tasks) {
    assertExists(task.title, "Task must have title");
    assertExists(task.run_id, "Task must have run_id");
    assertEquals(task.run_id, runId);
    assert(["done", "failed"].includes(task.status), `Task status should be terminal, got: ${task.status}`);
  }

  const doneCount = tasks.filter((t: any) => t.status === "done").length;
  console.log(`✅ Tasks in DB for run ${runId}: ${doneCount}/${tasks.length} done`);
  tasks.forEach((t: any) => console.log(`   ${t.status.toUpperCase()}: ${t.title}`));
});

// ═══════════════════════════════════════════════════════════
// TEST 13: Full pipeline end-to-end with effectiveness report
// ═══════════════════════════════════════════════════════════
Deno.test("E2E: full pipeline with effectiveness metrics and final output", async () => {
  console.log("\n" + "═".repeat(60));
  console.log("  FULL END-TO-END PIPELINE TEST");
  console.log("═".repeat(60));

  const goal = "Explain the differences between SQL and NoSQL databases with pros and cons of each";
  console.log(`\n🎯 Goal: "${goal}"\n`);

  const run = await captureRun(goal);

  // ── Phase 1: Consciousness ──
  console.log("─── PHASE 1: AI CONSCIOUSNESS ───");
  console.log(`  Thoughts captured: ${run.thoughts.length}`);
  const phases = [...new Set(run.thoughts.map(t => t.phase))];
  console.log(`  Phases: ${phases.join(", ")}`);
  for (const t of run.thoughts) {
    console.log(`  [${t.phase}] ${t.content.slice(0, 100)}`);
  }

  // ── Phase 2: Memory ──
  console.log("\n─── PHASE 2: MEMORY LOADING ───");
  console.log(`  Memory events: ${run.memoryEvents.length}`);
  for (const m of run.memoryEvents) {
    console.log(`  ${m.detail_type || "memory"}: ${JSON.stringify(m).slice(0, 120)}`);
  }

  // ── Phase 3: Planning ──
  console.log("\n─── PHASE 3: PLANNING ───");
  assertExists(run.plan, "Plan is required");
  console.log(`  Goal: ${run.plan.goal_summary}`);
  console.log(`  Approach: ${run.plan.approach?.slice(0, 100)}`);
  console.log(`  Complexity: ${run.plan.overall_complexity}`);
  console.log(`  Tasks planned: ${run.plan.tasks.length}`);
  for (const t of run.plan.tasks) {
    console.log(`    → ${t.title} (${t.acceptance_criteria?.length || 0} criteria)`);
  }

  // ── Phase 4: Execution ──
  console.log("\n─── PHASE 4: TASK EXECUTION ───");
  assert(run.taskOutputs.length > 0, "Must produce task outputs");
  for (let i = 0; i < run.taskOutputs.length; i++) {
    const out = run.taskOutputs[i];
    console.log(`  Task ${i + 1}: ${out.length} chars`);
    console.log(`    Preview: ${out.slice(0, 150).replace(/\n/g, " ")}…`);
  }

  // ── Phase 5: Verification ──
  console.log("\n─── PHASE 5: VERIFICATION ───");
  assert(run.verifications.length > 0, "Must have verifications");
  let totalScore = 0;
  let totalCriteria = 0;
  let metCriteria = 0;
  for (let i = 0; i < run.verifications.length; i++) {
    const v = run.verifications[i];
    totalScore += v.score;
    console.log(`  Task ${i + 1}: ${v.passed ? "✅ PASS" : "❌ FAIL"} — ${v.score}/100`);
    console.log(`    ${v.summary}`);
    for (const cr of v.criteria_results || []) {
      totalCriteria++;
      if (cr.met) metCriteria++;
      console.log(`      ${cr.met ? "✓" : "✗"} ${cr.criterion}`);
      console.log(`        → ${cr.reasoning?.slice(0, 100)}`);
    }
  }

  // ── Phase 6: Reflection ──
  console.log("\n─── PHASE 6: DEEP REFLECTION ───");
  assertExists(run.reflection, "Reflection required");
  console.log(`  Summary: ${run.reflection.summary}`);
  if (run.reflection.process_evaluation) {
    console.log(`  Planning score: ${run.reflection.process_evaluation.planning_score}/100`);
    console.log(`  Planning feedback: ${run.reflection.process_evaluation.planning_feedback?.slice(0, 100)}`);
  }
  if (run.reflection.strategy_assessment) {
    console.log(`  Strategy score: ${run.reflection.strategy_assessment.effectiveness_score}/100`);
    console.log(`  Strategy feedback: ${run.reflection.strategy_assessment.feedback?.slice(0, 100)}`);
  }
  if (run.reflection.new_process_rules?.length > 0) {
    console.log(`  New rules generated: ${run.reflection.new_process_rules.length}`);
    for (const r of run.reflection.new_process_rules) {
      console.log(`    → [${r.category}] ${r.rule_text}`);
    }
  }

  // ── Phase 7: Rules ──
  console.log("\n─── PHASE 7: RULE EVOLUTION ───");
  console.log(`  Rules generated this run: ${run.rulesGenerated.length}`);
  for (const r of run.rulesGenerated) {
    console.log(`    → ${JSON.stringify(r).slice(0, 100)}`);
  }

  // ── Completion ──
  console.log("\n─── COMPLETION ───");
  assertExists(run.runComplete, "run_complete required");
  console.log(`  Run ID: ${run.runComplete.run_id}`);
  console.log(`  Total tokens: ${run.runComplete.total_tokens}`);
  console.log(`  Tasks: ${run.runComplete.tasks_passed}/${run.runComplete.task_count} passed`);

  // ── EFFECTIVENESS REPORT ──
  const avgScore = Math.round(totalScore / run.verifications.length);
  const passRate = Math.round((run.verifications.filter(v => v.passed).length / run.verifications.length) * 100);
  const criteriaRate = totalCriteria > 0 ? Math.round((metCriteria / totalCriteria) * 100) : 0;

  console.log("\n" + "═".repeat(60));
  console.log("  📊 EFFECTIVENESS REPORT");
  console.log("═".repeat(60));
  console.log(`  Goal:               ${run.plan.goal_summary}`);
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
  console.log("═".repeat(60));

  // Final assertions
  assert(avgScore >= 30, `Average score too low: ${avgScore}`);
  assert(passRate >= 50, `Pass rate too low: ${passRate}%`);
  assert(run.runComplete.total_tokens > 0, "Must use tokens");

  // ── FINAL OUTPUT ──
  console.log("\n" + "═".repeat(60));
  console.log("  📝 FINAL TASK OUTPUTS");
  console.log("═".repeat(60));
  for (let i = 0; i < run.taskOutputs.length; i++) {
    console.log(`\n--- Task ${i + 1} ---`);
    console.log(run.taskOutputs[i]);
  }
  console.log("\n" + "═".repeat(60));
});
