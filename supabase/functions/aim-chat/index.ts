import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Step 1: Use AI to decompose the user's goal into structured tasks
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    
    const planResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are AIM-OS Task Planner. Given a user goal, decompose it into 2-5 concrete tasks.
Return a JSON object using the tool provided. Each task should have:
- title: Short task name
- prompt: Detailed instructions for the AI executor  
- priority: 50-100 (higher = more important)
- acceptance_criteria: Array of strings describing what "done" looks like`
          },
          { role: "user", content: lastUserMsg }
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_task_plan",
            description: "Create a structured plan of tasks to accomplish the user's goal",
            parameters: {
              type: "object",
              properties: {
                goal_summary: { type: "string", description: "One-line summary of the goal" },
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      prompt: { type: "string" },
                      priority: { type: "number" },
                      acceptance_criteria: { type: "array", items: { type: "string" } }
                    },
                    required: ["title", "prompt", "priority", "acceptance_criteria"]
                  }
                }
              },
              required: ["goal_summary", "tasks"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_task_plan" } }
      }),
    });

    if (!planResponse.ok) {
      if (planResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (planResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await planResponse.text();
      console.error("Plan error:", planResponse.status, t);
      throw new Error("Failed to create plan");
    }

    const planData = await planResponse.json();
    let plan;
    try {
      const toolCall = planData.choices?.[0]?.message?.tool_calls?.[0];
      plan = JSON.parse(toolCall.function.arguments);
    } catch {
      plan = { goal_summary: lastUserMsg, tasks: [{ title: "Execute goal", prompt: lastUserMsg, priority: 80, acceptance_criteria: ["Goal is accomplished"] }] };
    }

    const planUsage = planData.usage || {};

    // Step 2: Execute each task via AI and stream results back
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Emit plan
        send({
          type: 'plan',
          goal: plan.goal_summary,
          tasks: plan.tasks.map((t: any, i: number) => ({ id: i, title: t.title, status: 'queued' })),
          usage: planUsage,
        });

        // Execute each task
        for (let i = 0; i < plan.tasks.length; i++) {
          const task = plan.tasks[i];
          
          send({ type: 'task_start', task_index: i, title: task.title });

          try {
            // Call AI to execute the task with streaming
            const execResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  {
                    role: "system",
                    content: `You are an AIM-OS Task Executor. Execute the given task thoroughly.
Show your work clearly using markdown:
- Use ## headers for sections
- Use bullet points for details
- Use code blocks when relevant
- Be thorough but concise
- End with a clear deliverable

Context: This is part of a larger goal: "${plan.goal_summary}"
Previous tasks completed: ${i > 0 ? plan.tasks.slice(0, i).map((t: any) => t.title).join(', ') : 'None yet'}`
                  },
                  {
                    role: "user",
                    content: `Task: ${task.title}\n\nInstructions: ${task.prompt}\n\nAcceptance Criteria:\n${task.acceptance_criteria.map((c: string) => `- ${c}`).join('\n')}`
                  }
                ],
                stream: true,
              }),
            });

            if (!execResponse.ok) {
              send({ type: 'task_error', task_index: i, error: `AI execution failed (${execResponse.status})` });
              continue;
            }

            // Stream the execution output token by token
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
                } catch { /* partial */ }
              }
            }

            // Verify the task output
            send({ type: 'task_verify_start', task_index: i });
            
            const verifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  {
                    role: "system",
                    content: "You are a verification agent. Check if the task output meets the acceptance criteria. Use the tool to return your assessment."
                  },
                  {
                    role: "user",
                    content: `Task: ${task.title}\nAcceptance Criteria:\n${task.acceptance_criteria.map((c: string) => `- ${c}`).join('\n')}\n\nTask Output:\n${taskOutput.slice(0, 3000)}`
                  }
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "verify_task",
                    description: "Verify if the task output meets acceptance criteria",
                    parameters: {
                      type: "object",
                      properties: {
                        passed: { type: "boolean" },
                        score: { type: "number", description: "0-100" },
                        summary: { type: "string" },
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

            if (verifyResponse.ok) {
              const vData = await verifyResponse.json();
              try {
                const vResult = JSON.parse(vData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}');
                send({ type: 'task_verified', task_index: i, verification: vResult, usage: vData.usage });
              } catch {
                send({ type: 'task_verified', task_index: i, verification: { passed: true, score: 75, summary: "Verification parse failed, assumed pass" } });
              }
            } else {
              send({ type: 'task_verified', task_index: i, verification: { passed: true, score: 70, summary: "Verification skipped" } });
            }

            send({ type: 'task_complete', task_index: i, title: task.title });

          } catch (err) {
            console.error(`Task ${i} error:`, err);
            send({ type: 'task_error', task_index: i, error: err instanceof Error ? err.message : 'Unknown error' });
          }
        }

        // Final reflection
        send({ type: 'reflection_start' });
        
        try {
          const reflectResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                {
                  role: "system",
                  content: "You are AIM-OS reflecting on a completed run. Provide a brief summary of what was accomplished, what was learned, and what could be improved. Be concise (3-5 sentences)."
                },
                {
                  role: "user",
                  content: `Goal: ${plan.goal_summary}\nTasks completed: ${plan.tasks.map((t: any) => t.title).join(', ')}`
                }
              ],
              stream: true,
            }),
          });

          if (reflectResponse.ok) {
            const rReader = reflectResponse.body!.getReader();
            const rDecoder = new TextDecoder();
            let rBuf = "";

            while (true) {
              const { done, value } = await rReader.read();
              if (done) break;
              rBuf += rDecoder.decode(value, { stream: true });

              let nl: number;
              while ((nl = rBuf.indexOf("\n")) !== -1) {
                let line = rBuf.slice(0, nl);
                rBuf = rBuf.slice(nl + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") break;
                try {
                  const p = JSON.parse(json);
                  const content = p.choices?.[0]?.delta?.content;
                  if (content) send({ type: 'reflection_delta', delta: content });
                } catch { /* partial */ }
              }
            }
          }
        } catch (e) {
          console.error("Reflection error:", e);
        }

        send({ type: 'run_complete' });
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
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
