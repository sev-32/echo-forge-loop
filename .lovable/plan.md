

# Plan: Self-Evolving AI System with Lovable Cloud + AI Gateway

## Current State
The system has a full orchestration kernel, task queue/DAG, event store, verifier, journal, and test harness -- but everything runs as simulated/stubbed logic in-memory on the client. There is no actual AI inference, no persistence, and no external integrations.

## What Changes

### 1. Enable Lovable Cloud + AI Gateway
Connect the system to real AI inference via Lovable AI Gateway. This is the core upgrade that transforms the orchestration kernel from a simulation into a live self-evolving system.

- **Edge function `ai-step`**: Receives a task + context window, calls Gemini 3 Flash via the gateway with structured tool-calling, returns plan/execution/verification results
- **Edge function `ai-journal`**: Dedicated function for self-reflection -- given recent events + task results, generates journal entries (plans, reflections, corrections, synthesis)
- **Edge function `ai-verify`**: Takes task output + acceptance criteria, returns structured pass/fail with reasoning

### 2. Persistent Storage via Lovable Cloud Database
Move from in-memory stores to persisted tables:

- `events` -- append-only event log with hash chaining
- `snapshots` -- materialized checkpoints
- `tasks` -- task queue with status/priority/dependencies
- `journal_entries` -- AI-generated plans, reflections, discoveries
- `context_banks` -- named context collections with priority pruning
- `test_runs` -- historical test results for regression tracking
- `knowledge_graph` -- relationship edges between insights

### 3. AI-Powered Kernel Loop (the real upgrade)
Replace the stubbed `executePlan` and `createPlan` methods in `OrchestrationKernel` with actual AI calls:

- **Plan step**: Send task prompt + pinned context + working context to AI, get back a structured execution plan with tool calls
- **Execute step**: For each plan step, call AI with step-specific prompt, collect outputs
- **Verify step**: Send outputs + acceptance criteria to AI verifier, get structured results
- **Reflect step** (new): After each task completion or failure, call AI to generate a journal reflection that gets stored and fed into future context windows

### 4. Self-Evolution Feedback Loop
The key architectural addition -- a closed loop where the AI improves its own process:

```text
Task Queue ──> Plan (AI) ──> Execute (AI) ──> Verify (AI)
     ^                                            │
     │         ┌─────────────────────────────┐    │
     └─────────│  Reflect (AI) generates:    │<───┘
               │  - Process notes            │
               │  - Corrections              │
               │  - New hypotheses           │
               │  - Priority adjustments     │
               │  - New tasks to queue       │
               └─────────────────────────────┘
                        │
                        v
               Context Banks (persisted)
               Knowledge Graph (persisted)
```

- After every N tasks, the AI reviews its own journal and generates a "synthesis" entry summarizing patterns
- Process notes from reflections get injected into the system prompt for future tasks
- The AI can create new tasks based on discoveries (self-directed improvement)

### 5. Dynamic Test Evolution
Replace static test specs with AI-generated test scenarios:

- **Edge function `ai-test-gen`**: Given current system capabilities + past test results + knowledge graph, generate new test specs that target weaknesses
- Store generated tests alongside hand-crafted ones
- Track score trajectories over time to measure actual improvement

### 6. Enhanced Dashboard
- **Live AI Activity**: Real-time streaming of AI reasoning as it plans/executes
- **Evolution Timeline**: Visualize how the AI's process notes and knowledge graph grow over time
- **Regression Dashboard**: Score trajectories across test runs with delta highlighting
- **Context Window Inspector**: See exactly what context the AI receives for each step

## Implementation Order

1. Enable Lovable Cloud (database + edge functions)
2. Create database schema (events, tasks, journal, knowledge graph, test runs)
3. Build `ai-step` edge function with Lovable AI Gateway
4. Build `ai-journal` edge function for self-reflection
5. Build `ai-verify` edge function for structured verification
6. Refactor kernel to call edge functions instead of stubs
7. Add persistence layer (read/write to Supabase tables)
8. Build self-evolution feedback loop (reflect -> context banks -> future prompts)
9. Build `ai-test-gen` for dynamic test generation
10. Enhance dashboard with live AI activity streaming and evolution timeline

## Technical Decisions

- **Model**: `google/gemini-3-flash-preview` (default, fast, capable)
- **Structured output**: Tool-calling for all AI responses (plans, verifications, reflections)
- **Streaming**: SSE for live AI activity display in dashboard
- **Context window management**: Server-side assembly -- edge functions pull from DB context banks and assemble optimal context windows per task

