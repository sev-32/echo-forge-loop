import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

interface CapturedEvent {
  type: string;
  data: any;
  timestamp: number;
}

async function runGoalAndCapture(goal: string): Promise<{
  events: CapturedEvent[];
  plan: any | null;
  taskOutputs: string[];
  verifications: any[];
  reflection: any | null;
  rulesGenerated: any[];
  runComplete: any | null;
  thoughts: Array<{ phase: string; content: string }>;
  errors: string[];
  totalDurationMs: number;
}> {
  const start = Date.now();
  const events: CapturedEvent[] = [];
  let plan: any = null;
  const taskOutputs: string[] = [];
  const verifications: any[] = [];
  let reflection: any = null;
  const rulesGenerated: any[] = [];
  let runComplete: any = null;
  const thoughts: Array<{ phase: string; content: string }> = [];
  const errors: string[] = [];

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/aim-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: goal }],
    }),
  });

  assert(resp.ok, `Response not OK: ${resp.status}`);
  assert(resp.body, "No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const currentTaskOutput: Record<number, string> = {};

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
        events.push({ type: evt.type, data: evt, timestamp: Date.now() });

        switch (evt.type) {
          case "thinking":
            thoughts.push({ phase: evt.phase, content: evt.content });
            break;
          case "plan":
            plan = evt;
            break;
          case "task_delta":
            if (!currentTaskOutput[evt.task_index]) currentTaskOutput[evt.task_index] = "";
            currentTaskOutput[evt.task_index] += evt.delta;
            break;
          case "task_verified":
            verifications.push(evt.verification);
            break;
          case "task_complete":
            if (currentTaskOutput[evt.task_index]) {
              taskOutputs.push(currentTaskOutput[evt.task_index]);
            }
            break;
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
        // partial JSON, put back
        buf = line + "\n" + buf;
        break;
      }
    }
  }

  return {
    events,
    plan,
    taskOutputs,
    verifications,
    reflection,
    rulesGenerated,
    runComplete,
    thoughts,
    errors,
    totalDurationMs: Date.now() - start,
  };
}

Deno.test("aim-chat: full pipeline produces plan, tasks, verification, reflection, and run_complete", async () => {
  const result = await runGoalAndCapture("List 3 benefits of event sourcing in one sentence each");

  // Must have a plan
  assert(result.plan, "No plan received");
  assert(result.plan.tasks?.length > 0, "Plan has no tasks");
  console.log(`\n📋 Plan: ${result.plan.goal} (${result.plan.overall_complexity})`);
  console.log(`   Tasks: ${result.plan.tasks.length}`);

  // Must have thoughts
  assert(result.thoughts.length > 0, "No thoughts captured");
  console.log(`🧠 Thoughts: ${result.thoughts.length}`);
  const phases = [...new Set(result.thoughts.map(t => t.phase))];
  console.log(`   Phases seen: ${phases.join(", ")}`);

  // Must have task outputs
  assert(result.taskOutputs.length > 0 || result.errors.length > 0, "No task outputs or errors");
  console.log(`📝 Task outputs: ${result.taskOutputs.length}`);
  result.taskOutputs.forEach((out, i) => {
    console.log(`   Task ${i + 1}: ${out.length} chars`);
  });

  // Must have verifications
  assert(result.verifications.length > 0, "No verifications");
  console.log(`🛡️ Verifications: ${result.verifications.length}`);
  result.verifications.forEach((v, i) => {
    console.log(`   Task ${i + 1}: ${v.passed ? "PASS" : "FAIL"} (${v.score}/100) — ${v.summary?.slice(0, 80)}`);
  });

  // Must have reflection
  assert(result.reflection, "No reflection received");
  console.log(`🔮 Reflection summary: ${result.reflection.summary?.slice(0, 120)}`);
  if (result.reflection.process_evaluation) {
    console.log(`   Planning score: ${result.reflection.process_evaluation.planning_score}/100`);
  }
  if (result.reflection.strategy_assessment) {
    console.log(`   Strategy score: ${result.reflection.strategy_assessment.effectiveness_score}/100`);
  }
  if (result.reflection.new_process_rules?.length > 0) {
    console.log(`   New rules: ${result.reflection.new_process_rules.length}`);
  }

  // Must complete
  assert(result.runComplete, "No run_complete event");
  console.log(`\n✅ Run complete: ${result.runComplete.total_tokens} tokens, ${result.totalDurationMs}ms`);
  console.log(`   Events captured: ${result.events.length}`);

  // Effectiveness metrics
  const avgScore = result.verifications.length > 0
    ? Math.round(result.verifications.reduce((a: number, v: any) => a + (v.score || 0), 0) / result.verifications.length)
    : 0;
  const passRate = result.verifications.length > 0
    ? Math.round((result.verifications.filter((v: any) => v.passed).length / result.verifications.length) * 100)
    : 0;
  console.log(`\n📊 Effectiveness:`);
  console.log(`   Avg verification score: ${avgScore}/100`);
  console.log(`   Pass rate: ${passRate}%`);
  console.log(`   Errors: ${result.errors.length}`);

  assert(avgScore > 0, "Average score should be > 0");
});

Deno.test("aim-chat: run trace is saved to database", async () => {
  const result = await runGoalAndCapture("What are the 3 pillars of observability?");

  assert(result.runComplete, "No run_complete event");
  const runId = result.runComplete.run_id;
  assert(runId, "No run_id in run_complete");

  // Wait a moment for the trace to be saved
  await new Promise(r => setTimeout(r, 2000));

  // Query the run_traces table
  const traceResp = await fetch(`${SUPABASE_URL}/rest/v1/run_traces?run_id=eq.${runId}&select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const traces = await traceResp.json();

  assert(Array.isArray(traces) && traces.length > 0, `No trace found for run ${runId}`);
  const trace = traces[0];
  console.log(`\n💾 Saved trace for run ${runId}:`);
  console.log(`   Goal: ${trace.goal}`);
  console.log(`   Status: ${trace.status}`);
  console.log(`   Tasks: ${trace.task_count} (${trace.tasks_passed} passed)`);
  console.log(`   Avg score: ${trace.avg_score}`);
  console.log(`   Planning score: ${trace.planning_score}`);
  console.log(`   Strategy score: ${trace.strategy_score}`);
  console.log(`   Tokens: ${trace.total_tokens}`);
  assertEquals(trace.status, "complete");
  assert(trace.task_count > 0, "Trace should have tasks");
});
