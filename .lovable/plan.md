

# AIM-OS: Full Architecture Evolution Plan

## Current State Assessment

The current implementation is a **flat orchestration loop** with basic memory, verification, and reflection. It's missing the core architectural principles that make AIM-OS what it is:

- **No structured memory** — blobs in tables, no bitemporal atoms, no provenance
- **No trust layer** — no confidence gating, no witness envelopes, no κ-gating
- **No typed orchestration** — flat task loop, no roles/gates/budgets per APOE spec
- **No evidence graph** — knowledge nodes exist but no contradiction detection, no evidence chains
- **No quartet parity** — no code/docs/tests/traces co-evolution tracking
- **No cognitive analysis** — no attention tracking, drift detection, or meta-cognitive monitoring
- **No safety core** — no invariant checks, no manipulation detection

## Architecture: 7 Core Systems to Implement

We will implement the 7 core AIM-OS systems as database-backed services consumed by the edge function and displayed in the dashboard. Each system becomes a **database schema + edge function logic + UI panel**.

```text
┌─────────────────────────────────────────────────────┐
│                    Layer 4: CAS                      │
│            (Meta-Cognitive Monitoring)                │
├─────────────────────────────────────────────────────┤
│                    Layer 3: SDF-CVF                   │
│              (Quartet Parity / Evolution)             │
├───────────┬───────────┬───────────┬─────────────────┤
│   HHNI    │    VIF    │    SEG    │      APOE       │
│ (Retrieval)│  (Trust)  │(Evidence) │ (Orchestration) │
│  Layer 2  │  Layer 2  │  Layer 2  │     Layer 2     │
├───────────┴───────────┴───────────┴─────────────────┤
│                    Layer 1: CMC                       │
│            (Bitemporal Memory Substrate)              │
└─────────────────────────────────────────────────────┘
```

## Phase 1: CMC — Bitemporal Memory Substrate

**Database: `atoms` table**
- `id`, `content`, `content_hash` (SHA-256), `atom_type` (text/code/decision/reflection)
- `transaction_time` (when recorded), `valid_time_start`, `valid_time_end` (when true)
- `provenance` (jsonb — source, confidence, witness_id)
- `metadata` (jsonb), `run_id`, `superseded_by` (uuid, for corrections)

**Database: `memory_snapshots` table**
- `id`, `snapshot_hash` (SHA-256 of all atom hashes), `atom_ids` (uuid[])
- `reason`, `run_id`, `created_at`
- Immutable — no UPDATE/DELETE RLS

**Edge function changes:**
- Every AI operation (plan, execute, verify, reflect) creates atoms with proper temporal bounds
- Snapshots created at run checkpoints
- "As-of" queries: "what did we know at time T?" via `transaction_time` filtering

## Phase 2: VIF — Verifiable Intelligence Framework

**Database: `witness_envelopes` table**
- `id`, `operation_type` (plan/execute/verify/reflect)
- `model_id`, `prompt_hash`, `context_hash`, `response_hash`
- `confidence_score` (0-1), `confidence_band` (A/B/C)
- `kappa_gate_result` (pass/abstain/fail)
- `kappa_threshold` (configurable per operation type)
- `ece_contribution` (float — calibration error tracking)
- `atom_id` (links to CMC atom), `run_id`, `task_id`

**κ-gating logic in edge function:**
- Before every AI output is accepted: compute confidence
- If confidence < κ threshold → **ABSTAIN** — emit "I don't know" / request human input
- Confidence bands: A (≥0.95), B (0.80-0.94), C (<0.80)
- Stream `witness_created` SSE events showing the envelope

**Database: `ece_tracking` table**
- `id`, `run_id`, `predicted_confidence`, `actual_accuracy`, `bin` (for calibration curve)
- Aggregated to compute Expected Calibration Error across runs

## Phase 3: APOE — Typed Orchestration Engine

**Replace flat loop with ACL-typed execution plans:**

**Database: `execution_plans` table**
- `id`, `run_id`, `plan_acl` (jsonb — the typed DAG)
- `status`, `budget_config` (jsonb), `gates_config` (jsonb)

**Database: `plan_steps` table**
- `id`, `plan_id`, `step_type` (retrieve/reason/build/verify/critique)
- `assigned_role` (planner/retriever/reasoner/verifier/builder/critic/operator/witness)
- `budget` (jsonb — tokens, time, tools for this step)
- `gate_before` (jsonb — quality/safety/policy gate config)
- `gate_result` (pass/fail/warn/abstain)
- `input_refs`, `output_refs` (uuid[] — linking to atoms)
- `status`, `started_at`, `completed_at`

**8 Specialized Roles** — each step is assigned a role with specific capabilities:
- **Planner**: Decomposes goals, creates typed DAGs
- **Retriever**: HHNI-powered context fetching
- **Reasoner**: Core analysis and synthesis
- **Verifier**: Acceptance criteria + confidence checking
- **Builder**: Content generation with depth calibration
- **Critic**: Adversarial review of outputs
- **Operator**: Infrastructure/state management
- **Witness**: VIF envelope creation, provenance logging

**Quality/Safety/Policy Gates** between steps:
- Quality gate: VIF confidence ≥ threshold
- Safety gate: SCOR invariant check
- Policy gate: Budget check, risk policy check
- Gate can PASS, FAIL, WARN, or ABSTAIN

## Phase 4: SEG — Shared Evidence Graph

**Enhance existing `knowledge_nodes` / `knowledge_edges`:**

Add to `knowledge_nodes`:
- `evidence_type` (claim/source/derivation/witness)
- `valid_time_start`, `valid_time_end` (bitemporal)
- `confidence` (from VIF), `witness_id`

Add to `knowledge_edges`:
- `edge_type` (supports/contradicts/derives/witnesses/supersedes)
- `strength` (0-1)

**New: `contradictions` table**
- `id`, `node_a_id`, `node_b_id`, `similarity_score`, `stance` (contradicts/weakly_contradicts)
- `resolution` (null/a_wins/b_wins/both_valid), `resolved_by` (run_id)

**Contradiction detection in reflection phase:**
- After knowledge extraction, compare new nodes against existing graph
- Semantic similarity + stance analysis to detect conflicts
- Surface contradictions in UI with resolution options

## Phase 5: SDF-CVF — Quartet Parity (Evolution Tracking)

**Database: `quartet_traces` table**
- `id`, `run_id`, `code_hash`, `docs_hash`, `tests_hash`, `trace_hash`
- `parity_score` (0-1, computed from 6 pairwise similarities)
- `gate_result` (pass if P ≥ 0.90)
- `blast_radius` (jsonb — predicted impact)

**Database: `dora_metrics` table**
- `id`, `run_id`, `deployment_frequency`, `lead_time_seconds`
- `restore_time_seconds`, `change_failure_rate`

**Implementation:**
- After each run, compute quartet parity across outputs
- Track DORA metrics over time
- Dashboard shows parity trends and drift warnings

## Phase 6: CAS — Cognitive Analysis System

**Database: `cognitive_snapshots` table**
- `id`, `run_id`, `task_id`, `cognitive_load` (0-1)
- `attention_breadth` (narrow/normal/wide)
- `active_concepts` (text[]), `cold_concepts` (text[])
- `drift_detected` (boolean), `drift_details` (text)
- `failure_mode` (null/categorization_error/activation_gap/procedure_gap/blind_spot)

**Implementation in edge function:**
- After each task execution, CAS evaluates cognitive state
- Detect attention narrowing, shortcut-taking, activation gaps
- Surface warnings in UI when drift is detected
- Post-run cognitive analysis in reflection phase

## Phase 7: Enhanced Dashboard UI

**Restructure dashboard tabs to reflect the 7-system architecture:**

1. **Mission Control (Chat)** — existing, enhanced with:
   - Witness envelope badges on every AI output
   - κ-gate indicators (confidence band A/B/C)
   - Contradiction alerts from SEG
   - Cognitive load indicator from CAS

2. **Memory (CMC)** — new panel:
   - Atom browser with bitemporal timeline
   - Snapshot explorer
   - "As-of" query interface
   - Provenance chains

3. **Trust (VIF)** — new panel:
   - Witness envelope explorer
   - κ-gate history (pass/abstain/fail ratios)
   - ECE calibration curve
   - Confidence band distribution

4. **Orchestration (APOE)** — enhanced Tasks tab:
   - Typed DAG visualization with roles
   - Gate results inline
   - Budget burn-down per step
   - Role assignment view

5. **Evidence (SEG)** — enhanced Knowledge tab:
   - Evidence graph with contradiction highlighting
   - Claim provenance chains
   - Contradiction resolution interface

6. **Evolution (SDF-CVF)** — enhanced Regression tab:
   - Quartet parity dashboard
   - DORA metrics over time
   - Blast radius predictions

7. **Cognition (CAS)** — new panel:
   - Cognitive load timeline
   - Attention breadth monitor
   - Drift detection alerts
   - Failure mode analysis

## Phase 8: Edge Function Rewrite

The `aim-chat` edge function gets restructured into the proper AIM-OS pipeline:

```text
Goal → APOE (Plan with roles/gates)
  → For each step:
    → HHNI (Retrieve context from CMC atoms)
    → VIF (Create witness, check κ-gate)
    → Execute (role-specific: build/reason/critique)
    → VIF (Witness the output, compute confidence)
    → Gate check (quality/safety/policy)
    → CMC (Store atoms with bitemporal bounds)
    → SEG (Update evidence graph, check contradictions)
    → CAS (Snapshot cognitive state)
  → SDF-CVF (Quartet parity check)
  → Deep Reflection (with CAS meta-cognitive analysis)
  → CMC Snapshot (immutable checkpoint)
```

Every SSE event now carries a `witness_id` linking to the VIF envelope. The UI shows the full provenance chain for any piece of output.

## Database Migrations Required

1. `atoms` + `memory_snapshots` (CMC)
2. `witness_envelopes` + `ece_tracking` (VIF)
3. `execution_plans` + `plan_steps` (APOE)
4. Alter `knowledge_nodes` + `knowledge_edges` + new `contradictions` (SEG)
5. `quartet_traces` + `dora_metrics` (SDF-CVF)
6. `cognitive_snapshots` (CAS)

All tables with RLS policies allowing public read/insert (matching current pattern since there's no auth).

## Implementation Order

1. **CMC + VIF** (foundation — everything depends on structured memory and trust)
2. **APOE rewrite** (typed plans with roles and gates)
3. **SEG enhancement** (contradiction detection)
4. **CAS** (cognitive monitoring)
5. **SDF-CVF** (quartet parity)
6. **Edge function rewrite** (wire everything together)
7. **Dashboard UI** (new panels for each system)

This is a multi-message implementation. Each phase will be thorough, tested, and production-quality.

