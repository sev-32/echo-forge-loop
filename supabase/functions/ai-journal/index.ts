import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { recent_events, task_result, journal_history, knowledge_graph, reflection_type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an AI self-reflection engine. Your job is to analyze recent work and generate journal entries that improve future performance.

REFLECTION TYPE: ${reflection_type || 'post_task'}

You must produce structured journal entries. Types available:
- reflection: What went well/poorly, lessons learned
- correction: Fix a previous mistake or misconception  
- discovery: New insight or pattern found
- hypothesis: Theory to test in future tasks
- synthesis: Combine multiple insights into higher-level understanding
- process_note: Improvement to the work process itself
- plan: New plan or strategy based on learnings

PREVIOUS JOURNAL ENTRIES (for continuity):
${(journal_history || []).slice(-10).map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content?.substring(0, 200)}`).join('\n')}

KNOWLEDGE GRAPH CONTEXT:
${(knowledge_graph?.nodes || []).slice(-20).map((n: any) => `- ${n.label} (${n.node_type})`).join('\n')}`;

    const userPrompt = `RECENT EVENTS:
${(recent_events || []).slice(-20).map((e: any) => `[${e.event_type}] ${JSON.stringify(e.payload).substring(0, 200)}`).join('\n')}

TASK RESULT:
${task_result ? JSON.stringify(task_result).substring(0, 2000) : 'No task result provided'}

Generate journal entries and knowledge graph updates based on this work.`;

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
              name: "generate_reflections",
              description: "Generate journal entries and knowledge updates from task analysis",
              parameters: {
                type: "object",
                properties: {
                  journal_entries: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        entry_type: { type: "string", enum: ["reflection", "correction", "discovery", "hypothesis", "synthesis", "process_note", "plan"] },
                        title: { type: "string" },
                        content: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      },
                      required: ["entry_type", "title", "content"],
                    },
                  },
                  knowledge_updates: {
                    type: "object",
                    properties: {
                      new_nodes: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            label: { type: "string" },
                            node_type: { type: "string", enum: ["concept", "pattern", "risk", "capability", "limitation"] },
                          },
                          required: ["label", "node_type"],
                        },
                      },
                      new_edges: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            source_label: { type: "string" },
                            target_label: { type: "string" },
                            relation: { type: "string", enum: ["supports", "contradicts", "requires", "improves", "causes", "related_to"] },
                            weight: { type: "number" },
                          },
                          required: ["source_label", "target_label", "relation"],
                        },
                      },
                    },
                  },
                  process_improvements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        area: { type: "string" },
                        current_behavior: { type: "string" },
                        suggested_improvement: { type: "string" },
                        expected_impact: { type: "string", enum: ["low", "medium", "high"] },
                      },
                      required: ["area", "suggested_improvement"],
                    },
                  },
                  context_bank_updates: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        bank_name: { type: "string" },
                        content: { type: "string" },
                        priority: { type: "number" },
                      },
                      required: ["bank_name", "content"],
                    },
                  },
                },
                required: ["journal_entries"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_reflections" } },
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
      try { result = JSON.parse(toolCall.function.arguments); } catch { result = { journal_entries: [] }; }
    } else {
      result = { journal_entries: [] };
    }

    return new Response(JSON.stringify({ ...result, usage: data.usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-journal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
