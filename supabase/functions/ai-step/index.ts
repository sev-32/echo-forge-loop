import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { task, context, mode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an AI orchestration kernel executing tasks in a self-evolving system.
You receive a task with context and must produce a structured execution plan and result.

RULES:
- Be precise and actionable
- Follow acceptance criteria exactly
- Report what you did, what succeeded, what failed
- If you discover new information, note it for the journal
- If you find contradictions with context, flag them
- Minimize token usage while maximizing quality

MODE: ${mode || 'autonomous'}

CONTEXT WINDOW:
${(context?.pinned || []).map((c: any) => `[PINNED] ${c.content}`).join('\n')}
${(context?.working || []).map((c: any) => `[WORKING] ${c.content}`).join('\n')}
${(context?.process_notes || []).map((c: any) => `[PROCESS NOTE] ${c}`).join('\n')}`;

    const userPrompt = `TASK: ${task.title}
PROMPT: ${task.prompt}
ACCEPTANCE CRITERIA: ${JSON.stringify(task.acceptance_criteria || [])}
PRIORITY: ${task.priority || 50}
DEPENDENCIES CONTEXT: ${JSON.stringify(task.dependency_results || [])}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "execute_task",
              description: "Execute the task and return structured results",
              parameters: {
                type: "object",
                properties: {
                  plan: {
                    type: "object",
                    properties: {
                      steps: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            action: { type: "string" },
                            reasoning: { type: "string" },
                            expected_output: { type: "string" },
                          },
                          required: ["action", "reasoning"],
                        },
                      },
                      estimated_complexity: { type: "string", enum: ["low", "medium", "high"] },
                    },
                    required: ["steps"],
                  },
                  result: {
                    type: "object",
                    properties: {
                      output: { type: "string" },
                      artifacts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            content: { type: "string" },
                            type: { type: "string" },
                          },
                          required: ["name", "content"],
                        },
                      },
                      tokens_used: { type: "number" },
                    },
                    required: ["output"],
                  },
                  discoveries: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["insight", "contradiction", "question", "process_improvement"] },
                        content: { type: "string" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      },
                      required: ["type", "content"],
                    },
                  },
                  new_tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        prompt: { type: "string" },
                        priority: { type: "number" },
                      },
                      required: ["title", "prompt"],
                    },
                  },
                  self_assessment: {
                    type: "object",
                    properties: {
                      confidence: { type: "number" },
                      criteria_met: {
                        type: "array",
                        items: { type: "string" },
                      },
                      criteria_missed: {
                        type: "array",
                        items: { type: "string" },
                      },
                      improvement_notes: { type: "string" },
                    },
                    required: ["confidence"],
                  },
                },
                required: ["plan", "result", "self_assessment"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "execute_task" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited", details: body }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required", details: body }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error [${status}]: ${body}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    let result;
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch {
        result = { plan: { steps: [] }, result: { output: data.choices?.[0]?.message?.content || "No output" }, self_assessment: { confidence: 0.5 } };
      }
    } else {
      result = { plan: { steps: [] }, result: { output: data.choices?.[0]?.message?.content || "No output" }, self_assessment: { confidence: 0.5 } };
    }

    return new Response(JSON.stringify({
      ...result,
      usage: data.usage,
      model: data.model,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("ai-step error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
