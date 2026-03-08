

# Multi-Phase Agentic Pipeline: Draft → Audit → Synthesize

## The Problem

Currently `aim-chat` runs a single-pass pipeline: Plan → Execute tasks → Verify → Reflect → Done. The raw task outputs become the final answer. There's no step where the AI looks at what it produced, considers the user's conversation history, past interactions, and decides "is this actually good enough? do I need to go deeper? what style should I use?"

## The Solution: Three-Phase Pipeline

```text
CURRENT:  Goal → Plan → Execute → Verify → Reflect → [raw output = final answer]

PROPOSED: Goal → Plan → Execute → Verify
            ↓
          AUDIT (Phase 2 — NEW)
            • Review all task outputs holistically
            • Consider conversation history + user patterns
            • Load past run traces for this user's style preferences
            • Decide: go deeper? research more? good enough?
            • Plan next actions (refine, expand, restructure, or proceed)
            ↓
          [If audit says "go deeper"] → Execute additional tasks → Verify
            ↓
          SYNTHESIZE (Phase 3 — NEW)
            • Combine all task outputs into a coherent response
            • Apply user-appropriate tone, style, structure
            • Add follow-up suggestions, caveats, next steps
            • Final quality gate before delivery
            ↓
          Reflect → Evolve (existing)
```

## What Changes

### 1. Edge Function: New Phase 2 — "Audit" (after task execution, before reflection)

After all tasks complete, add a new AI call that receives:
- All task outputs + verification scores
- Full conversation history (not just last message)
- Past run traces for this user (style patterns, complexity preferences)
- Active contradictions from SEG
- CAS cognitive state

The audit AI decides:
- **Quality verdict**: Are the results sufficient or do they need deepening?
- **Next actions**: `proceed` / `research_deeper` / `refine_style` / `expand_scope` / `restructure`
- **Style guidance**: Formal/casual, technical level, structure preferences derived from conversation history
- **Additional tasks**: If `research_deeper` — generates new tasks to execute
- **Synthesis plan**: How to combine outputs into the final reply

This is a new `callAI` with a `audit_and_decide` tool schema that returns structured decisions.

### 2. Edge Function: New Phase 3 — "Synthesize" (after audit, before reflection)

A dedicated AI call that takes:
- All task outputs (including any additional ones from audit)
- The audit's style guidance and synthesis plan
- Conversation history for tone matching

Produces a **single, polished response** that:
- Synthesizes all task outputs into one coherent answer
- Applies the style/tone/depth the audit determined
- Adds follow-up suggestions and open questions
- Formats appropriately (not just concatenated task outputs)

This replaces the current behavior where raw task outputs are the final answer.

### 3. Edge Function: Loop Support

If the audit says "research_deeper" or "expand_scope", the function loops back to execute additional tasks before synthesizing. Capped at 2 audit loops to prevent runaway.

### 4. Frontend: New SSE Events + UI States

New SSE events streamed to the frontend:
- `audit_start` — shows the AI is now reviewing its own work
- `audit_thinking` — audit's internal reasoning (visible in thought stream)
- `audit_decision` — the verdict (proceed/deepen/refine) + next actions
- `synthesis_start` — shows the AI is formulating the final reply
- `synthesis_delta` — the actual polished response streaming
- `synthesis_complete` — done

New RunData fields:
- `auditDecision`: the audit's structured output (verdict, style, next actions)
- `synthesizedResponse`: the final polished answer
- `auditLoops`: how many times the audit looped

New UI in Mission Control:
- **Audit phase indicator** in the phase pipeline (between Verify and Reflect)
- **Synthesize phase** shown as the final "composing reply" step
- The **synthesized response** displayed as the primary answer (not raw task outputs)
- Raw task outputs still visible in expandable task cards

### 5. Frontend: Phase Pipeline Update

Current phases: Memory → Plan → Execute → Verify → Retry → Reflect → Evolve

New phases: Memory → Plan → Execute → Verify → **Audit** → **[Loop?]** → **Synthesize** → Reflect → Evolve

## Technical Details

### Audit Tool Schema
```
audit_and_decide:
  quality_verdict: "sufficient" | "needs_deepening" | "needs_restructuring"
  confidence: number (0-1)
  reasoning: string (internal monologue about what's missing)
  user_style_analysis:
    tone: "formal" | "conversational" | "technical" | "educational"
    detail_preference: "brief" | "thorough" | "exhaustive"
    patterns_observed: string[]
  next_actions: Array<{
    action: "proceed" | "research_deeper" | "refine" | "expand"
    target?: string (which area)
    reason: string
  }>
  additional_tasks?: Array<{ title, prompt, detail_level, acceptance_criteria }>
  synthesis_plan:
    structure: string (how to organize the final response)
    key_points: string[] (must include in synthesis)
    style_notes: string (tone/formatting guidance)
```

### Synthesis Tool Schema
```
synthesize_response:
  response: string (the final polished answer — markdown)
  confidence: number
  follow_up_suggestions: string[]
  caveats: string[]
  metadata: { word_count, sections_count, style_applied }
```

### Audit Loop Cap
- Maximum 2 additional audit loops (so max 3 total execution rounds)
- Each loop's additional tasks are tracked with their own atoms + witnesses
- Budget enforcement: audit loops consume from the same token budget

## Files Modified

1. **`supabase/functions/aim-chat/index.ts`** — Add Phase 2 (Audit) and Phase 3 (Synthesize) between current execution and reflection. Add loop support. Stream new events.

2. **`src/components/AIMChat.tsx`** — Add new SSE event handlers, new RunData fields (`auditDecision`, `synthesizedResponse`), update phase pipeline UI, render synthesized response as primary output, add Audit/Synthesize phase indicators.

## Implementation Order

1. Edge function: Add audit phase with tool call + decision logic
2. Edge function: Add synthesis phase with polished response generation
3. Edge function: Add loop-back for "needs_deepening" decisions
4. Frontend: Add new event handlers and RunData types
5. Frontend: Update phase pipeline and Mission Control to show audit/synthesize
6. Frontend: Render synthesized response as the primary answer in completed runs

