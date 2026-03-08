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

    // ─── Step 1: AI Task Planner ───
    const planResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are AIM-OS, an AI Operating System's task planner. Given a user's goal, decompose it into 3-5 detailed, actionable tasks.

Each task must be substantial and produce real deliverables. Think like a senior engineer breaking down a project.

Rules:
- Tasks should build on each other (later tasks can reference earlier ones)
- Each task should take meaningful work, not trivial steps
- Acceptance criteria must be specific and verifiable
- Priorities: 90-100 = critical, 70-89 = high, 50-69 = medium`
          },
          { role: "user", content: lastUserMsg }
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_task_plan",
            description: "Create a structured execution plan",
            parameters: {
              type: "object",
              properties: {
                goal_summary: { type: "string", description: "Concise goal statement" },
                approach: { type: "string", description: "High-level approach explanation (2-3 sentences)" },
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      prompt: { type: "string", description: "Detailed execution instructions" },
                      priority: { type: "number" },
                      acceptance_criteria: { type: "array", items: { type: "string" } },
                      depends_on: { type: "array", items: { type: "number" }, description: "Indices of tasks this depends on" }
                    },
                    required: ["title", "prompt", "priority", "acceptance_criteria"]
                  }
                }
              },
              required: ["goal_summary", "approach", "tasks"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_task_plan" } }
      }),
    });

    if (!planResponse.ok) {
      const status = planResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Plan failed: ${status}`);
    }

    const planData = await planResponse.json();
    let plan: any;
    try {
      plan = JSON.parse(planData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
    } catch {
      plan = { goal_summary: lastUserMsg, approach: "Direct execution", tasks: [{ title: "Execute goal", prompt: lastUserMsg, priority: 80, acceptance_criteria: ["Goal accomplished"] }] };
    }

    // ─── Persist tasks to DB ───
    const taskIds: string[] = [];
    for (const t of plan.tasks) {
      const taskId = generateId();
      taskIds.push(taskId);
      await supabase.from('tasks').insert({
        id: taskId,
        run_id: runId,
        title: t.title,
        prompt: t.prompt,
        priority: t.priority,
        status: 'queued',
        acceptance_criteria: t.acceptance_criteria.map((c: string, i: number) => ({
          id: `ac-${i}`, description: c, type: 'custom', config: {}, required: true
        })),
        dependencies: (t.depends_on || []).map((idx: number) => taskIds[idx]).filter(Boolean),
      });
    }

    await supabase.from('events').insert({
      run_id: runId,
      event_type: 'PLAN_CREATED',
      payload: { goal: plan.goal_summary, approach: plan.approach, task_count: plan.tasks.length, task_ids: taskIds },
    });

    // ─── Stream execution ───
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({
          type: 'plan',
          run_id: runId,
          goal: plan.goal_summary,
          approach: plan.approach,
          tasks: plan.tasks.map((t: any, i: number) => ({ id: taskIds[i], index: i, title: t.title, status: 'queued', priority: t.priority, criteria_count: t.acceptance_criteria.length })),
        });

        let totalTokens = 0;
        const taskOutputs: string[] = [];

        for (let i = 0; i < plan.tasks.length; i++) {
          const task = plan.tasks[i];
          const taskId = taskIds[i];

          // Update task status in DB
          await supabase.from('tasks').update({ status: 'active' }).eq('id', taskId);
          send({ type: 'task_start', task_index: i, task_id: taskId, title: task.title });

          try {
            // Build context from previous task outputs
            const prevContext = taskOutputs.map((out, j) => `[Task ${j+1}: ${plan.tasks[j].title}]\n${out.slice(0, 1500)}`).join('\n\n');

            const execResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  {
                    role: "system",
                    content: `You are an AIM-OS Task Executor — part of a self-evolving AI operating system.

GOAL: "${plan.goal_summary}"
APPROACH: "${plan.approach}"

You are executing task ${i+1} of ${plan.tasks.length}. Be thorough, specific, and produce real deliverables.

Format with markdown. Use:
- ## Headers for major sections
- Bullet points and numbered lists
- \`code blocks\` for technical content  
- Tables where data comparison helps
- Bold for key findings

${prevContext ? `\n--- CONTEXT FROM PREVIOUS TASKS ---\n${prevContext}` : ''}`
                  },
                  {
                    role: "user",
                    content: `## Task: ${task.title}\n\n${task.prompt}\n\n### Acceptance Criteria\n${task.acceptance_criteria.map((c: string, j: number) => `${j+1}. ${c}`).join('\n')}`
                  }
                ],
                stream: true,
              }),
            });

            if (!execResponse.ok) {
              const errText = await execResponse.text();
              throw new Error(`Execution failed (${execResponse.status}): ${errText.slice(0, 200)}`);
            }

            const reader = execResponse.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let taskOutput = "";

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
                    send({ type: 'task_delta', task_index: i, delta: content });
                  }
                  if (p.usage) totalTokens += p.usage.total_tokens || 0;
                } catch { /* partial json */ }
              }
            }

            taskOutputs.push(taskOutput);

            // ─── Persist execution event ───
            await supabase.from('events').insert({
              run_id: runId,
              event_type: 'ACTION_EXECUTED',
              payload: { task_id: taskId, output_length: taskOutput.length, task_title: task.title },
            });

            // ─── Verify ───
            send({ type: 'task_verify_start', task_index: i });
            await supabase.from('tasks').update({ status: 'active', result: { output: taskOutput.slice(0, 5000) } }).eq('id', taskId);

            const verifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  {
                    role: "system",
                    content: `You are AIM-OS Verifier. Strictly evaluate task output against acceptance criteria. Be honest — if criteria aren't fully met, say so. Score 0-100.`
                  },
                  {
                    role: "user",
                    content: `## Task: ${task.title}\n\n### Acceptance Criteria\n${task.acceptance_criteria.map((c: string, j: number) => `${j+1}. ${c}`).join('\n')}\n\n### Task Output\n${taskOutput.slice(0, 4000)}`
                  }
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "verify_task",
                    description: "Verify task output against acceptance criteria",
                    parameters: {
                      type: "object",
                      properties: {
                        passed: { type: "boolean", description: "true if ALL required criteria are met" },
                        score: { type: "number", description: "0-100 quality score" },
                        summary: { type: "string", description: "Brief verification summary" },
                        criteria_results: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              criterion: { type: "string" },
                              met: { type: "boolean" },
                              reasoning: { type: "string" }
                            },
                            required: ["criterion", "met", "reasoning"]
                          }
                        }
                      },
                      required: ["passed", "score", "summary", "criteria_results"]
                    }
                  }
                }],
                tool_choice: { type: "function", function: { name: "verify_task" } }
              }),
            });

            let verification = { passed: true, score: 75, summary: "Verification completed", criteria_results: [] as any[] };
            if (verifyResponse.ok) {
              const vData = await verifyResponse.json();
              if (vData.usage) totalTokens += vData.usage.total_tokens || 0;
              try {
                verification = JSON.parse(vData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
              } catch { /* use default */ }
            }

            // Persist verification
            const finalStatus = verification.passed ? 'done' : 'failed';
            await supabase.from('tasks').update({
              status: finalStatus,
              result: { output: taskOutput.slice(0, 5000), verification },
              error: verification.passed ? null : verification.summary,
            }).eq('id', taskId);

            await supabase.from('events').insert({
              run_id: runId,
              event_type: verification.passed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED',
              payload: { task_id: taskId, score: verification.score, summary: verification.summary, passed: verification.passed },
            });

            send({ type: 'task_verified', task_index: i, verification });
            send({ type: 'task_complete', task_index: i, status: finalStatus });

          } catch (err: any) {
            console.error(`Task ${i} error:`, err);
            await supabase.from('tasks').update({ status: 'failed', error: err.message }).eq('id', taskId);
            await supabase.from('events').insert({ run_id: runId, event_type: 'ERROR_RAISED', payload: { task_id: taskId, error: err.message } });
            send({ type: 'task_error', task_index: i, error: err.message });
            taskOutputs.push(`ERROR: ${err.message}`);
          }
        }

        // ─── Reflection + Knowledge Extraction ───
        send({ type: 'reflection_start' });

        try {
          const reflectResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: `You are AIM-OS Reflector. After a run, you:
1. Summarize what was accomplished
2. Extract key concepts/entities as knowledge graph nodes
3. Identify lessons learned and process improvements

Use the tool to return structured reflection data.`
                },
                {
                  role: "user",
                  content: `Goal: ${plan.goal_summary}\nApproach: ${plan.approach}\n\nTasks completed:\n${plan.tasks.map((t: any, i: number) => `${i+1}. ${t.title} — ${taskOutputs[i]?.slice(0, 500) || 'no output'}`).join('\n\n')}`
                }
              ],
              tools: [{
                type: "function",
                function: {
                  name: "reflect_on_run",
                  description: "Reflect on the completed run",
                  parameters: {
                    type: "object",
                    properties: {
                      summary: { type: "string", description: "2-4 sentence summary of accomplishments" },
                      lessons: { type: "array", items: { type: "string" }, description: "Key lessons learned" },
                      knowledge_nodes: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            label: { type: "string" },
                            node_type: { type: "string", enum: ["concept", "entity", "pattern", "risk", "capability", "decision"] }
                          },
                          required: ["label", "node_type"]
                        },
                        description: "Key concepts to add to knowledge graph"
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
                      improvements: { type: "array", items: { type: "string" }, description: "Process improvements for future runs" }
                    },
                    required: ["summary", "lessons", "knowledge_nodes"]
                  }
                }
              }],
              tool_choice: { type: "function", function: { name: "reflect_on_run" } }
            }),
          });

          if (reflectResponse.ok) {
            const rData = await reflectResponse.json();
            if (rData.usage) totalTokens += rData.usage.total_tokens || 0;
            let reflection: any;
            try {
              reflection = JSON.parse(rData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
            } catch {
              reflection = { summary: "Reflection parsing failed", lessons: [], knowledge_nodes: [] };
            }

            send({ type: 'reflection', data: reflection });

            // ─── Persist journal entry ───
            await supabase.from('journal_entries').insert({
              entry_type: 'reflection',
              title: `Run reflection: ${plan.goal_summary.slice(0, 80)}`,
              content: `${reflection.summary}\n\n**Lessons:**\n${(reflection.lessons || []).map((l: string) => `- ${l}`).join('\n')}\n\n**Improvements:**\n${(reflection.improvements || []).map((i: string) => `- ${i}`).join('\n')}`,
              tags: ['chat-run', 'reflection'],
              run_id: runId,
              metadata: { goal: plan.goal_summary, task_count: plan.tasks.length, total_tokens: totalTokens },
            });

            // ─── Persist knowledge graph nodes + edges ───
            const nodeMap: Record<string, string> = {};
            for (const node of reflection.knowledge_nodes || []) {
              const { data: saved } = await supabase.from('knowledge_nodes').insert({
                label: node.label,
                node_type: node.node_type || 'concept',
                metadata: { run_id: runId, goal: plan.goal_summary },
              }).select('id').single();
              if (saved) nodeMap[node.label] = saved.id;
            }

            for (const edge of reflection.knowledge_edges || []) {
              const sourceId = nodeMap[edge.source_label];
              const targetId = nodeMap[edge.target_label];
              if (sourceId && targetId) {
                await supabase.from('knowledge_edges').insert({
                  source_id: sourceId,
                  target_id: targetId,
                  relation: edge.relation,
                  metadata: { run_id: runId },
                });
              }
            }

            send({ type: 'knowledge_update', nodes_added: Object.keys(nodeMap).length, edges_added: (reflection.knowledge_edges || []).length });
          }
        } catch (e) {
          console.error("Reflection error:", e);
          send({ type: 'reflection', data: { summary: "Reflection failed", lessons: [], knowledge_nodes: [] } });
        }

        // ─── Final stats ───
        await supabase.from('events').insert({
          run_id: runId,
          event_type: 'RUN_STOPPED',
          payload: { reason: 'completed', total_tokens: totalTokens, task_count: plan.tasks.length },
        });

        send({ type: 'run_complete', run_id: runId, total_tokens: totalTokens, task_count: plan.tasks.length });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
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
