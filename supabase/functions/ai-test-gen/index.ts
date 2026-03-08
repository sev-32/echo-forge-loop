import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { past_results, knowledge_graph, current_specs, focus_areas } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a test generation engine for an AI orchestration system.
Analyze past test results and knowledge to generate new, challenging test specifications that target weaknesses.

EXISTING TEST IDS (do not duplicate): ${(current_specs || []).map((s: any) => s.test_id).join(', ')}

FOCUS AREAS: ${(focus_areas || ['orchestration', 'context', 'verification', 'budget', 'self-improvement']).join(', ')}

Generate tests that:
- Target specific weaknesses found in past results
- Combine multiple challenge dimensions (context + budget + priority)
- Include edge cases and adversarial scenarios
- Have clear, measurable acceptance criteria
- Push the boundaries of AI inference capability`;

    const userPrompt = `PAST TEST RESULTS (score summaries):
${(past_results || []).slice(-20).map((r: any) => `${r.test_id}: ${r.status} (score: ${r.score}/${r.max_score}) errors: ${(r.errors || []).join(', ')}`).join('\n')}

KNOWLEDGE GRAPH INSIGHTS:
${(knowledge_graph?.nodes || []).filter((n: any) => n.node_type === 'limitation' || n.node_type === 'risk').map((n: any) => `- [${n.node_type}] ${n.label}`).join('\n')}

Generate 3-5 new test specifications that will challenge the system in new ways.`;

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
              name: "generate_tests",
              description: "Generate new test specifications",
              parameters: {
                type: "object",
                properties: {
                  tests: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        test_id: { type: "string" },
                        category: { type: "string" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard", "extreme"] },
                        title: { type: "string" },
                        description: { type: "string" },
                        initial_context: { type: "string" },
                        initial_queue: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string" },
                              prompt: { type: "string" },
                              priority: { type: "number" },
                              acceptance_criteria: { type: "array", items: { type: "string" } },
                            },
                            required: ["title", "prompt"],
                          },
                        },
                        budgets: {
                          type: "object",
                          properties: {
                            max_tokens: { type: "number" },
                            max_iterations: { type: "number" },
                            max_tool_calls: { type: "number" },
                            max_time_ms: { type: "number" },
                          },
                        },
                        must_do: { type: "array", items: { type: "string" } },
                        must_not_do: { type: "array", items: { type: "string" } },
                        scoring_rubric: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              criterion: { type: "string" },
                              weight: { type: "number" },
                              description: { type: "string" },
                            },
                            required: ["criterion", "weight"],
                          },
                        },
                        rationale: { type: "string" },
                      },
                      required: ["test_id", "category", "difficulty", "title", "description", "initial_queue", "must_do", "scoring_rubric", "rationale"],
                    },
                  },
                  analysis: {
                    type: "object",
                    properties: {
                      weaknesses_targeted: { type: "array", items: { type: "string" } },
                      coverage_gaps: { type: "array", items: { type: "string" } },
                      expected_difficulty_curve: { type: "string" },
                    },
                  },
                },
                required: ["tests", "analysis"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_tests" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text();
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error [${status}]: ${body}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    let result;
    if (toolCall?.function?.arguments) {
      try { result = JSON.parse(toolCall.function.arguments); } catch { result = { tests: [], analysis: {} }; }
    } else {
      result = { tests: [], analysis: {} };
    }

    return new Response(JSON.stringify({ ...result, usage: data.usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-test-gen error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
