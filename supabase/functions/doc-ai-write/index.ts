import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, content, style, docTitle, fullContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const styleInstructions: Record<string, string> = {
      academic: "Use formal academic language with citations-ready structure, precise terminology, hedged claims, and scholarly tone.",
      technical: "Use clear technical writing with structured headings, concrete examples, precise definitions, and logical flow.",
      casual: "Use conversational, approachable language. Be friendly and direct. Use contractions and simple words.",
      legal: "Use precise legal language. Define terms clearly. Use enumerated lists. Maintain formal structure.",
      creative: "Use vivid, engaging prose. Employ metaphors, varied sentence structure, and evocative imagery.",
      journalistic: "Use inverted pyramid style. Lead with key facts. Use active voice. Keep paragraphs short.",
      executive: "Use concise executive language. Lead with conclusions. Use bullet points for key findings. Data-driven.",
    };

    const actionPrompts: Record<string, string> = {
      expand: `Expand the following text with more detail, examples, and depth while maintaining the ${style} style. Keep the same structure but add 2-3x more content:\n\n${content}`,
      condense: `Condense the following text to its essential points. Remove redundancy while preserving all key information. Target ~40% of original length:\n\n${content}`,
      rephrase: `Rephrase the following text with different wording while maintaining the exact same meaning. Use the ${style} style:\n\n${content}`,
      formalize: `Rewrite the following text in a more formal, professional register suitable for academic or executive audiences:\n\n${content}`,
      simplify: `Simplify the following text for a general audience. Use shorter sentences, common words, and clear structure:\n\n${content}`,
      continue: `Based on the document context below, write the next logical section or paragraph. Match the existing style and flow.\n\nDocument so far:\n${fullContext?.slice(-4000) || content}`,
      outline: `Create a detailed outline for a document titled "${docTitle}". Generate 6-12 section headings that provide comprehensive coverage. Return only the headings, one per line, prefixed with ##:\n\nContext: ${content || fullContext || docTitle}`,
      critique: `Analyze this text for:\n1. Gaps in coverage\n2. Logical inconsistencies\n3. Clarity issues\n4. Style improvements\n5. Suggested additions\n\nProvide actionable feedback:\n\n${content}`,
      generate_section: `Write a comprehensive section for the document "${docTitle}". Based on this context/brief:\n\n${content}\n\nWrite 300-600 words of polished ${style} prose.`,
    };

    const systemPrompt = `You are an expert document writer. ${styleInstructions[style] || styleInstructions.technical}

RULES:
- Output ONLY the requested content — no preamble, no meta-commentary
- Maintain consistent voice throughout
- Use proper markdown formatting where appropriate
- Match the quality of a senior professional writer`;

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
          { role: "user", content: actionPrompts[action] || content },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted — add funds in Settings" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ content: aiContent, usage: data.usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[doc-ai-write] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
