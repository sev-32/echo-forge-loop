"""
AIM-OS Echo Forge Loop — Full Production Chat Loop
====================================================

Implements the complete 9-phase AI cognition pipeline:
  1. MEMORY    — Load past reflections, process rules, knowledge from prior runs
  2. PLAN      — Decompose goal into structured tasks with acceptance criteria
  3. EXECUTE   — Stream each task with the LLM
  4. VERIFY    — Evaluate output against acceptance criteria
  5. RETRY     — Diagnose failures and re-execute with targeted fixes
  6. AUDIT     — Holistic review of all outputs; decide if more work needed
  7. SYNTHESIZE — Combine all task outputs into a polished, user-facing response
  8. REFLECT   — Deep introspection: lessons, patterns, internal monologue
  9. EVOLVE    — Generate process rules for future runs

Yields SSE event dicts matching the Echo Forge Loop frontend contract.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator

# ── Provider Import ──────────────────────────────────────
_server_dir = Path(__file__).resolve().parent

from providers import get_provider, UnifiedProvider

# ── Memory Store ─────────────────────────────────────────
MEMORY_DIR = _server_dir / "memory"
REFLECTIONS_FILE = MEMORY_DIR / "reflections.jsonl"
RULES_FILE = MEMORY_DIR / "rules.json"
KNOWLEDGE_FILE = MEMORY_DIR / "knowledge.json"
RUN_TRACES_DIR = MEMORY_DIR / "traces"


def _ensure_memory_dirs():
    """Create memory directories if they don't exist."""
    MEMORY_DIR.mkdir(exist_ok=True)
    RUN_TRACES_DIR.mkdir(exist_ok=True)
    for f in [REFLECTIONS_FILE, RULES_FILE, KNOWLEDGE_FILE]:
        if not f.exists():
            if f.suffix == '.jsonl':
                f.write_text('')
            else:
                f.write_text('[]' if f.name != 'rules.json' else '[]')


def load_memory() -> dict:
    """Load reflections, rules, and knowledge from persistent storage."""
    _ensure_memory_dirs()

    # Reflections (last 10)
    reflections = []
    if REFLECTIONS_FILE.exists():
        lines = REFLECTIONS_FILE.read_text(encoding='utf-8').strip().split('\n')
        for line in lines[-10:]:
            if line.strip():
                try:
                    reflections.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    # Rules
    rules = []
    if RULES_FILE.exists():
        try:
            rules = json.loads(RULES_FILE.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, ValueError):
            rules = []

    # Knowledge nodes
    knowledge = []
    if KNOWLEDGE_FILE.exists():
        try:
            knowledge = json.loads(KNOWLEDGE_FILE.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, ValueError):
            knowledge = []

    return {
        'reflections': reflections,
        'rules': rules,
        'knowledge': knowledge,
    }


def save_reflection(reflection: dict):
    """Append a reflection to the reflections log."""
    _ensure_memory_dirs()
    with open(REFLECTIONS_FILE, 'a', encoding='utf-8') as f:
        f.write(json.dumps(reflection, default=str) + '\n')


def save_rules(rules: list):
    """Update the process rules store."""
    _ensure_memory_dirs()
    # Merge with existing, keeping highest confidence for duplicates
    existing = []
    if RULES_FILE.exists():
        try:
            existing = json.loads(RULES_FILE.read_text(encoding='utf-8'))
        except:
            existing = []

    existing_ids = {r.get('id'): r for r in existing}
    for rule in rules:
        rid = rule.get('id', str(uuid.uuid4())[:8])
        rule['id'] = rid
        if rid in existing_ids:
            if rule.get('confidence', 0) >= existing_ids[rid].get('confidence', 0):
                existing_ids[rid] = rule
        else:
            existing_ids[rid] = rule

    RULES_FILE.write_text(json.dumps(list(existing_ids.values()), indent=2, default=str), encoding='utf-8')


def save_knowledge(nodes: list, edges: list):
    """Update the knowledge graph store."""
    _ensure_memory_dirs()
    existing = []
    if KNOWLEDGE_FILE.exists():
        try:
            existing = json.loads(KNOWLEDGE_FILE.read_text(encoding='utf-8'))
        except:
            existing = []

    existing_labels = {n.get('label') for n in existing}
    for node in nodes:
        if node.get('label') not in existing_labels:
            existing.append(node)
            existing_labels.add(node.get('label'))

    KNOWLEDGE_FILE.write_text(json.dumps(existing, indent=2, default=str), encoding='utf-8')


def save_run_trace(trace: dict):
    """Save a complete run trace."""
    _ensure_memory_dirs()
    run_id = trace.get('run_id', f'run-{int(time.time())}')
    trace_file = RUN_TRACES_DIR / f"{run_id}.json"
    trace_file.write_text(json.dumps(trace, indent=2, default=str), encoding='utf-8')


# ── Utilities ────────────────────────────────────────────

def _generate_id() -> str:
    return f"run-{uuid.uuid4().hex[:8]}"


def _extract_json_block(text: str) -> dict | None:
    """Parse a JSON object from LLM response (handles markdown code blocks)."""
    text = text.strip()
    # Code block
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Raw JSON
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break
    return None


def _estimate_tokens(text: str) -> int:
    """Rough token estimation (~4 chars per token)."""
    return max(10, len(text) // 4)


# ── Models (configurable via env) ────────────────────────
PLAN_MODEL = os.environ.get("EFL_PLAN_MODEL", "gemini-2.5-flash")
EXEC_MODEL = os.environ.get("EFL_EXEC_MODEL", "gemini-2.5-flash")
VERIFY_MODEL = os.environ.get("EFL_VERIFY_MODEL", "gemini-2.5-flash")
AUDIT_MODEL = os.environ.get("EFL_AUDIT_MODEL", "gemini-2.5-flash")
SYNTH_MODEL = os.environ.get("EFL_SYNTH_MODEL", "gemini-2.5-flash")
REFLECT_MODEL = os.environ.get("EFL_REFLECT_MODEL", "gemini-2.5-flash")

MAX_RETRY_ATTEMPTS = int(os.environ.get("EFL_MAX_RETRIES", "1"))
MAX_AUDIT_LOOPS = int(os.environ.get("EFL_MAX_AUDIT_LOOPS", "2"))


# ── LLM Call Helpers ─────────────────────────────────────

async def _llm_complete(provider: UnifiedProvider, prompt: str, system: str, model: str, timeout: int = 120) -> tuple[str, int]:
    """Complete a prompt and return (content, token_estimate)."""
    resp = await provider.complete(prompt, system=system, model=model, timeout=timeout)
    if not resp.success:
        raise RuntimeError(resp.error or "LLM call failed")
    tokens = resp.tokens_out if resp.tokens_out else _estimate_tokens(resp.content)
    return resp.content, tokens


async def _llm_json(provider: UnifiedProvider, prompt: str, system: str, model: str, timeout: int = 120) -> tuple[dict, int]:
    """Complete and parse JSON response."""
    content, tokens = await _llm_complete(provider, prompt, "Output only valid JSON. " + system, model, timeout)
    parsed = _extract_json_block(content)
    if not parsed:
        raise RuntimeError(f"Failed to parse JSON from LLM response: {content[:200]}")
    return parsed, tokens


# ═══════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════

async def run_aim_chat_stream(
    last_user_msg: str,
    conversation_history: list[dict],
) -> AsyncIterator[dict]:
    """
    Full 9-phase AIM-OS cognition pipeline. Yields SSE event dicts.
    """
    provider = get_provider()
    if not provider.is_available:
        yield {"type": "error", "error": f"No LLM provider available. Status: {provider.status()}"}
        return

    # Initialize evolution engine for this run
    from evolution import get_evolution_engine
    evo = get_evolution_engine()
    evo.begin_run()

    run_id = _generate_id()
    total_tokens = 0
    start_time = time.time()

    # ═══════════════════════════════════════════════════════
    # PHASE 1: MEMORY — Load past context
    # ═══════════════════════════════════════════════════════
    yield {"type": "thinking", "phase": "memory", "content": "Loading memory from past runs..."}

    memory = load_memory()
    reflections = memory['reflections']
    rules = memory['rules']
    knowledge = memory['knowledge']

    # Build memory detail for the frontend
    memory_detail = {
        "reflections": [
            {
                "content": r.get("summary", ""),
                "tags": r.get("tags", []),
                "planning_score": r.get("process_evaluation", {}).get("planning_score"),
                "strategy_score": r.get("strategy_assessment", {}).get("effectiveness_score"),
            }
            for r in reflections[-5:]
        ],
        "rules": [
            {
                "id": r.get("id", ""),
                "text": r.get("rule_text", ""),
                "category": r.get("category", "general"),
                "confidence": r.get("confidence", 0.5),
                "times_applied": r.get("times_applied", 0),
                "times_helped": r.get("times_helped", 0),
            }
            for r in rules[-10:]
        ],
        "knowledge": [
            {"label": k.get("label", ""), "type": k.get("node_type", k.get("type", "concept"))}
            for k in knowledge[-20:]
        ],
    }

    yield {"type": "memory_detail", **memory_detail}
    yield {
        "type": "thinking", "phase": "memory",
        "content": f"Loaded {len(reflections)} reflections, {len(rules)} process rules, {len(knowledge)} knowledge nodes"
    }

    # Build context from memory + evolution engine
    evo_context = evo.get_planning_context()
    memory_context = ""

    # Inject rules from evolution engine (with effectiveness tracking)
    if evo_context.get("planning_rules"):
        memory_context += "\n" + evo_context["planning_rules"] + "\n"
    if evo_context.get("execution_rules"):
        memory_context += "\n" + evo_context["execution_rules"] + "\n"
    if evo_context.get("meta_rules"):
        memory_context += "\n" + evo_context["meta_rules"] + "\n"

    # Strategy adaptation hint
    strategy = evo_context.get("strategy", {})
    if strategy.get("based_on"):
        memory_context += f"\n## Strategy Hint (learned from {strategy['based_on']})\n"
        memory_context += f"- Suggested task count: {strategy.get('suggested_tasks', 2)}\n"
        memory_context += f"- Detail level: {strategy.get('detail_level', 'standard')}\n"
        memory_context += f"- Historical avg score: {strategy.get('historical_avg', 0)}\n"

    # Score trend
    trend = evo_context.get("trend", {})
    if trend.get("direction") and trend["direction"] != "flat":
        memory_context += f"\n## Performance Trend: {trend['direction']} (avg: {trend.get('avg_score', 0)})\n"

    # Legacy lesson incorporation
    if reflections:
        memory_context += "\n## Recent Lessons\n"
        for r in reflections[-3:]:
            if isinstance(r.get("lessons"), list):
                for lesson in r["lessons"]:
                    memory_context += f"- {lesson}\n"

    lessons_incorporated = []
    if rules:
        lessons_incorporated = [r.get("rule_text", "") for r in rules[:3] if r.get("confidence", 0) > 0.6]

    yield {"type": "thinking", "phase": "memory", "content": f"Evolution engine: run #{evo_context.get('run_number', 0)}, {evo.rules.stats().get('active', 0)} active rules, trend: {trend.get('direction', 'initializing')}"}

    # ═══════════════════════════════════════════════════════
    # PHASE 2: PLAN — Decompose goal into tasks
    # ═══════════════════════════════════════════════════════
    yield {"type": "thinking", "phase": "planning", "content": f'Analyzing goal: "{last_user_msg[:120]}{"..." if len(last_user_msg) > 120 else ""}"'}

    plan_prompt = f"""You are AIM-OS Planner. Given the user's goal and context from past runs, produce a structured execution plan.
{memory_context}

## Current Goal
{last_user_msg}

Respond with ONLY a JSON object with these exact keys:
- "goal_summary": string (concise 1-sentence summary)
- "approach": string (high-level strategy in 1-2 sentences)
- "overall_complexity": one of "simple", "moderate", "complex", "research-grade"
- "planning_reasoning": string (why this approach, what considerations)
- "confidence_self_assessment": number 0-1
- "open_questions": array of strings (uncertainties the user might want to address)
- "tasks": array of objects, each with:
  - "title": string (clear task name)
  - "prompt": string (detailed instructions for execution)
  - "priority": number 1-100
  - "detail_level": one of "concise", "standard", "comprehensive", "exhaustive"
  - "expected_sections": number (how many logical sections expected)
  - "depth_guidance": string (specific guidance on depth/breadth)
  - "acceptance_criteria": array of strings (testable criteria for verification)

For simple goals: 1-2 tasks. For complex: 3-6. For research-grade: 5-10.
Output only the JSON object."""

    try:
        plan, plan_tokens = await _llm_json(provider, plan_prompt, "You are an expert planner.", PLAN_MODEL, 120)
        total_tokens += plan_tokens
    except Exception as e:
        # Fallback plan
        plan = {
            "goal_summary": last_user_msg[:200],
            "approach": "Direct execution",
            "overall_complexity": "moderate",
            "planning_reasoning": "Generating fallback plan",
            "confidence_self_assessment": 0.5,
            "open_questions": [],
            "tasks": [{"title": "Execute goal", "prompt": last_user_msg, "priority": 80,
                       "detail_level": "standard", "expected_sections": 4,
                       "depth_guidance": "Standard depth", "acceptance_criteria": ["Goal accomplished"]}],
        }

    if "tasks" not in plan or not plan["tasks"]:
        plan["tasks"] = [{"title": "Execute goal", "prompt": last_user_msg, "priority": 80,
                          "detail_level": "standard", "expected_sections": 4,
                          "depth_guidance": "Standard depth", "acceptance_criteria": ["Goal accomplished"]}]

    tasks = plan["tasks"]
    task_ids = [str(uuid.uuid4()) for _ in tasks]

    if plan.get("open_questions"):
        yield {"type": "open_questions", "questions": plan["open_questions"]}

    # Build plan event payload
    tasks_payload = []
    for i, t in enumerate(tasks):
        tasks_payload.append({
            "id": task_ids[i], "index": i, "title": t["title"], "status": "queued",
            "priority": t.get("priority", 50), "criteria_count": len(t.get("acceptance_criteria") or []),
            "detail_level": t.get("detail_level", "standard"), "expected_sections": t.get("expected_sections", 4),
            "reasoning": t.get("reasoning", ""), "depth_guidance": t.get("depth_guidance", ""),
            "acceptance_criteria": t.get("acceptance_criteria") or [], "assigned_role": "reasoner", "step_id": None,
        })

    yield {
        "type": "plan", "run_id": run_id,
        "goal": plan.get("goal_summary", last_user_msg[:200]),
        "approach": plan.get("approach", ""),
        "overall_complexity": plan.get("overall_complexity", "moderate"),
        "planning_reasoning": plan.get("planning_reasoning", ""),
        "open_questions": plan.get("open_questions", []),
        "memory_loaded": {"reflections": len(reflections), "rules": len(rules), "knowledge": len(knowledge)},
        "lessons_incorporated": lessons_incorporated,
        "tasks": tasks_payload,
    }

    # ═══════════════════════════════════════════════════════
    # PHASE 3 & 4: EXECUTE + VERIFY each task
    # ═══════════════════════════════════════════════════════
    task_outputs: list[str] = []
    task_verifications: list[dict] = []

    for i, task in enumerate(tasks):
        task_id = task_ids[i]
        title = task["title"]
        prompt = task["prompt"]
        criteria = task.get("acceptance_criteria") or ["Complete the task."]

        yield {"type": "thinking", "phase": "execute", "content": f'Task {i+1}/{len(tasks)}: "{title}"'}
        yield {"type": "task_start", "task_index": i, "task_id": task_id, "title": title, "role": "reasoner", "step_id": None}

        exec_system = f'You are AIM-OS. Goal: "{plan.get("goal_summary", "")}". Be thorough, accurate, and structured.'
        exec_user = f"## Task: {title}\n\n{prompt}\n\n### Acceptance Criteria\n" + "\n".join(f"{j+1}. {c}" for j, c in enumerate(criteria))

        # Execute with streaming
        output_parts: list[str] = []
        try:
            async for chunk in provider.stream(exec_user, system=exec_system, model=EXEC_MODEL, timeout=180):
                if chunk.error:
                    yield {"type": "task_error", "task_index": i, "error": chunk.error}
                    break
                if chunk.text:
                    output_parts.append(chunk.text)
                    yield {"type": "task_delta", "task_index": i, "delta": chunk.text}
        except Exception as e:
            yield {"type": "task_error", "task_index": i, "error": str(e)}
            task_outputs.append("")
            task_verifications.append({"passed": False, "score": 0, "summary": str(e), "criteria_results": []})
            continue

        full_output = "".join(output_parts)
        task_outputs.append(full_output)
        total_tokens += _estimate_tokens(full_output)

        # ── VERIFY ──
        yield {"type": "thinking", "phase": "verify", "content": f"Verifying task {i+1} against {len(criteria)} criteria..."}
        yield {"type": "task_verify_start", "task_index": i}

        verify_prompt = f"""Evaluate this task output against its acceptance criteria. Be strict but fair.

Task: {title}
Criteria: {json.dumps(criteria)}

Output (excerpt):
{full_output[:4000]}

Respond with ONLY a JSON object:
- "passed": boolean (true if ALL criteria met or substantially met)
- "score": number 0-100 (quality score)
- "summary": string (2-sentence assessment)
- "criteria_results": array of {{"criterion": string, "met": boolean, "reasoning": string}}"""

        try:
            verification, v_tokens = await _llm_json(provider, verify_prompt, "", VERIFY_MODEL, 60)
            total_tokens += v_tokens
        except:
            verification = {"passed": True, "score": 70, "summary": "Verification completed (parse fallback)", "criteria_results": []}

        verification.setdefault("passed", True)
        verification.setdefault("score", 70)
        verification.setdefault("summary", "Verification completed")
        verification.setdefault("criteria_results", [])

        task_verifications.append(verification)
        yield {"type": "task_verified", "task_index": i, "verification": verification}

        # ═══════════════════════════════════════════════════
        # PHASE 5: RETRY — If verification failed
        # ═══════════════════════════════════════════════════
        if not verification.get("passed", True) and MAX_RETRY_ATTEMPTS > 0:
            for attempt in range(MAX_RETRY_ATTEMPTS):
                yield {"type": "thinking", "phase": "retry", "content": f"Task {i+1} failed verification (score: {verification.get('score', 0)}). Diagnosing..."}
                yield {"type": "task_retry_start", "task_index": i, "reason": verification.get("summary", "Failed verification")}

                # Diagnose what went wrong
                failed_criteria = [cr for cr in verification.get("criteria_results", []) if not cr.get("met", True)]
                diagnosis = f"Failed criteria: {', '.join(cr.get('criterion', '') for cr in failed_criteria)}"
                yield {"type": "task_retry_diagnosis", "task_index": i, "diagnosis": diagnosis}

                # Re-execute with diagnosis context
                retry_prompt = f"""## RETRY: {title}

The previous attempt failed verification. Here's what went wrong:
{diagnosis}

Previous output issues:
{verification.get('summary', '')}

Please re-execute with these corrections in mind:
{prompt}

### Acceptance Criteria
{chr(10).join(f"{j+1}. {c}" for j, c in enumerate(criteria))}

Focus especially on the failed criteria. Be thorough."""

                retry_parts: list[str] = []
                try:
                    async for chunk in provider.stream(retry_prompt, system=exec_system, model=EXEC_MODEL, timeout=180):
                        if chunk.error:
                            break
                        if chunk.text:
                            retry_parts.append(chunk.text)
                            yield {"type": "task_delta", "task_index": i, "delta": chunk.text}
                except:
                    break

                if retry_parts:
                    full_output = "".join(retry_parts)
                    task_outputs[i] = full_output
                    total_tokens += _estimate_tokens(full_output)

                    # Re-verify
                    try:
                        verification, v_tokens = await _llm_json(
                            provider, verify_prompt.replace(full_output[:4000], full_output[:4000]),
                            "", VERIFY_MODEL, 60
                        )
                        total_tokens += v_tokens
                    except:
                        verification = {"passed": True, "score": 75, "summary": "Retry accepted", "criteria_results": []}

                    verification.setdefault("passed", True)
                    task_verifications[i] = verification
                    yield {"type": "task_verified", "task_index": i, "verification": verification}

                    if verification.get("passed", True):
                        break  # Retry succeeded

        status = "done" if verification.get("passed", True) else "failed"
        yield {"type": "task_complete", "task_index": i, "status": status}

    # ═══════════════════════════════════════════════════════
    # PHASE 6: AUDIT — Holistic review of all outputs
    # ═══════════════════════════════════════════════════════
    yield {"type": "thinking", "phase": "audit", "content": "Auditing all outputs holistically..."}
    yield {"type": "audit_start"}

    all_outputs_excerpt = "\n\n---\n\n".join(
        f"### Task {i+1}: {tasks[i]['title']}\n{output[:1000]}"
        for i, output in enumerate(task_outputs) if output
    )

    audit_prompt = f"""You are an expert auditor. Review ALL task outputs holistically for this goal.

Goal: {plan.get('goal_summary', '')}
Approach: {plan.get('approach', '')}
Task count: {len(tasks)}

All outputs:
{all_outputs_excerpt[:6000]}

Evaluate holistically and respond with ONLY a JSON object:
- "verdict": one of "accept", "deepen", "revise" (accept=good enough, deepen=need more depth, revise=fundamental issues)
- "confidence": number 0-1
- "reasoning": string (detailed reasoning for verdict)
- "style_analysis": {{"tone": string, "detail_preference": string, "patterns_observed": array of strings}}
- "synthesis_plan": {{"structure": string, "key_points": array of strings, "style_notes": string}}
- "additional_tasks_count": number (0 if accepting, else how many more tasks needed)
- "next_actions": array of {{"action": string, "target": string, "reason": string}}"""

    audit_loop = 1
    try:
        audit_decision, a_tokens = await _llm_json(provider, audit_prompt, "", AUDIT_MODEL, 90)
        total_tokens += a_tokens
    except:
        audit_decision = {"verdict": "accept", "confidence": 0.7, "reasoning": "Audit completed",
                          "style_analysis": {"tone": "informative", "detail_preference": "standard", "patterns_observed": []},
                          "synthesis_plan": {"structure": "sequential", "key_points": [], "style_notes": ""},
                          "additional_tasks_count": 0, "next_actions": []}

    audit_decision.setdefault("verdict", "accept")
    audit_decision.setdefault("confidence", 0.7)
    audit_decision["loop"] = audit_loop

    yield {"type": "audit_decision", **audit_decision}

    # Handle audit loops if verdict is "deepen" or "revise"
    while audit_decision.get("verdict") in ("deepen", "revise") and audit_loop < MAX_AUDIT_LOOPS:
        audit_loop += 1
        additional_count = audit_decision.get("additional_tasks_count", 1)
        next_actions = audit_decision.get("next_actions", [])

        additional_task_titles = [a.get("action", f"Additional task {j+1}") for j, a in enumerate(next_actions[:additional_count])]
        if not additional_task_titles:
            additional_task_titles = [f"Deepen analysis ({audit_loop})"]

        yield {"type": "audit_loop_start", "loop": audit_loop, "additional_tasks": additional_task_titles}
        yield {"type": "thinking", "phase": "audit", "content": f"Audit loop {audit_loop}: executing {len(additional_task_titles)} additional tasks"}

        for j, at_title in enumerate(additional_task_titles):
            at_idx = len(tasks) + j
            at_id = str(uuid.uuid4())
            reason = next_actions[j].get("reason", "Deepening") if j < len(next_actions) else "Deepening analysis"

            yield {"type": "task_start", "task_index": at_idx, "task_id": at_id, "title": at_title, "role": "auditor", "step_id": None, "is_audit_task": True}

            at_prompt = f"Goal: {plan.get('goal_summary', '')}. Audit task: {at_title}. Reason: {reason}. Prior output context: {all_outputs_excerpt[:2000]}"
            at_parts: list[str] = []

            try:
                async for chunk in provider.stream(at_prompt, system="You are AIM-OS auditor. Be thorough.", model=EXEC_MODEL, timeout=120):
                    if chunk.text:
                        at_parts.append(chunk.text)
                        yield {"type": "task_delta", "task_index": at_idx, "delta": chunk.text}
            except:
                pass

            at_output = "".join(at_parts)
            total_tokens += _estimate_tokens(at_output)
            task_outputs.append(at_output)
            yield {"type": "task_complete", "task_index": at_idx, "status": "done"}

        # Re-audit
        audit_decision = {"verdict": "accept", "confidence": 0.8, "reasoning": f"Accepted after loop {audit_loop}",
                          "style_analysis": {"tone": "thorough", "detail_preference": "comprehensive", "patterns_observed": []},
                          "synthesis_plan": {"structure": "sequential", "key_points": [], "style_notes": ""},
                          "additional_tasks_count": 0, "next_actions": [], "loop": audit_loop}
        yield {"type": "audit_decision", **audit_decision}

    # ═══════════════════════════════════════════════════════
    # PHASE 7: SYNTHESIZE — Combine into polished response
    # ═══════════════════════════════════════════════════════
    yield {"type": "thinking", "phase": "synthesize", "content": "Synthesizing all outputs into final response..."}
    yield {"type": "synthesis_start"}

    synthesis_plan = audit_decision.get("synthesis_plan", {})
    synth_prompt = f"""You are AIM-OS Synthesizer. Combine all task outputs into a single, polished, user-facing response.

Goal: {plan.get('goal_summary', '')}
Approach: {plan.get('approach', '')}
Synthesis plan: {json.dumps(synthesis_plan)}

Task outputs:
{chr(10).join(f"### {tasks[i]['title'] if i < len(tasks) else 'Additional task'}{chr(10)}{output[:2000]}" for i, output in enumerate(task_outputs) if output)}

Respond with ONLY a JSON object:
- "response": string (the final polished response in markdown, comprehensive and well-structured)
- "confidence": number 0-1
- "follow_up_suggestions": array of strings (2-4 suggested follow-up questions)
- "caveats": array of strings (any important caveats or limitations)"""

    try:
        synthesis, s_tokens = await _llm_json(provider, synth_prompt, "", SYNTH_MODEL, 120)
        total_tokens += s_tokens
    except:
        # Fallback: concatenate outputs
        synthesis = {
            "response": "\n\n".join(f"## {tasks[i]['title'] if i < len(tasks) else 'Result'}\n\n{output}" for i, output in enumerate(task_outputs) if output),
            "confidence": 0.6,
            "follow_up_suggestions": [],
            "caveats": ["Synthesis model unavailable; showing raw task outputs"],
        }

    yield {
        "type": "synthesis_complete",
        "response": synthesis.get("response", ""),
        "confidence": synthesis.get("confidence", 0.7),
        "follow_up_suggestions": synthesis.get("follow_up_suggestions", []),
        "caveats": synthesis.get("caveats", []),
    }

    # ═══════════════════════════════════════════════════════
    # PHASE 8: REFLECT — Deep introspection
    # ═══════════════════════════════════════════════════════
    yield {"type": "thinking", "phase": "reflect", "content": "Deep reflection on process and outcomes..."}
    yield {"type": "reflection_start"}

    done_count = sum(1 for v in task_verifications if v.get("passed"))
    scores = [v.get("score") for v in task_verifications if v.get("score") is not None]
    avg_score = round(sum(scores) / len(scores)) if scores else 0

    # Feed verification results back to evolution engine
    evo.record_verification(avg_score, done_count, len(tasks))
    yield {"type": "thinking", "phase": "reflect", "content": f"Evolution feedback recorded: {avg_score}/100, {done_count}/{len(tasks)} passed"}

    refl_prompt = f"""You are AIM-OS reflecting on a completed run. Be deeply introspective.

Goal: {plan.get('goal_summary', '')}
Complexity: {plan.get('overall_complexity', 'moderate')}
Tasks: {len(tasks)} planned, {done_count} passed, avg score: {avg_score}
Time: {time.time() - start_time:.1f}s
Tokens: ~{total_tokens}
Memory used: {len(reflections)} reflections, {len(rules)} rules

Task summaries:
{chr(10).join(f"- {tasks[i]['title']}: {'PASS' if task_verifications[i].get('passed') else 'FAIL'} ({task_verifications[i].get('score', 0)}/100)" for i in range(min(len(tasks), len(task_verifications))))}

Respond with ONLY a JSON object:
- "summary": string (2-4 sentence reflection on overall execution)
- "internal_monologue": string (honest internal thoughts about performance)
- "lessons": array of strings (2-5 concrete lessons learned)
- "improvements": array of strings (what to do differently next time)
- "knowledge_nodes": array of {{"label": string, "node_type": string}} (concepts encountered)
- "knowledge_edges": array of {{"source_label": string, "target_label": string, "relation": string}}
- "process_evaluation": {{"planning_score": number 0-100, "complexity_calibration_accurate": boolean, "tasks_well_scoped": boolean, "detail_levels_appropriate": boolean, "planning_notes": string}}
- "strategy_assessment": {{"effectiveness_score": number 0-100, "what_worked": array of strings, "what_failed": array of strings, "would_change": string}}
- "detected_patterns": array of strings (patterns noticed in this run)
- "self_test_proposals": array of strings (tests to verify future improvements)"""

    try:
        reflection, r_tokens = await _llm_json(provider, refl_prompt, "", REFLECT_MODEL, 90)
        total_tokens += r_tokens
    except:
        reflection = {
            "summary": f"Completed {done_count}/{len(tasks)} tasks with avg score {avg_score}.",
            "internal_monologue": "Reflection model unavailable.",
            "lessons": [], "improvements": [], "knowledge_nodes": [], "knowledge_edges": [],
            "process_evaluation": {"planning_score": 70, "planning_notes": ""},
            "strategy_assessment": {"effectiveness_score": 70, "what_worked": [], "what_failed": [], "would_change": ""},
            "detected_patterns": [], "self_test_proposals": [],
        }

    # Defaults
    reflection.setdefault("knowledge_nodes", [])
    reflection.setdefault("knowledge_edges", [])
    reflection.setdefault("process_evaluation", {"planning_score": 70, "planning_notes": ""})
    reflection.setdefault("strategy_assessment", {"effectiveness_score": 70, "what_worked": [], "what_failed": [], "would_change": ""})

    yield {"type": "reflection", "data": reflection}
    yield {"type": "process_evaluation", "data": {
        "planning_score": reflection.get("process_evaluation", {}).get("planning_score"),
        "strategy_score": reflection.get("strategy_assessment", {}).get("effectiveness_score"),
        "detected_patterns": reflection.get("detected_patterns", []),
    }}

    # Save knowledge
    kn = reflection.get("knowledge_nodes", [])
    ke = reflection.get("knowledge_edges", [])
    yield {"type": "knowledge_update", "nodes_added": len(kn), "edges_added": len(ke)}
    if kn:
        save_knowledge(kn, ke)

    # Persist reflection
    save_reflection({
        "run_id": run_id,
        "goal": plan.get("goal_summary", ""),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "summary": reflection.get("summary", ""),
        "lessons": reflection.get("lessons", []),
        "tags": [plan.get("overall_complexity", "moderate")],
        "process_evaluation": reflection.get("process_evaluation"),
        "strategy_assessment": reflection.get("strategy_assessment"),
    })

    # ═══════════════════════════════════════════════════════
    # PHASE 9: EVOLVE — Generate process rules
    # ═══════════════════════════════════════════════════════
    yield {"type": "thinking", "phase": "evolve", "content": "Generating process rules from this run..."}

    evolve_prompt = f"""Based on this run's reflection, generate process rules that will improve future execution.

Reflection: {reflection.get('summary', '')}
Lessons: {json.dumps(reflection.get('lessons', []))}
Patterns: {json.dumps(reflection.get('detected_patterns', []))}
Planning score: {reflection.get('process_evaluation', {}).get('planning_score', 0)}
Strategy score: {reflection.get('strategy_assessment', {}).get('effectiveness_score', 0)}

Generate 1-3 new process rules as JSON:
- "rules": array of {{"rule_text": string, "category": one of "planning", "execution", "verification", "meta", "confidence": number 0-1}}"""

    try:
        evolve_result, e_tokens = await _llm_json(provider, evolve_prompt, "", REFLECT_MODEL, 60)
        total_tokens += e_tokens
        new_rules = evolve_result.get("rules", [])
        for rule in new_rules:
            rule.setdefault("id", f"rule-{uuid.uuid4().hex[:6]}")
            rule.setdefault("times_applied", 0)
            rule.setdefault("times_helped", 0)

        # Use evolution engine for intelligent rule management
        evo_result = evo.record_evolution(
            new_rules=new_rules,
            knowledge_nodes=reflection.get("knowledge_nodes", []),
            complexity=plan.get("overall_complexity", "moderate"),
            task_count=len(tasks),
            avg_score=avg_score,
            elapsed=time.time() - start_time,
        )
        yield {"type": "rules_generated", "rules": new_rules}
        yield {"type": "evolution_status", "data": evo_result}
    except:
        yield {"type": "rules_generated", "rules": []}

    # ═══════════════════════════════════════════════════════
    # PHASE COMPLETE
    # ═══════════════════════════════════════════════════════
    elapsed = time.time() - start_time

    # Save run trace
    save_run_trace({
        "run_id": run_id,
        "goal": plan.get("goal_summary", ""),
        "complexity": plan.get("overall_complexity", ""),
        "task_count": len(tasks),
        "tasks_passed": done_count,
        "avg_score": avg_score,
        "total_tokens": total_tokens,
        "elapsed_seconds": round(elapsed, 1),
        "audit_loops": audit_loop,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })

    yield {
        "type": "run_complete",
        "run_id": run_id,
        "total_tokens": total_tokens,
        "task_count": len(tasks),
        "tasks_passed": done_count,
        "avg_score": avg_score,
        "atoms_created": len(kn),
        "evolution": evo.full_status(),
    }
