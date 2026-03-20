// ============================================
// Polycaste Transform Edge Function
// Multi-Persona Architecture Layer
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PersonaProfile {
  id: string;
  name: string;
  axis_wit: number;
  axis_pedagogy: number;
  axis_formality: number;
  axis_edge: number;
  voice_characteristics: any;
  example_phrases: string[];
}

// SHA256 hashing
async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Call Lovable AI Gateway
async function callAI(apiKey: string, model: string, messages: any[], temperature = 0.7): Promise<{ content: string; tokens: number }> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI call failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    tokens: data.usage?.total_tokens || 0,
  };
}

// Create VIF witness envelope
async function createWitness(supabase: any, params: {
  operationType: string;
  modelId: string;
  prompt: string;
  context: string;
  response: string;
  confidenceScore: number;
  runId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}): Promise<string | null> {
  const promptHash = await sha256(params.prompt);
  const responseHash = await sha256(params.response);
  const contextHash = await sha256(params.context);

  const band = params.confidenceScore >= 0.85 ? 'A' : params.confidenceScore >= 0.70 ? 'B' : 'C';
  const threshold = 0.70;
  const kappaResult = params.confidenceScore >= threshold ? 'pass' : params.confidenceScore >= (threshold - 0.15) ? 'abstain' : 'fail';

  const { data, error } = await supabase.from('witness_envelopes').insert({
    operation_type: params.operationType,
    model_id: params.modelId,
    prompt_hash: promptHash,
    response_hash: responseHash,
    context_hash: contextHash,
    confidence_score: params.confidenceScore,
    confidence_band: band,
    kappa_threshold: threshold,
    kappa_gate_result: kappaResult,
    run_id: params.runId,
    input_tokens: params.inputTokens || 0,
    output_tokens: params.outputTokens || 0,
    latency_ms: params.latencyMs,
    metadata: { polycaste: true },
  }).select('id').single();

  if (error) {
    console.error('Failed to create witness:', error);
    return null;
  }

  return data.id;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { run_id, synthesized_response, user_context, task_outputs, knowledge_graph } = await req.json();

    console.log(`[Polycaste] Starting transformation for run ${run_id}`);

    // ============================================
    // PHASE 1: ENSEMBLE ANALYSIS
    // ============================================
    console.log('[Polycaste] Phase 1: Ensemble Analysis');

    // Archivist Agent - Query CMC atoms + journal entries
    const { data: atoms } = await supabase
      .from('atoms')
      .select('content, atom_type, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: journal } = await supabase
      .from('journal_entries')
      .select('title, content, entry_type')
      .order('created_at', { ascending: false })
      .limit(10);

    const archivistPrompt = `You are the Archivist agent. Review historical patterns and context.

Recent atoms: ${JSON.stringify(atoms || [])}
Recent journal: ${JSON.stringify(journal || [])}

Synthesize relevant historical patterns and insights for this response:
${synthesized_response}

Provide a concise summary of relevant context.`;

    const archivistStart = Date.now();
    const archivistResult = await callAI(LOVABLE_API_KEY, 'google/gemini-3-flash-preview', [
      { role: 'user', content: archivistPrompt }
    ], 0.3);
    const archivistLatency = Date.now() - archivistStart;

    // Researcher Agent - Verify factual claims
    const researcherPrompt = `You are the Researcher agent. Verify factual accuracy.

Knowledge graph: ${JSON.stringify(knowledge_graph || { nodes: [], edges: [] })}
Task outputs: ${JSON.stringify(task_outputs || [])}

Response to verify:
${synthesized_response}

Check for:
1. Factual inconsistencies
2. Contradictions with knowledge graph
3. Unsupported claims

Provide verification notes.`;

    const researcherStart = Date.now();
    const researcherResult = await callAI(LOVABLE_API_KEY, 'google/gemini-3-flash-preview', [
      { role: 'user', content: researcherPrompt }
    ], 0.3);
    const researcherLatency = Date.now() - researcherStart;

    // Synthesizer Agent - Merge insights
    const synthesizerPrompt = `You are the Synthesizer agent. Merge insights from Archivist and Researcher.

Archivist context: ${archivistResult.content}
Researcher grounding: ${researcherResult.content}

Original response: ${synthesized_response}

Create an enriched draft that incorporates historical context and factual grounding while preserving the original message.`;

    const synthesizerStart = Date.now();
    const synthesizerResult = await callAI(LOVABLE_API_KEY, 'google/gemini-3-flash-preview', [
      { role: 'user', content: synthesizerPrompt }
    ], 0.5);
    const synthesizerLatency = Date.now() - synthesizerStart;

    // ============================================
    // PHASE 2: ADVERSARIAL CRUCIBLE
    // ============================================
    console.log('[Polycaste] Phase 2: Adversarial Critique');

    const criticPrompt = `You are the Critic agent. Attack this response for weaknesses.

Response: ${synthesizerResult.content}

Evaluate:
1. Logical fallacies (score 0-100)
2. Factual accuracy (score 0-100)
3. Stylistic quality (score 0-100)
4. Clarity and coherence (score 0-100)

Return JSON:
{
  "overall_score": <number 0-100>,
  "findings": [{ "issue": "...", "severity": "high|medium|low" }],
  "recommendation": "pass|retry"
}`;

    const criticStart = Date.now();
    const criticResult = await callAI(LOVABLE_API_KEY, 'google/gemini-2.5-flash', [
      { role: 'user', content: criticPrompt }
    ], 0.2);
    const criticLatency = Date.now() - criticStart;

    let criticAnalysis;
    try {
      criticAnalysis = JSON.parse(criticResult.content);
    } catch {
      criticAnalysis = {
        overall_score: 70,
        findings: [{ issue: 'Parse error in critic response', severity: 'low' }],
        recommendation: 'pass'
      };
    }

    const criticPassed = criticAnalysis.overall_score >= 70;
    const criticConfidence = criticAnalysis.overall_score / 100;

    const criticWitnessId = await createWitness(supabase, {
      operationType: 'critique',
      modelId: 'google/gemini-2.5-flash',
      prompt: criticPrompt,
      context: synthesizerResult.content.substring(0, 500),
      response: criticResult.content,
      confidenceScore: criticConfidence,
      runId: run_id,
      inputTokens: Math.ceil(criticPrompt.length / 4),
      outputTokens: criticResult.tokens,
      latencyMs: criticLatency,
    });

    // Store ensemble analysis
    const { data: ensembleData } = await supabase.from('ensemble_analyses').insert({
      run_id,
      archivist_context: archivistResult.content,
      researcher_grounding: researcherResult.content,
      synthesizer_draft: synthesizerResult.content,
      critic_findings: criticAnalysis,
      confidence_score: criticConfidence,
      witness_id: criticWitnessId,
    }).select('id').single();

    if (!criticPassed) {
      console.log('[Polycaste] Critic failed, returning draft with warnings');
    }

    // ============================================
    // PHASE 3: PERSONA MAPPING
    // ============================================
    console.log('[Polycaste] Phase 3: Persona Mapping');

    // Calculate target axes from user context
    const conversationLength = user_context?.conversation_history?.length || 0;
    const tonePreference = user_context?.tone_preference || 'balanced';
    
    let targetAxes = {
      wit: 50,
      pedagogy: 70,
      formality: 60,
      edge: 40,
    };

    // Adjust based on tone preference
    if (tonePreference === 'casual') {
      targetAxes = { wit: 70, pedagogy: 50, formality: 30, edge: 40 };
    } else if (tonePreference === 'formal') {
      targetAxes = { wit: 30, pedagogy: 80, formality: 90, edge: 20 };
    } else if (tonePreference === 'witty') {
      targetAxes = { wit: 90, pedagogy: 40, formality: 30, edge: 80 };
    }

    // Fetch persona profiles
    const { data: personas } = await supabase
      .from('persona_profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (!personas || personas.length === 0) {
      throw new Error('No persona profiles found');
    }

    // Find closest persona using Euclidean distance
    let closestPersona: PersonaProfile = personas[0];
    let minDistance = Infinity;

    for (const persona of personas) {
      const distance = Math.sqrt(
        Math.pow(persona.axis_wit - targetAxes.wit, 2) +
        Math.pow(persona.axis_pedagogy - targetAxes.pedagogy, 2) +
        Math.pow(persona.axis_formality - targetAxes.formality, 2) +
        Math.pow(persona.axis_edge - targetAxes.edge, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestPersona = persona;
      }
    }

    console.log(`[Polycaste] Selected persona: ${closestPersona.name} (distance: ${minDistance.toFixed(2)})`);

    // Record persona selection
    await supabase.from('persona_history').insert({
      run_id,
      persona_selected: closestPersona.id,
      axis_scores: targetAxes,
      rationale: `Selected based on user context: ${tonePreference} tone, ${conversationLength} messages in history`,
    });

    // ============================================
    // PHASE 4: VOICE SYNTHESIS
    // ============================================
    console.log('[Polycaste] Phase 4: Voice Synthesis');

    const voicePrompt = `You are a voice transformer. Apply the following persona characteristics:

PERSONA: ${closestPersona.name}
- Wit: ${closestPersona.axis_wit}/100
- Pedagogy: ${closestPersona.axis_pedagogy}/100
- Formality: ${closestPersona.axis_formality}/100
- Edge: ${closestPersona.axis_edge}/100

Voice characteristics: ${JSON.stringify(closestPersona.voice_characteristics)}

Example phrases:
${closestPersona.example_phrases.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Transform this response while preserving all factual content and structure:

${synthesizerResult.content}

IMPORTANT: Keep the same information, just change the delivery style to match the persona.`;

    const voiceStart = Date.now();
    const voiceResult = await callAI(LOVABLE_API_KEY, 'google/gemini-2.5-flash', [
      { role: 'user', content: voicePrompt }
    ], 0.7);
    const voiceLatency = Date.now() - voiceStart;

    const voiceWitnessId = await createWitness(supabase, {
      operationType: 'build',
      modelId: 'google/gemini-2.5-flash',
      prompt: voicePrompt,
      context: synthesizerResult.content.substring(0, 500),
      response: voiceResult.content,
      confidenceScore: 0.85,
      runId: run_id,
      inputTokens: Math.ceil(voicePrompt.length / 4),
      outputTokens: voiceResult.tokens,
      latencyMs: voiceLatency,
    });

    // ============================================
    // RETURN RESULT
    // ============================================
    const result = {
      transformed_response: voiceResult.content,
      persona_used: {
        name: closestPersona.name,
        axis_scores: {
          wit: closestPersona.axis_wit,
          pedagogy: closestPersona.axis_pedagogy,
          formality: closestPersona.axis_formality,
          edge: closestPersona.axis_edge,
        },
      },
      ensemble_analysis_id: ensembleData?.id,
      critic_result: {
        passed: criticPassed,
        score: criticAnalysis.overall_score,
        findings: criticAnalysis.findings,
      },
      confidence: criticConfidence,
      witness_ids: [criticWitnessId, voiceWitnessId].filter(Boolean),
    };

    console.log('[Polycaste] Transformation complete');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Polycaste] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
