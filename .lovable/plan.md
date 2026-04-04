

# ION v2: Sovereign Cognitive Kernel — Implementation Plan

## Vision (Adapted to Platform)

The ION document describes a *state-transition operating system for machine cognition*. The existing AIM-OS `aim-chat` edge function is a monolithic 1825-line pipeline — powerful but inflexible. ION v2 will be a **modular, daemon-governed kernel** built as a set of independent edge functions that can run alongside v1, share the same database tables, and be tested/invoked independently.

### What ION v2 IS within Lovable's constraints:
- A set of **Supabase edge functions** (the daemon, protocol workers, reconciliation)
- New **database tables** for ION-specific state (work_units, context_packages, commit_deltas, open_questions, signals, authority_classes)
- A **frontend panel** for ION control, work-unit inspection, and authority visualization
- Fully independent from v1 — both can coexist, same DB

### What we CANNOT do (platform limits):
- No persistent server process (daemon is invoked per-request, maintains state in DB)
- No real filesystem access (filesystem = database rows with authority classification)
- No WebSocket daemon loop (use polling + realtime subscriptions instead)

---

## Architecture

```text
┌─────────────────────────────────────────────────┐
│                  FRONTEND (React)                │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ ION Panel│  │ WorkUnit  │  │  Authority   │  │
│  │ (Daemon  │  │ Inspector │  │  Viewer      │  │
│  │  Control)│  │           │  │              │  │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘  │
│       │              │               │           │
├───────┼──────────────┼───────────────┼───────────┤
│       ▼              ▼               ▼           │
│  ┌─────────────────────────────────────────────┐ │
│  │     supabase.functions.invoke()             │ │
│  └──────────────────┬──────────────────────────┘ │
└─────────────────────┼────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  ┌──────────┐ ┌───────────┐ ┌───────────┐
  │ion-daemon│ │ion-worker │ │ion-recon  │
  │(sequencer│ │(protocol  │ │(reconcile │
  │ + router)│ │ executor) │ │ + merge)  │
  └────┬─────┘ └─────┬─────┘ └─────┬─────┘
       │             │             │
       ▼             ▼             ▼
  ┌──────────────────────────────────────┐
  │         Supabase Database            │
  │  work_units | context_packages |     │
  │  commit_deltas | open_questions |    │
  │  signals | authority_registry |      │
  │  ion_runs | ion_artifacts |          │
  │  + existing v1 tables (atoms, etc.)  │
  └──────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Database Schema — ION Kernel Tables

New migration creating ION-specific tables:

- **`ion_runs`** — A run session (run_id, status, autonomy_mode, priority_tier, created_at, stopped_at, metadata)
- **`ion_work_units`** — The schedulable unit of cognition (id, run_id, protocol, shard_index, status, dependencies, allowed_writes, output_contract, priority, context_package_id, assigned_at, completed_at)
- **`ion_context_packages`** — Versioned bounded cognitive input per work unit (id, work_unit_id, version, doctrine_refs, artifact_refs, open_question_refs, allowed_actions, created_at, content_hash)
- **`ion_commit_deltas`** — Proposed mutations from workers (id, work_unit_id, run_id, status [proposed/accepted/rejected/witness_only], artifacts_created, ledger_rows, questions_raised, signals_emitted, contradictions_found, confidence, reviewed_by, reviewed_at)
- **`ion_open_questions`** — First-class unresolved dependencies (id, run_id, question, source_work_unit_id, status [open/answered/deferred], answer, priority, routed_to_work_unit_id)
- **`ion_signals`** — Machine-readable state messages between lanes (id, run_id, signal_type, source_work_unit_id, target_protocol, payload, consumed)
- **`ion_artifacts`** — Files/outputs with authority classification (id, run_id, name, content, authority_class [AUTHORITY/WITNESS/PLAN/AUDIT/GENERATED_STATE/STALE_COMPETITOR], version, superseded_by, content_hash, created_by_work_unit_id)

All tables get RLS disabled (service-role only access from edge functions).

### Step 2: Edge Function — `ion-daemon`

The sovereign sequencer. Single entry point that:

1. **Receives** a goal or `step` command
2. **Computes legal next transitions** from current DB state (blockers, deps, context freshness, open questions, contradiction severity)
3. **Issues WorkUnits** with ContextPackages
4. **Reviews CommitDeltas** from workers — accepts, rejects, or downgrades to witness-only
5. **Routes OpenQuestions** to appropriate future work units
6. **Propagates Signals** between protocol lanes
7. **Enforces priority tiers**: Hard blockers > Protocol obligations > Densification > Expansion

Key daemon actions exposed:
- `start_run(goal, config)` — Initialize ION run, create initial RECONNAISSANCE work units
- `step()` — Compute and execute one legal transition
- `run_to_completion(max_steps)` — Loop step() with budget
- `review_delta(delta_id, verdict)` — Manual override for commit review
- `get_state()` — Current kernel state snapshot

### Step 3: Edge Function — `ion-worker`

Protocol-bound executor. Receives a WorkUnit + ContextPackage, executes under a specific protocol template, returns a CommitDelta.

Supported protocols (Phase 1):
- **RECONNAISSANCE** — Map the surface without synthesizing. Returns inventory + batch plan.
- **EVIDENCE** — Atomic forensic extraction from one artifact. Returns exact observations.
- **CONSOLIDATION** — Cross-artifact synthesis. Reads evidence artifacts, derives fingerprints + lineage.
- **REVIEW** — Validate a CommitDelta. Check authority, lineage, contradictions.
- **SIGNAL** — Emit structured propagation messages.

Each protocol has a specialized system prompt + tool-calling schema that enforces the cognitive contract. The worker NEVER writes directly — it returns a CommitDelta for daemon review.

### Step 4: Edge Function — `ion-recon`

Reconciliation engine for distributed/sharded work:
- Merges overlapping CommitDeltas from parallel shards
- Answers OpenQuestions by cross-referencing completed work units
- Detects unbound claims across shards
- Decides which contradictions remain live vs resolved

### Step 5: Frontend — ION Control Panel

New tab in the LeftRail: **"ION"** (with a custom kernel/hexagon icon).

Sub-panels:
- **Daemon Control** — Start/step/stop ION runs, see priority tier queue, current blockers
- **Work Unit Inspector** — Browse all work units, their protocol, status, context package, commit delta
- **Authority Registry** — View all artifacts by authority class (AUTHORITY vs WITNESS vs PLAN etc.) with visual distinction
- **Open Questions** — Live list of unresolved dependencies, their routing status
- **Signal Bus** — View signals between protocol lanes
- **Contradiction Map** — Active contradictions with stance and resolution path

### Step 6: Frontend Hook — `useIONKernel`

React hook that:
- Invokes `ion-daemon` edge function for start/step/stop
- Subscribes to realtime changes on `ion_work_units`, `ion_commit_deltas`, `ion_open_questions`
- Provides state to the ION panel components

---

## Technical Details

### Daemon State Machine (implemented in DB, not memory)

```text
RUN_CREATED → RECONNAISSANCE → EVIDENCE_PASS → CONSOLIDATION
    ↓                                              ↓
 BLOCKED ←── REVIEW ←── SIGNAL ←── CONTRADICTION
    ↓                                              ↓
 RECONCILIATION → DENSIFICATION → EXPANSION → COMPLETE
```

### Protocol-to-Model Mapping
- RECONNAISSANCE: `google/gemini-3-flash-preview` (fast, broad)
- EVIDENCE: `google/gemini-2.5-flash` (precise extraction)
- CONSOLIDATION: `google/gemini-2.5-pro` (deep synthesis)
- REVIEW: `google/gemini-2.5-flash` (validation)

### Authority Class Visual System
- **AUTHORITY**: Solid blue border, lock icon
- **WITNESS**: Dashed amber border, eye icon
- **PLAN**: Green outline, compass icon
- **AUDIT**: Purple outline, shield icon
- **GENERATED_STATE**: Gray, gear icon
- **STALE_COMPETITOR**: Red strikethrough, warning icon

### Coexistence with v1
- v1 (`aim-chat`) continues working unchanged on the "Intelligence" tab
- ION v2 gets its own tab, own run tracking, own edge functions
- Both write to shared tables where useful (atoms, knowledge_nodes, events)
- ION can READ v1's atoms/knowledge for cross-system memory

---

## Build Order

1. **Database migration** — All ION tables (single migration)
2. **`ion-daemon` edge function** — Core sequencer with start_run + step + get_state
3. **`ion-worker` edge function** — RECONNAISSANCE + EVIDENCE protocols first
4. **`useIONKernel` hook** — Frontend state management
5. **ION Panel** — Daemon control + work unit inspector
6. **`ion-worker` protocols** — Add CONSOLIDATION, REVIEW, SIGNAL
7. **`ion-recon` edge function** — Reconciliation engine
8. **Authority Registry + Open Questions panels** — Full UI
9. **Cross-system bridge** — ION reading v1 atoms/knowledge

This is approximately 8-10 implementation messages to complete the full system.

