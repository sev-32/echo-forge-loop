

## Deep Self-Reflection & Process Evolution for AIM-OS

### Problem
The current system does Plan → Execute → Verify → Reflect, but reflection is superficial — it just summarizes and extracts knowledge nodes. There is no:
- **Process self-evaluation** (was my planning strategy good? did I calibrate detail correctly?)
- **Retry with adjusted strategy** when tasks fail verification
- **Cross-run learning** (loading past reflections/improvements to inform new runs)
- **Self-testing** (AIM-OS testing its own process changes)
- **Meta-cognitive loop** (reflecting on reflections, detecting systemic patterns)

### Plan

#### 1. Backend: Upgrade `aim-chat` edge function with deep self-reflection loop

**A. Retry-with-adaptation loop** — When a task fails verification (score < 70), instead of just marking it failed:
- The system generates a **diagnosis** of why it failed (asking AI to analyze the gap between output and criteria)
- It **re-executes the task** with an adapted prompt that includes the failure diagnosis and specific fix instructions
- Maximum 1 retry per task to stay within budget
- Persists both attempts as events for full auditability

**B. Cross-run memory loading** — Before planning, the system:
- Fetches the last 5 journal entries tagged `reflection` from the database
- Fetches the last 10 `improvements` from past reflections
- Fetches recent knowledge nodes to avoid duplicate work
- Injects all of this into the planner prompt as "lessons from past runs"

**C. Deep reflection phase** — After all tasks complete, the reflection is expanded to include:
- **Process evaluation**: Score the planning quality (was complexity calibration accurate? were tasks well-scoped?)
- **Strategy assessment**: Did the approach work? What would the system change?
- **Pattern detection**: Compare against past reflections to find recurring issues
- **Concrete process rules**: Generate specific rules like "When the goal involves X, always include a task for Y"
- **Self-test proposals**: Suggest specific test cases that would validate the improvements

**D. Process rules table** — A new `process_rules` table stores the rules AIM-OS generates for itself:
- `id`, `rule_text`, `source_run_id`, `confidence` (0-1), `times_applied`, `times_helped`, `active`
- The planner loads active rules and follows them
- After each run, the reflector evaluates which rules were relevant and updates confidence scores

#### 2. Database migration: `process_rules` table

```sql
CREATE TABLE process_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_text text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  source_run_id text,
  confidence real NOT NULL DEFAULT 0.5,
  times_applied integer NOT NULL DEFAULT 0,
  times_helped integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE process_rules ENABLE ROW LEVEL SECURITY;
-- Public read/write for the OS
CREATE POLICY "Rules readable" ON process_rules FOR SELECT USING (true);
CREATE POLICY "Rules insertable" ON process_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Rules updatable" ON process_rules FOR UPDATE USING (true);
```

#### 3. Frontend: Enhanced reflection UI in `AIMChat.tsx`

- **Retry visualization**: When a task retries, show a "Retry" badge with the diagnosis reason, animate the transition from failed → retrying → done/failed
- **Process evaluation panel**: In the reflection section, show the self-assessed planning score, strategy assessment, and detected patterns
- **Process rules display**: Show newly generated rules with confidence scores
- **Cross-run indicator**: Show "Loaded X lessons from past runs" in the plan header when past context was injected

#### 4. Edge function changes (detailed)

The `aim-chat` function flow becomes:

```text
1. LOAD MEMORY
   ├─ Fetch last 5 reflections from journal_entries
   ├─ Fetch active process_rules (top 20 by confidence)
   └─ Fetch recent knowledge_nodes (last 50)

2. PLAN (enhanced prompt includes past lessons + rules)

3. FOR EACH TASK:
   ├─ Execute
   ├─ Verify
   ├─ IF score < 70 AND retries < 1:
   │   ├─ Diagnose failure (AI call)
   │   ├─ Re-execute with diagnosis context
   │   └─ Re-verify
   └─ Persist result

4. DEEP REFLECT
   ├─ Summarize accomplishments
   ├─ Evaluate own planning quality (1-100)
   ├─ Assess strategy effectiveness
   ├─ Compare with past reflections for patterns
   ├─ Generate/update process rules
   ├─ Propose self-test cases
   └─ Persist everything

5. UPDATE RULES
   ├─ Insert new rules
   └─ Update confidence on existing rules that were applied
```

### Technical Details

- New AI calls per run: +1 (diagnosis on retry), +0 if no failures. Deep reflection replaces the existing shallow reflection (same call count, richer prompt).
- Cross-run memory fetch: 3 small DB queries added before planning. Negligible latency.
- New SSE event types: `task_retry_start`, `task_retry_diagnosis`, `process_evaluation`, `rules_generated`
- The process_rules table is small and read-heavy; no performance concern.
- All new data persisted to existing tables (journal_entries, events, knowledge_nodes) plus the new process_rules table.

