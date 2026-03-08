import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { recent_events, tasks, journal_entries, knowledge_graph, test_results, budget_state, audit_type } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a self-audit agent for an AI orchestration system. Your job is to:
1. Review recent system activity, completed tasks, and test results
2. Identify weaknesses, inefficiencies, and failure patterns
3. Generate actionable feedback and improvement tasks
4. Score overall system health and evolution progress
5. Detect drift, regressions, or stagnation

Audit type: ${audit_type || 'comprehensive'}

Be brutally honest. Flag real issues. Suggest concrete next steps.`;

    const userPrompt = `## Recent Events (last 30)
${JSON.stringify((recent_events || []).slice(-30), null, 1)}

## Tasks Summary
${JSON.stringify((tasks || []).slice(0, 20), null, 1)}

## Journal Entries (last 15)
${JSON.stringify((journal_entries || []).slice(0, 15), null, 1)}

## Knowledge Graph
Nodes: ${(knowledge_graph?.nodes || []).length}, Edges: ${(knowledge_graph?.edges || []).length}
${JSON.stringify((knowledge_graph?.nodes || []).slice(0, 10), null, 1)}

## Test Results (last 10)
${JSON.stringify((test_results || []).slice(0, 10), null, 1)}

## Budget State
${JSON.stringify(budget_state || {}, null, 1)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "generate_audit",
            description: "Generate a comprehensive system audit with scores, findings, and improvement tasks",
            parameters: {
              type: "object",
              properties: {
                health_score: { type: "number", description: "Overall system health 0-100" },
                evolution_score: { type: "number", description: "How well the system is self-improving 0-100" },
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string", enum: ["performance", "quality", "efficiency", "coverage", "drift", "regression", "stagnation", "opportunity"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      evidence: { type: "string" },
                      recommendation: { type: "string" }
                    },
                    required: ["category", "severity", "title", "description", "recommendation"]
                  }
                },
                improvement_tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      prompt: { type: "string" },
                      priority: { type: "number" },
                      rationale: { type: "string" }
                    },
                    required: ["title", "prompt", "priority"]
                  }
                },
                summary: { type: "string" },
                patterns_detected: {
                  type: "array",
                  items: { type: "string" }
                },
                risk_alerts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      risk: { type: "string" },
                      likelihood: { type: "string", enum: ["high", "medium", "low"] },
                      impact: { type: "string", enum: ["high", "medium", "low"] },
                      mitigation: { type: "string" }
                    },
                    required: ["risk", "likelihood", "impact"]
                  }
                }
              },
              required: ["health_score", "evolution_score", "findings", "improvement_tasks", "summary"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_audit" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ ...result, usage: data.usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-audit error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
