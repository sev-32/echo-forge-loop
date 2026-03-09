

# The Deliberative Polycaste: Multi-Persona Architecture Layer

## Vision & Integration

Build a **final presentation layer** on top of the existing AIM-OS backend that transforms the synthesized response through a **multi-agent ensemble** and **dynamic persona matrix** before delivery. The current system already handles memory (CMC), reasoning (APOE), verification (VIF), and synthesis — this adds the missing piece: **deliberative persona-driven output transformation**.

## Architecture: Three-Stage Pipeline

### Current Flow (Existing)
```
User Goal → Memory Load → Planning → Execution → Verification → Audit → Synthesis → User
```

### New Flow (With Polycaste Layer)
```
User Goal → Memory Load → Planning → Execution → Verification → Audit → Synthesis
    ↓
[POLYCASTE LAYER - NEW]
    ↓
Ensemble Analysis → Adversarial Critique → Persona Mapping → Dynamic Voice Synthesis → User
```

## What Gets Built

### 1. Database Schema (New Tables)

#### `persona_profiles` table
- `id` (uuid, pk)
- `name` (text) - e.g., "Feynman Teacher", "Connery Edge", "Balanced Scholar"
- `axis_wit` (0-100)
- `axis_pedagogy` (0-100)
- `axis_formality` (0-100)
- `axis_edge` (0-100) - sharpness/directness
- `voice_characteristics` (jsonb) - tone markers, vocabulary preferences, sentence structure patterns
- `example_phrases` (text[]) - sample outputs in this voice
- `created_at`, `updated_at`

#### `persona_history` table
- `id` (uuid, pk)
- `run_id` (text)
- `persona_selected` (uuid, fk → persona_profiles)
- `axis_scores` (jsonb) - snapshot of the chosen coordinates
- `rationale` (text) - why this persona was selected
- `user_feedback` (text, nullable)
- `created_at`

#### `ensemble_analyses` table
- `id` (uuid, pk)
- `run_id` (text)
- `archivist_context` (text) - historical retrieval summary
- `researcher_grounding` (text) - factual verification notes
- `synthesizer_draft` (text) - merged baseline
- `critic_findings` (jsonb) - adversarial review results
- `confidence_score` (float)
- `witness_id` (uuid, nullable, fk → witness_envelopes)
- `created_at`

### 2. Edge Function: `polycaste-transform`

**Location**: `supabase/functions/polycaste-transform/index.ts`

**Input**:
```typescript
{
  run_id: string;
  synthesized_response: string;
  user_context: { tone_preference?: string; complexity?: string; conversation_history: Message[] };
  task_outputs: TaskOutput[];
  knowledge_graph: { nodes: Node[]; edges: Edge[] };
}
```

**Process**:
1. **Ensemble Phase** (parallel AI calls):
   - **Archivist Agent**: Query CMC atoms + journal entries for relevant historical patterns
   - **Researcher Agent**: Verify factual claims, check knowledge graph for contradictions
   - **Synthesizer Agent**: Merge archivist + researcher insights into enriched draft
   
2. **Adversarial Crucible Phase**:
   - **Critic Agent**: Attack the synthesized draft
     - Hunt logical fallacies
     - Check factual accuracy against researcher findings
     - Identify stylistic blandness
     - Score: pass (85+), abstain (70-85), fail (<70)
   - If fail: trigger retry with critic feedback
   - Create VIF witness envelope for critique operation
   
3. **Persona Mapping Phase**:
   - Analyze user context + conversation history
   - Score on 4 axes:
     - **Wit** (0-100): humor/playfulness level
     - **Pedagogy** (0-100): teaching/explaining depth
     - **Formality** (0-100): academic vs casual tone
     - **Edge** (0-100): directness/sharpness
   - Query `persona_profiles` for closest match OR interpolate between multiple personas
   - Record choice in `persona_history`
   
4. **Voice Synthesis Phase**:
   - Transform the enriched draft through the selected persona
   - Use AI with persona-specific system prompt:
     ```
     You are a voice transformer. Apply the following persona characteristics:
     Wit: ${wit}/100, Pedagogy: ${pedagogy}/100, Formality: ${formality}/100, Edge: ${edge}/100
     
     Voice characteristics: ${persona.voice_characteristics}
     Example phrases: ${persona.example_phrases}
     
     Transform this response while preserving all factual content and structure.
     ```
   - Create final VIF witness for the transformation

**Output**:
```typescript
{
  transformed_response: string;
  persona_used: { name: string; axis_scores: { wit, pedagogy, formality, edge } };
  ensemble_analysis_id: string;
  critic_result: { passed: boolean; score: number; findings: string[] };
  confidence: number;
  witness_ids: string[];
}
```

### 3. Frontend Components

#### `PersonaControlPanel.tsx` (New)
- **Purpose**: User controls for persona preferences
- **Features**:
  - 4-axis sliders for Wit/Pedagogy/Formality/Edge
  - Preset persona buttons (Feynman, Connery, Balanced, Custom)
  - "Auto-detect from conversation" toggle
  - Visual radar chart showing current persona position
  - History of past persona selections

#### Update `AIMChat.tsx`
- Add "Polycaste Transform" toggle in settings
- Pass user persona preferences to edge function
- Display persona indicator badge in assistant messages
- Add "View ensemble analysis" deep-link to backend trace

#### Update `SwarmPanel.tsx`
- New tab: "Polycaste" showing:
  - Ensemble analysis breakdown (Archivist, Researcher, Synthesizer outputs)
  - Critic findings with pass/fail gates
  - Persona mapping visualization (radar chart)
  - Transformation diff viewer (before/after)

### 4. Integration with Existing Pipeline

#### Update `aim-chat/index.ts`
After synthesis phase (line ~1200), add optional Polycaste call:
```typescript
// PHASE 4: POLYCASTE TRANSFORMATION (optional)
if (userPreferences.enable_polycaste) {
  send({ type: 'thinking', phase: 'polycaste', content: 'Ensemble analysis + persona transformation...' });
  
  const polycasteResponse = await supabase.functions.invoke('polycaste-transform', {
    body: {
      run_id: runId,
      synthesized_response: synthesizedResponse,
      user_context: { tone_preference, complexity, conversation_history: messages },
      task_outputs: taskOutputs,
      knowledge_graph: { nodes, edges }
    }
  });
  
  if (polycasteResponse.data) {
    synthesizedResponse = polycasteResponse.data.transformed_response;
    send({ type: 'polycaste_complete', persona: polycasteResponse.data.persona_used, confidence: polycasteResponse.data.confidence });
  }
}
```

### 5. Default Persona Profiles (Seed Data)

Create 5 default personas via migration:
1. **"Feynman Teacher"**: Wit: 75, Pedagogy: 95, Formality: 40, Edge: 20
   - Characteristics: Analogies, first principles, excitement, accessible language
2. **"Connery Edge"**: Wit: 90, Pedagogy: 30, Formality: 30, Edge: 95
   - Characteristics: Sharp, direct, witty, no fluff, sophisticated vocabulary
3. **"Balanced Scholar"**: Wit: 50, Pedagogy: 70, Formality: 70, Edge: 40
   - Characteristics: Academic tone, structured, thorough, professional
4. **"Casual Guide"**: Wit: 60, Pedagogy: 60, Formality: 20, Edge: 30
   - Characteristics: Friendly, conversational, supportive, modern slang
5. **"Research Deep"**: Wit: 20, Pedagogy: 85, Formality: 90, Edge: 10
   - Characteristics: Technical, exhaustive, citation-heavy, precise

## Implementation Order

1. **Database migrations** (persona tables + seed data)
2. **Edge function**: `polycaste-transform` (ensemble + critique + persona mapping)
3. **Frontend components**: `PersonaControlPanel`, update `SwarmPanel`
4. **Integration**: Add Polycaste call to `aim-chat` synthesis phase
5. **Testing**: Verify ensemble → critique → persona → output flow

## Technical Details

### Ensemble Parallelization
```typescript
const [archivist, researcher] = await Promise.all([
  callAI(LOVABLE_API_KEY, "google/gemini-3-flash-preview", [/* Archivist prompt */]),
  callAI(LOVABLE_API_KEY, "google/gemini-3-flash-preview", [/* Researcher prompt */])
]);

const synthesizer = await callAI(/* merge archivist + researcher */);
const critic = await callAI(/* attack synthesizer output */);
```

### Persona Interpolation
If no exact match, blend closest 2-3 personas:
```typescript
const closestPersonas = findClosest(targetAxes, allPersonas, 3);
const weights = computeWeights(targetAxes, closestPersonas);
const blendedCharacteristics = interpolate(closestPersonas, weights);
```

### VIF Witnessing
Every major operation (ensemble, critique, persona transform) gets a witness:
- Ensemble synthesis: `operation_type: 'build'`
- Adversarial critique: `operation_type: 'critique'`
- Persona transform: `operation_type: 'build'` (final transformation)

## Why This Works

1. **Decouples thought from speech**: Backend reasoning stays clean; presentation layer adds personality
2. **Adversarial quality gate**: Critic prevents bland/inaccurate outputs from reaching user
3. **Dynamic persona**: Adapts to user's immediate emotional/intellectual context
4. **Evidence-based**: Uses CMC atoms + knowledge graph for historical grounding
5. **Auditable**: Every transformation step is witnessed via VIF

## Performance Considerations

- Polycaste adds ~3-5 seconds to response time
- Make it **opt-in** via user preference (default: OFF for simple queries)
- Use `gemini-3-flash-preview` for ensemble agents (fast)
- Use `gemini-2.5-flash` for critic + persona transform (balanced)
- Cache persona profiles in-memory (5 defaults rarely change)

## User Experience

**Before (Current)**:
> Here's a comprehensive analysis of X. [Technical, averaged AI voice]

**After (Polycaste)**:
> *[Feynman persona]* Imagine X as a rubber band — when you stretch it, you're storing potential energy. That's exactly what's happening here, but with data structures instead of rubber...

OR

> *[Connery persona]* Listen carefully. The elegant solution isn't the complex one — it's the one that makes the problem look trivial. Here's what you actually need...

The response content is identical, but the **delivery** is transformed to match the user's context and preferences.

