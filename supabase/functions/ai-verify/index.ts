import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { task_output, acceptance_criteria, task_context, must_do, must_not_do } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a strict verification engine. Your job is to evaluate task outputs against acceptance criteria.

RULES:
- Be precise and honest - never pass something that doesn't meet criteria
- Check each criterion individually  
- Look for contradictions with original requirements
- Flag any signs of hallucination or fabrication
- Score each criterion 0-100
- If verification fails, explain exactly what's wrong and how to fix it`;

    const userPrompt = `TASK OUTPUT:
${typeof task_output === 'string' ? task_output : JSON.stringify(task_output).substring(0, 3000)}

ACCEPTANCE CRITERIA:
${(acceptance_criteria || []).map((c: any, i: number) => `${i + 1}. ${typeof c === 'string' ? c : c.description || JSON.stringify(c)}`).join('\n')}

MUST DO: ${(must_do || []).join(', ') || 'None specified'}
MUST NOT DO: ${(must_not_do || []).join(', ') || 'None specified'}

CONTEXT: ${task_context ? JSON.stringify(task_context).substring(0, 1000) : 'None'}

Evaluate each criterion and produce a detailed verification report.`;

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
              name: "verify_output",
              description: "Verify task output against acceptance criteria",
              parameters: {
                type: "object",
                properties: {
                  passed: { type: "boolean" },
                  overall_score: { type: "number" },
                  criteria_results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        criterion: { type: "string" },
                        passed: { type: "boolean" },
                        score: { type: "number" },
                        reasoning: { type: "string" },
                        fix_suggestion: { type: "string" },
                      },
                      required: ["criterion", "passed", "score", "reasoning"],
                    },
                  },
                  contradictions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      },
                      required: ["description", "severity"],
                    },
                  },
                  hallucination_flags: {
                    type: "array",
                    items: { type: "string" },
                  },
                  summary: { type: "string" },
                },
                required: ["passed", "overall_score", "criteria_results", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "verify_output" } },
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
      try { result = JSON.parse(toolCall.function.arguments); } catch { result = { passed: false, overall_score: 0, criteria_results: [], summary: "Parse error" }; }
    } else {
      result = { passed: false, overall_score: 0, criteria_results: [], summary: "No structured output" };
    }

    return new Response(JSON.stringify({ ...result, usage: data.usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-verify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
