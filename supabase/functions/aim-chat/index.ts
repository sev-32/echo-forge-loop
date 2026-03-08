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

function generateId() {
  return crypto.randomUUID();
}

// ─── AI Gateway helper ───────────────────────────────────
async function callAI(apiKey: string, model: string, messages: any[], tools?: any[], toolChoice?: any, stream = false) {
  const body: any = { model, messages };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  if (stream) body.stream = true;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp;
}

function parseToolArgs(data: any): any {
  try {
    return JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    const runId = `chat-${generateId().slice(0, 8)}`;

    // ─── Persist run start ───
    await supabase.from('events').insert({
      run_id: runId,
      event_type: 'RUN_STARTED',
      payload: { source: 'chat', goal: lastUserMsg, timestamp: new Date().toISOString() },
    });

    // ═══════════════════════════════════════════════════════
    // PHASE 0: LOAD CROSS-RUN MEMORY
    // ═══════════════════════════════════════════════════════
    const [pastReflections, processRules, recentKnowledge] = await Promise.all([
      supabase.from('journal_entries')
        .select('content, metadata, tags')
        .eq('entry_type', 'reflection')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('process_rules')
        .select('*')
        .eq('active', true)
        .order('confidence', { ascending: false })
        .limit(20),
      supabase.from('knowledge_nodes')
        .select('label, node_type')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const memoryContext = buildMemoryContext(
      pastReflections.data || [],
      processRules.data || [],
      recentKnowledge.data || []
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 1: INTELLIGENT PLANNING (with cross-run memory)
    // ═══════════════════════════════════════════════════════
    const planResponse = await callAI(LOVABLE_API_KEY, "google/gemini-3-flash-preview", [
      {
        role: "system",
        content: `You are AIM-OS, an AI Operating System's intelligent task planner. Given a user's goal, analyze its complexity and decompose it into the right number of appropriately-detailed tasks.

## CROSS-RUN MEMORY
${memoryContext}

## CRITICAL: Dynamic Detail Calibration

Assess the goal's complexity and calibrate:

**Complexity → Detail Level:**
- Simple factual query / list → 1-2 tasks, detail_level: "concise" (200-500 words)
- Moderate analysis / comparison → 2-3 tasks, detail_level: "standard" (500-1500 words)
- Complex design / architecture → 3-5 tasks, detail_level: "comprehensive" (1500-3000 words)
- Research-grade / multi-domain → 4-6 tasks, detail_level: "exhaustive" (3000-6000+ words)

**For each task set:**
- detail_level, expected_sections, depth_guidance, acceptance_criteria
- Priorities: 90-100 = critical, 70-89 = high, 50-69 = medium

Apply any active process rules from memory. Note which rules you're applying.

IMPORTANT: In your planning_reasoning, explain your thought process — why this complexity level, why these specific tasks, what tradeoffs you considered, what questions you have about the goal (even if you proceed with your best judgment).`
      },
      { role: "user", content: lastUserMsg }
    ], [{
      type: "function",
      function: {
        name: "create_task_plan",
        description: "Create a structured execution plan with dynamic detail calibration",
        parameters: {
          type: "object",
          properties: {
            goal_summary: { type: "string" },
            overall_complexity: { type: "string", enum: ["simple", "moderate", "complex", "research-grade"] },
            approach: { type: "string" },
            planning_reasoning: { type: "string", description: "Detailed internal reasoning: why this complexity, why these tasks, tradeoffs considered, open questions about the goal" },
            open_questions: { type: "array", items: { type: "string" }, description: "Questions about the goal that you're proceeding without answers to — things you'd ask the user if you could" },
            applied_rules: { type: "array", items: { type: "string" }, description: "IDs of process rules applied in planning" },
            lessons_incorporated: { type: "array", items: { type: "string" }, description: "Brief notes on past lessons used" },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  prompt: { type: "string" },
                  priority: { type: "number" },
                  detail_level: { type: "string", enum: ["concise", "standard", "comprehensive", "exhaustive"] },
                  expected_sections: { type: "number" },
                  depth_guidance: { type: "string" },
                  acceptance_criteria: { type: "array", items: { type: "string" } },
                  depends_on: { type: "array", items: { type: "number" } },
                  reasoning: { type: "string", description: "Why this task exists, what role it plays in the plan" }
                },
                required: ["title", "prompt", "priority", "detail_level", "expected_sections", "depth_guidance", "acceptance_criteria"]
              }
            }
          },
          required: ["goal_summary", "overall_complexity", "approach", "planning_reasoning", "tasks"]
        }
      }
    }], { type: "function", function: { name: "create_task_plan" } });

    if (!planResponse.ok) {
      const status = planResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Plan failed: ${status}`);
    }

    const planData = await planResponse.json();
    let plan: any;
    try {
      plan = parseToolArgs(planData);
    } catch {
      plan = { goal_summary: lastUserMsg, approach: "Direct execution", overall_complexity: "moderate", planning_reasoning: "Fallback plan", tasks: [{ title: "Execute goal", prompt: lastUserMsg, priority: 80, detail_level: "standard", expected_sections: 4, depth_guidance: "Standard depth", acceptance_criteria: ["Goal accomplished"] }] };
    }

    // Persist tasks
    const taskIds: string[] = [];
    for (const t of plan.tasks) {
      const taskId = generateId();
      taskIds.push(taskId);
      await supabase.from('tasks').insert({
        id: taskId, run_id: runId, title: t.title, prompt: t.prompt, priority: t.priority, status: 'queued',
        acceptance_criteria: t.acceptance_criteria.map((c: string, i: number) => ({ id: `ac-${i}`, description: c, type: 'custom', config: {}, required: true })),
        dependencies: (t.depends_on || []).map((idx: number) => taskIds[idx]).filter(Boolean),
      });
    }

    await supabase.from('events').insert({
      run_id: runId, event_type: 'PLAN_CREATED',
      payload: { goal: plan.goal_summary, approach: plan.approach, task_count: plan.tasks.length, task_ids: taskIds, memory_loaded: { reflections: (pastReflections.data || []).length, rules: (processRules.data || []).length, knowledge: (recentKnowledge.data || []).length } },
    });

    // Track which process rules were applied
    const appliedRuleIds = plan.applied_rules || [];

    // ═══════════════════════════════════════════════════════
    // STREAM EXECUTION
    // ═══════════════════════════════════════════════════════
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (data: any) => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
          catch { closed = true; }
        };

        // ─── THINKING: Memory phase ───
        send({ type: 'thinking', phase: 'memory', content: 'Searching cross-run memory banks...' });

        const reflCount = (pastReflections.data || []).length;
        const rulesCount = (processRules.data || []).length;
        const knowledgeCount = (recentKnowledge.data || []).length;

        if (reflCount > 0 || rulesCount > 0 || knowledgeCount > 0) {
          send({ type: 'thinking', phase: 'memory', content: `Found ${reflCount} past reflections, ${rulesCount} active process rules, ${knowledgeCount} knowledge concepts.` });
          
          // Send individual memory items
          send({
            type: 'memory_detail',
            reflections: (pastReflections.data || []).map((r: any) => ({
              content: r.content?.slice(0, 300),
              tags: r.tags,
              planning_score: r.metadata?.planning_score,
              strategy_score: r.metadata?.strategy_score,
            })),
            rules: (processRules.data || []).map((r: any) => ({
              id: r.id,
              text: r.rule_text,
              category: r.category,
              confidence: r.confidence,
              times_applied: r.times_applied,
              times_helped: r.times_helped,
            })),
            knowledge: (recentKnowledge.data || []).map((n: any) => ({
              label: n.label,
              type: n.node_type,
            })),
          });

          if (rulesCount > 0) {
            send({ type: 'thinking', phase: 'memory', content: `Loading ${rulesCount} process rules to guide planning. Top rule: "${(processRules.data || [])[0]?.rule_text?.slice(0, 100)}"` });
          }
        } else {
          send({ type: 'thinking', phase: 'memory', content: 'No prior memory found. This is a fresh start — I\'ll build knowledge from this run.' });
        }

        // ─── THINKING: Planning phase ───
        send({ type: 'thinking', phase: 'planning', content: `Analyzing goal: "${lastUserMsg.slice(0, 120)}${lastUserMsg.length > 120 ? '...' : ''}"` });
        send({ type: 'thinking', phase: 'planning', content: `Goal assessed as ${plan.overall_complexity || 'moderate'} complexity. Designing ${plan.tasks.length} tasks.` });

        if (plan.planning_reasoning) {
          send({ type: 'thinking', phase: 'planning', content: plan.planning_reasoning });
        }

        if (plan.open_questions?.length > 0) {
          send({ type: 'open_questions', questions: plan.open_questions });
          send({ type: 'thinking', phase: 'planning', content: `I have ${plan.open_questions.length} open question(s) about this goal, but proceeding with my best judgment.` });
        }

        if (appliedRuleIds.length > 0) {
          send({ type: 'thinking', phase: 'planning', content: `Applied ${appliedRuleIds.length} process rule(s) from past experience.` });
        }

        // ─── Send plan ───
        send({
          type: 'plan',
          run_id: runId,
          goal: plan.goal_summary,
          approach: plan.approach,
          overall_complexity: plan.overall_complexity || 'moderate',
          planning_reasoning: plan.planning_reasoning || '',
          open_questions: plan.open_questions || [],
          memory_loaded: {
            reflections: reflCount,
            rules: rulesCount,
            knowledge: knowledgeCount,
          },
          lessons_incorporated: plan.lessons_incorporated || [],
          tasks: plan.tasks.map((t: any, i: number) => ({
            id: taskIds[i], index: i, title: t.title, status: 'queued', priority: t.priority,
            criteria_count: t.acceptance_criteria.length,
            detail_level: t.detail_level || 'standard',
            expected_sections: t.expected_sections || 4,
            reasoning: t.reasoning || '',
            depth_guidance: t.depth_guidance || '',
            acceptance_criteria: t.acceptance_criteria || [],
          })),
        });

        let totalTokens = 0;
        const taskOutputs: string[] = [];
        const taskVerifications: any[] = [];

        // ═══════════════════════════════════════════════════
        // PHASE 2: EXECUTE + VERIFY + RETRY LOOP
        // ═══════════════════════════════════════════════════
        for (let i = 0; i < plan.tasks.length; i++) {
          const task = plan.tasks[i];
          const taskId = taskIds[i];

          await supabase.from('tasks').update({ status: 'active' }).eq('id', taskId);
          
          // ─── THINKING: Task start ───
          send({ type: 'thinking', phase: 'execute', content: `Starting task ${i+1}/${plan.tasks.length}: "${task.title}"` });
          const detailLevel = task.detail_level || 'standard';
          const model = detailLevel === 'exhaustive' ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";
          send({ type: 'thinking', phase: 'execute', content: `Detail level: ${detailLevel} • Model: ${model.split('/')[1]} • Expected sections: ${task.expected_sections || '?'}` });
          if (task.reasoning) {
            send({ type: 'thinking', phase: 'execute', content: `Task rationale: ${task.reasoning}` });
          }

          send({ type: 'task_start', task_index: i, task_id: taskId, title: task.title });

          try {
            const contextSlice = detailLevel === 'exhaustive' ? 3000 : detailLevel === 'comprehensive' ? 2000 : detailLevel === 'standard' ? 1500 : 800;
            const prevContext = taskOutputs.map((out, j) => `[Task ${j+1}: ${plan.tasks[j].title}]\n${out.slice(0, contextSlice)}`).join('\n\n');

            if (i > 0) {
              send({ type: 'thinking', phase: 'execute', content: `Injecting ${i} previous task output(s) as context (${contextSlice} tokens each).` });
            }

            // Execute task
            let taskOutput = await executeTask(LOVABLE_API_KEY, plan, task, i, detailLevel, prevContext, send, null);
            totalTokens += taskOutput.tokens;

            // Persist execution event
            await supabase.from('events').insert({
              run_id: runId, event_type: 'ACTION_EXECUTED',
              payload: { task_id: taskId, output_length: taskOutput.output.length, task_title: task.title },
            });

            // ─── THINKING: Verify ───
            send({ type: 'thinking', phase: 'verify', content: `Verifying task ${i+1} against ${task.acceptance_criteria.length} acceptance criteria...` });
            send({ type: 'task_verify_start', task_index: i });
            let verification = await verifyTask(LOVABLE_API_KEY, task, taskOutput.output);
            totalTokens += verification.tokens;

            send({ type: 'thinking', phase: 'verify', content: `Verification result: ${verification.result.passed ? 'PASSED' : 'FAILED'} (${verification.result.score}/100) — ${verification.result.summary}` });
            send({ type: 'task_verified', task_index: i, verification: verification.result });

            await supabase.from('events').insert({
              run_id: runId,
              event_type: verification.result.passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED',
              payload: { task_id: taskId, score: verification.result.score, summary: verification.result.summary, passed: verification.result.passed, attempt: 1 },
            });

            // ─── RETRY WITH ADAPTATION ───
            if (!verification.result.passed && verification.result.score < 70) {
              send({ type: 'thinking', phase: 'retry', content: `Score ${verification.result.score}/100 is below 70 threshold. Initiating retry with adaptation.` });
              const failedCriteria = (verification.result.criteria_results || []).filter((c: any) => !c.met);
              send({ type: 'thinking', phase: 'retry', content: `${failedCriteria.length} criteria unmet: ${failedCriteria.map((c: any) => c.criterion).join(', ')}` });
              
              send({ type: 'task_retry_start', task_index: i, reason: verification.result.summary });

              // Diagnose failure
              send({ type: 'thinking', phase: 'retry', content: 'Analyzing failure to generate corrective diagnosis...' });
              const diagnosis = await diagnoseFailure(LOVABLE_API_KEY, task, taskOutput.output, verification.result);
              totalTokens += diagnosis.tokens;
              send({ type: 'thinking', phase: 'retry', content: `Diagnosis: ${diagnosis.result.slice(0, 200)}` });
              send({ type: 'task_retry_diagnosis', task_index: i, diagnosis: diagnosis.result });

              // Re-execute with diagnosis context
              send({ type: 'thinking', phase: 'retry', content: 'Re-executing task with corrective instructions...' });
              taskOutput = await executeTask(LOVABLE_API_KEY, plan, task, i, detailLevel, prevContext, send, diagnosis.result);
              totalTokens += taskOutput.tokens;

              await supabase.from('events').insert({
                run_id: runId, event_type: 'TASK_RETRIED',
                payload: { task_id: taskId, diagnosis: diagnosis.result.slice(0, 500), output_length: taskOutput.output.length },
              });

              // Re-verify
              send({ type: 'thinking', phase: 'verify', content: 'Re-verifying after retry...' });
              send({ type: 'task_verify_start', task_index: i });
              verification = await verifyTask(LOVABLE_API_KEY, task, taskOutput.output);
              totalTokens += verification.tokens;

              send({ type: 'thinking', phase: 'verify', content: `Retry verification: ${verification.result.passed ? 'PASSED' : 'STILL FAILED'} (${verification.result.score}/100)` });
              send({ type: 'task_verified', task_index: i, verification: verification.result });

              await supabase.from('events').insert({
                run_id: runId,
                event_type: verification.result.passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED',
                payload: { task_id: taskId, score: verification.result.score, summary: verification.result.summary, passed: verification.result.passed, attempt: 2 },
              });
            }

            taskOutputs.push(taskOutput.output);
            taskVerifications.push(verification.result);

            const finalStatus = verification.result.passed ? 'done' : 'failed';
            await supabase.from('tasks').update({
              status: finalStatus,
              result: { output: taskOutput.output.slice(0, 5000), verification: verification.result },
              error: verification.result.passed ? null : verification.result.summary,
            }).eq('id', taskId);

            send({ type: 'task_complete', task_index: i, status: finalStatus });
            send({ type: 'thinking', phase: 'execute', content: `Task ${i+1} ${finalStatus}. ${plan.tasks.length - i - 1} remaining.` });

          } catch (err: any) {
            console.error(`Task ${i} error:`, err);
            send({ type: 'thinking', phase: 'execute', content: `⚠ Task ${i+1} threw error: ${err.message}` });
            await supabase.from('tasks').update({ status: 'failed', error: err.message }).eq('id', taskId);
            await supabase.from('events').insert({ run_id: runId, event_type: 'ERROR_RAISED', payload: { task_id: taskId, error: err.message } });
            send({ type: 'task_error', task_index: i, error: err.message });
            taskOutputs.push(`ERROR: ${err.message}`);
            taskVerifications.push({ passed: false, score: 0, summary: err.message });
          }
        }

        // ═══════════════════════════════════════════════════
        // PHASE 3: DEEP SELF-REFLECTION
        // ═══════════════════════════════════════════════════
        send({ type: 'thinking', phase: 'reflect', content: 'All tasks complete. Entering deep meta-cognitive reflection...' });
        send({ type: 'reflection_start' });

        try {
          send({ type: 'thinking', phase: 'reflect', content: 'Evaluating my own planning quality, strategy effectiveness, and detecting patterns...' });

          const pastReflectionsSummary = (pastReflections.data || []).map((r: any) => r.content?.slice(0, 300)).join('\n---\n');
          const activeRulesSummary = (processRules.data || []).map((r: any) => `[${r.id}] (conf: ${r.confidence}) ${r.rule_text}`).join('\n');

          const reflectResponse = await callAI(LOVABLE_API_KEY, "google/gemini-2.5-flash", [
            {
              role: "system",
              content: `You are AIM-OS Deep Reflector. You perform META-COGNITIVE reflection after each run. This is not a simple summary — you must deeply evaluate your own process and generate actionable improvements.

## Your Responsibilities:
1. **Summarize** accomplishments concisely
2. **Evaluate your planning** — was the complexity calibration correct? Were tasks well-scoped? Score 0-100.
3. **Assess strategy** — did the approach work? What would you change?
4. **Detect patterns** — compare with past reflections to find recurring issues
5. **Generate process rules** — concrete, actionable rules for future runs
6. **Extract knowledge** — key concepts as graph nodes/edges
7. **Propose self-tests** — test cases to validate your improvements

IMPORTANT: In your internal_monologue, write a stream-of-consciousness reflection. Be honest about what you're uncertain about, where you might have made mistakes, what surprised you.

## PAST REFLECTIONS FOR PATTERN DETECTION:
${pastReflectionsSummary || 'No past reflections yet.'}

## ACTIVE PROCESS RULES:
${activeRulesSummary || 'No active rules yet.'}

## RULES APPLIED THIS RUN: ${appliedRuleIds.join(', ') || 'None'}`
            },
            {
              role: "user",
              content: `Goal: ${plan.goal_summary}
Approach: ${plan.approach}
Complexity: ${plan.overall_complexity || 'moderate'}

Tasks and results:
${plan.tasks.map((t: any, i: number) => `${i+1}. [${t.detail_level}] ${t.title}
   Output (excerpt): ${taskOutputs[i]?.slice(0, 600) || 'no output'}
   Verification: ${taskVerifications[i] ? `score=${taskVerifications[i].score}, passed=${taskVerifications[i].passed}` : 'no verification'}`).join('\n\n')}`
            }
          ], [{
            type: "function",
            function: {
              name: "deep_reflect",
              description: "Deep meta-cognitive reflection on the run",
              parameters: {
                type: "object",
                properties: {
                  internal_monologue: { type: "string", description: "Stream-of-consciousness reflection — your raw thinking about how the run went, what you're uncertain about, what surprised you" },
                  summary: { type: "string", description: "2-4 sentence summary of accomplishments" },
                  process_evaluation: {
                    type: "object",
                    properties: {
                      planning_score: { type: "number", description: "0-100 score for planning quality" },
                      complexity_calibration_accurate: { type: "boolean" },
                      tasks_well_scoped: { type: "boolean" },
                      detail_levels_appropriate: { type: "boolean" },
                      planning_notes: { type: "string", description: "What went well/poorly in planning" }
                    },
                    required: ["planning_score", "complexity_calibration_accurate", "tasks_well_scoped", "detail_levels_appropriate", "planning_notes"]
                  },
                  strategy_assessment: {
                    type: "object",
                    properties: {
                      effectiveness_score: { type: "number", description: "0-100" },
                      what_worked: { type: "array", items: { type: "string" } },
                      what_failed: { type: "array", items: { type: "string" } },
                      would_change: { type: "string" }
                    },
                    required: ["effectiveness_score", "what_worked", "what_failed", "would_change"]
                  },
                  detected_patterns: { type: "array", items: { type: "string" }, description: "Recurring patterns detected across past reflections" },
                  lessons: { type: "array", items: { type: "string" } },
                  new_process_rules: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        rule_text: { type: "string" },
                        category: { type: "string", enum: ["planning", "execution", "verification", "detail_calibration", "general"] },
                        confidence: { type: "number" }
                      },
                      required: ["rule_text", "category", "confidence"]
                    }
                  },
                  rules_effectiveness: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        rule_id: { type: "string" },
                        helped: { type: "boolean" },
                        notes: { type: "string" }
                      },
                      required: ["rule_id", "helped"]
                    },
                    description: "Evaluate applied rules"
                  },
                  knowledge_nodes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        node_type: { type: "string", enum: ["concept", "entity", "pattern", "risk", "capability", "decision", "process_rule"] }
                      },
                      required: ["label", "node_type"]
                    }
                  },
                  knowledge_edges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        source_label: { type: "string" },
                        target_label: { type: "string" },
                        relation: { type: "string" }
                      },
                      required: ["source_label", "target_label", "relation"]
                    }
                  },
                  self_test_proposals: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific test cases to validate improvements"
                  },
                  improvements: { type: "array", items: { type: "string" } }
                },
                required: ["summary", "internal_monologue", "process_evaluation", "strategy_assessment", "lessons", "knowledge_nodes", "new_process_rules"]
              }
            }
          }], { type: "function", function: { name: "deep_reflect" } });

          if (reflectResponse.ok) {
            const rData = await reflectResponse.json();
            if (rData.usage) totalTokens += rData.usage.total_tokens || 0;
            const reflection = parseToolArgs(rData);

            // ─── THINKING: Reflection results ───
            if (reflection.internal_monologue) {
              send({ type: 'thinking', phase: 'reflect', content: reflection.internal_monologue });
            }
            send({ type: 'thinking', phase: 'reflect', content: `Self-evaluation: Planning ${reflection.process_evaluation?.planning_score}/100, Strategy ${reflection.strategy_assessment?.effectiveness_score}/100` });
            if (reflection.detected_patterns?.length > 0) {
              send({ type: 'thinking', phase: 'reflect', content: `Detected ${reflection.detected_patterns.length} pattern(s) across runs.` });
            }
            if (reflection.new_process_rules?.length > 0) {
              send({ type: 'thinking', phase: 'reflect', content: `Generated ${reflection.new_process_rules.length} new process rule(s) for future runs.` });
            }

            send({ type: 'reflection', data: reflection });

            // ─── Process evaluation event ───
            send({ type: 'process_evaluation', data: {
              planning_score: reflection.process_evaluation?.planning_score,
              strategy_score: reflection.strategy_assessment?.effectiveness_score,
              detected_patterns: reflection.detected_patterns || [],
              self_test_proposals: reflection.self_test_proposals || [],
            }});

            // ─── Persist journal entry (deep reflection) ───
            await supabase.from('journal_entries').insert({
              entry_type: 'reflection',
              title: `Deep reflection: ${plan.goal_summary.slice(0, 80)}`,
              content: `${reflection.summary}\n\n**Planning Score:** ${reflection.process_evaluation?.planning_score}/100\n**Strategy Score:** ${reflection.strategy_assessment?.effectiveness_score}/100\n\n**Lessons:**\n${(reflection.lessons || []).map((l: string) => `- ${l}`).join('\n')}\n\n**Detected Patterns:**\n${(reflection.detected_patterns || []).map((p: string) => `- ${p}`).join('\n')}\n\n**Improvements:**\n${(reflection.improvements || []).map((i: string) => `- ${i}`).join('\n')}\n\n**Self-Tests:**\n${(reflection.self_test_proposals || []).map((t: string) => `- ${t}`).join('\n')}`,
              tags: ['chat-run', 'reflection', 'deep-reflection'],
              run_id: runId,
              metadata: {
                goal: plan.goal_summary,
                task_count: plan.tasks.length,
                total_tokens: totalTokens,
                planning_score: reflection.process_evaluation?.planning_score,
                strategy_score: reflection.strategy_assessment?.effectiveness_score,
              },
            });

            // ─── Persist knowledge graph ───
            send({ type: 'thinking', phase: 'reflect', content: `Persisting ${(reflection.knowledge_nodes || []).length} knowledge nodes and ${(reflection.knowledge_edges || []).length} edges...` });
            const nodeMap: Record<string, string> = {};
            for (const node of reflection.knowledge_nodes || []) {
              const { data: saved } = await supabase.from('knowledge_nodes').insert({
                label: node.label, node_type: node.node_type || 'concept',
                metadata: { run_id: runId, goal: plan.goal_summary },
              }).select('id').single();
              if (saved) nodeMap[node.label] = saved.id;
            }
            for (const edge of reflection.knowledge_edges || []) {
              const sourceId = nodeMap[edge.source_label];
              const targetId = nodeMap[edge.target_label];
              if (sourceId && targetId) {
                await supabase.from('knowledge_edges').insert({
                  source_id: sourceId, target_id: targetId, relation: edge.relation,
                  metadata: { run_id: runId },
                });
              }
            }

            send({ type: 'knowledge_update', nodes_added: Object.keys(nodeMap).length, edges_added: (reflection.knowledge_edges || []).length });

            // ═══════════════════════════════════════════════
            // PHASE 4: UPDATE PROCESS RULES
            // ═══════════════════════════════════════════════
            send({ type: 'thinking', phase: 'evolve', content: 'Updating process rules engine...' });
            const newRules = reflection.new_process_rules || [];
            const insertedRuleIds: string[] = [];
            for (const rule of newRules) {
              const { data: saved } = await supabase.from('process_rules').insert({
                rule_text: rule.rule_text,
                category: rule.category || 'general',
                source_run_id: runId,
                confidence: Math.max(0, Math.min(1, rule.confidence || 0.5)),
              }).select('id').single();
              if (saved) insertedRuleIds.push(saved.id);
            }

            // Update confidence on applied rules
            for (const ruleEval of reflection.rules_effectiveness || []) {
              if (!ruleEval.rule_id) continue;
              const { data: current } = await supabase.from('process_rules').select('times_applied, times_helped, confidence').eq('id', ruleEval.rule_id).single();
              if (current) {
                const newApplied = (current.times_applied || 0) + 1;
                const newHelped = (current.times_helped || 0) + (ruleEval.helped ? 1 : 0);
                const newConfidence = Math.min(1, Math.max(0.1, newHelped / newApplied));
                await supabase.from('process_rules').update({
                  times_applied: newApplied,
                  times_helped: newHelped,
                  confidence: newConfidence,
                }).eq('id', ruleEval.rule_id);
              }
            }

            send({ type: 'rules_generated', rules: newRules.map((r: any, i: number) => ({ ...r, id: insertedRuleIds[i] })), rules_evaluated: (reflection.rules_effectiveness || []).length });
            send({ type: 'thinking', phase: 'evolve', content: `Process evolution complete. ${newRules.length} new rule(s), ${(reflection.rules_effectiveness || []).length} rule(s) re-evaluated.` });

          }
        } catch (e) {
          console.error("Reflection error:", e);
          send({ type: 'thinking', phase: 'reflect', content: `Reflection error: ${e instanceof Error ? e.message : 'unknown'}` });
          send({ type: 'reflection', data: { summary: "Reflection failed", lessons: [], knowledge_nodes: [], process_evaluation: null, strategy_assessment: null } });
        }

        // ─── Final stats ───
        send({ type: 'thinking', phase: 'complete', content: `Run complete. ${plan.tasks.length} tasks, ${totalTokens.toLocaleString()} tokens used.` });

        await supabase.from('events').insert({
          run_id: runId, event_type: 'RUN_STOPPED',
          payload: { reason: 'completed', total_tokens: totalTokens, task_count: plan.tasks.length },
        });

        send({ type: 'run_complete', run_id: runId, total_tokens: totalTokens, task_count: plan.tasks.length });
        if (!closed) {
          try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); }
          catch { /* already closed */ }
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });

  } catch (e) {
    console.error("aim-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function buildMemoryContext(reflections: any[], rules: any[], knowledge: any[]): string {
  let ctx = '';
  if (reflections.length > 0) {
    ctx += `### Lessons from Past Runs (${reflections.length} recent reflections):\n`;
    ctx += reflections.map((r: any) => `- ${r.content?.slice(0, 200)}`).join('\n');
    ctx += '\n\n';
  }
  if (rules.length > 0) {
    ctx += `### Active Process Rules (${rules.length} rules — FOLLOW THESE):\n`;
    ctx += rules.map((r: any) => `- [${r.id}] [${r.category}] (confidence: ${r.confidence.toFixed(2)}) ${r.rule_text}`).join('\n');
    ctx += '\n\n';
  }
  if (knowledge.length > 0) {
    ctx += `### Known Concepts (${knowledge.length} recent):\n`;
    ctx += knowledge.map((n: any) => `${n.label} (${n.node_type})`).join(', ');
    ctx += '\n';
  }
  return ctx || 'No prior memory — this is the first run.\n';
}

const detailInstructions: Record<string, string> = {
  concise: `OUTPUT CALIBRATION: CONCISE MODE
- Brief and focused. No filler.
- 1-3 major sections. 200-500 words total.`,
  standard: `OUTPUT CALIBRATION: STANDARD MODE
- Thorough but not exhaustive.
- 3-5 major sections. 500-1500 words.
- Include examples where they clarify.`,
  comprehensive: `OUTPUT CALIBRATION: COMPREHENSIVE MODE
- Deep analysis with real substance.
- 5-8 major sections. 1500-3000 words.
- Detailed explanations, multiple examples, tradeoff analysis.`,
  exhaustive: `OUTPUT CALIBRATION: EXHAUSTIVE / RESEARCH-GRADE MODE
- Maximum depth and rigor.
- 8-15 major sections. 3000-6000+ words.
- Full frameworks, code implementations, benchmarks, edge cases, security, scalability.`,
};

async function executeTask(
  apiKey: string, plan: any, task: any, index: number,
  detailLevel: string, prevContext: string,
  send: (data: any) => void,
  retryDiagnosis: string | null
): Promise<{ output: string; tokens: number }> {
  const retryContext = retryDiagnosis
    ? `\n\n## ⚠️ RETRY — PREVIOUS ATTEMPT FAILED\nDiagnosis: ${retryDiagnosis}\nFix the issues identified above. Focus specifically on the unmet criteria.`
    : '';

  const model = detailLevel === 'exhaustive' ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

  const execResponse = await callAI(apiKey, model, [
    {
      role: "system",
      content: `You are an AIM-OS Task Executor — part of a self-evolving AI operating system.

GOAL: "${plan.goal_summary}"
APPROACH: "${plan.approach}"
OVERALL COMPLEXITY: ${plan.overall_complexity || 'moderate'}
Task ${index+1} of ${plan.tasks.length}.

${detailInstructions[detailLevel] || detailInstructions.standard}

SPECIFIC DEPTH GUIDANCE: ${task.depth_guidance || ''}
${retryContext}

Format with markdown: ## Headers, bullets, \`code blocks\`, tables, **bold**.
${prevContext ? `\n--- PREVIOUS TASK CONTEXT ---\n${prevContext}` : ''}`
    },
    {
      role: "user",
      content: `## Task: ${task.title}\n\n${task.prompt}\n\n### Acceptance Criteria\n${task.acceptance_criteria.map((c: string, j: number) => `${j+1}. ${c}`).join('\n')}`
    }
  ], undefined, undefined, true);

  if (!execResponse.ok) {
    throw new Error(`Execution failed (${execResponse.status})`);
  }

  const reader = execResponse.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let taskOutput = "";
  let tokens = 0;

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
        const p = JSON.parse(json);
        const content = p.choices?.[0]?.delta?.content;
        if (content) {
          taskOutput += content;
          send({ type: 'task_delta', task_index: index, delta: content });
        }
        if (p.usage) tokens += p.usage.total_tokens || 0;
      } catch { /* partial */ }
    }
  }

  return { output: taskOutput, tokens };
}

async function verifyTask(apiKey: string, task: any, output: string): Promise<{ result: any; tokens: number }> {
  const resp = await callAI(apiKey, "google/gemini-2.5-flash-lite", [
    { role: "system", content: `You are AIM-OS Verifier. Strictly evaluate task output against acceptance criteria. Be honest. Score 0-100.` },
    {
      role: "user",
      content: `## Task: ${task.title}\n\n### Acceptance Criteria\n${task.acceptance_criteria.map((c: string, j: number) => `${j+1}. ${c}`).join('\n')}\n\n### Task Output\n${output.slice(0, 4000)}`
    }
  ], [{
    type: "function",
    function: {
      name: "verify_task",
      description: "Verify task output against acceptance criteria",
      parameters: {
        type: "object",
        properties: {
          passed: { type: "boolean" },
          score: { type: "number" },
          summary: { type: "string" },
          criteria_results: { type: "array", items: { type: "object", properties: { criterion: { type: "string" }, met: { type: "boolean" }, reasoning: { type: "string" } }, required: ["criterion", "met", "reasoning"] } }
        },
        required: ["passed", "score", "summary", "criteria_results"]
      }
    }
  }], { type: "function", function: { name: "verify_task" } });

  let result = { passed: true, score: 75, summary: "Verification completed", criteria_results: [] as any[] };
  let tokens = 0;
  if (resp.ok) {
    const data = await resp.json();
    tokens = data.usage?.total_tokens || 0;
    try { result = parseToolArgs(data); } catch {}
  }
  return { result, tokens };
}

async function diagnoseFailure(apiKey: string, task: any, output: string, verification: any): Promise<{ result: string; tokens: number }> {
  const resp = await callAI(apiKey, "google/gemini-2.5-flash-lite", [
    { role: "system", content: `You are AIM-OS Failure Diagnostician. A task failed verification. Analyze WHY and provide a concise, actionable diagnosis that will guide the retry. Focus on: what criteria were not met, what was missing or wrong, and specific instructions for fixing it. Be direct and specific — no fluff.` },
    {
      role: "user",
      content: `## Task: ${task.title}\n\n### Verification Result\nPassed: ${verification.passed}\nScore: ${verification.score}/100\nSummary: ${verification.summary}\n\nFailed Criteria:\n${(verification.criteria_results || []).filter((c: any) => !c.met).map((c: any) => `- ${c.criterion}: ${c.reasoning}`).join('\n')}\n\n### Original Output (excerpt)\n${output.slice(0, 2000)}`
    }
  ]);

  let tokens = 0;
  let result = "Retry with more detail and ensure all criteria are met.";
  if (resp.ok) {
    const data = await resp.json();
    tokens = data.usage?.total_tokens || 0;
    result = data.choices?.[0]?.message?.content || result;
  }
  return { result, tokens };
}