"""
Echo Forge Loop — Deep Research Skill
=======================================

Multi-phase research pipeline that:
  1. DECOMPOSE — Break query into sub-questions with angles and priorities
  2. RESEARCH  — Investigate each sub-question via LLM
  3. CROSS-REF — Compare findings for contradictions, agreements, gaps
  4. SYNTHESIZE — Generate a final research report
  5. PERSIST   — Save findings to knowledge graph

SSE Event Contract (matches deep-research.ts):
  - phase:                 { type: "phase", phase: string, message: string }
  - decomposition:         { type: "decomposition", main_thesis, sub_questions, ... }
  - sub_research_start:    { type: "sub_research_start", index: number, question, angle }
  - sub_research_complete: { type: "sub_research_complete", index: number, finding: {...} }
  - cross_reference:       { type: "cross_reference", agreements, contradictions, gaps, ... }
  - report:                { type: "report", content: string }
  - complete:              { type: "complete", run_id, sub_questions, findings_count, ... }
  - error:                 { type: "error", message: string }
"""
from __future__ import annotations

import json
import time
import uuid
from typing import AsyncIterator

from providers import get_provider, UnifiedProvider


async def run_deep_research(
    query: str,
    depth: str = "standard",
    run_id: str | None = None,
) -> AsyncIterator[dict]:
    """
    Execute a multi-phase deep research pipeline.
    Yields SSE event dicts matching the frontend contract.

    Args:
        query: The research question or topic
        depth: "standard" (3-5 sub-questions) or "deep" (6-10 sub-questions)
        run_id: Optional run ID for tracing
    """
    provider = get_provider()
    if not provider.is_available:
        yield {"type": "error", "message": "No LLM provider available"}
        return

    run_id = run_id or f"dr-{uuid.uuid4().hex[:8]}"
    start_time = time.time()
    total_tokens = 0

    sub_q_count = "5-8" if depth == "deep" else "3-5"

    # ═══════════════════════════════════════════════════════
    # PHASE 1: DECOMPOSE — Break into sub-questions
    # ═══════════════════════════════════════════════════════
    yield {"type": "phase", "phase": "decompose", "message": "Decomposing research query into sub-questions..."}

    decompose_prompt = f"""You are a research strategist. Decompose this research query into focused sub-questions.

Research Query: {query}

Generate {sub_q_count} sub-questions that, when answered, provide a comprehensive understanding.

Respond with ONLY a JSON object:
- "main_thesis": string (the central thesis or question being explored)
- "sub_questions": array of {{"question": string, "angle": string (the perspective being examined, e.g. "historical", "technical", "comparative", "theoretical", "evidence-based", "counter-argument"), "priority": number 1-5}}
- "research_scope": string (boundaries of the research)
- "key_domains": array of strings (relevant knowledge domains)"""

    try:
        resp = await provider.complete(decompose_prompt, system="You are a research strategist. Output only valid JSON.", timeout=90)
        if not resp.success:
            yield {"type": "error", "message": f"Decomposition failed: {resp.error}"}
            return
        total_tokens += resp.tokens_out or len(resp.content) // 4

        decomposition = _extract_json(resp.content)
        if not decomposition:
            yield {"type": "error", "message": "Failed to parse decomposition"}
            return

        decomposition.setdefault("main_thesis", query)
        decomposition.setdefault("sub_questions", [])
        decomposition.setdefault("research_scope", "general")
        decomposition.setdefault("key_domains", [])

    except Exception as e:
        yield {"type": "error", "message": f"Decomposition error: {str(e)}"}
        return

    yield {"type": "decomposition", **decomposition}

    sub_questions = decomposition.get("sub_questions", [])
    if not sub_questions:
        yield {"type": "error", "message": "No sub-questions generated"}
        return

    # ═══════════════════════════════════════════════════════
    # PHASE 2: RESEARCH — Investigate each sub-question
    # ═══════════════════════════════════════════════════════
    yield {"type": "phase", "phase": "research", "message": f"Researching {len(sub_questions)} sub-questions..."}

    findings = []
    for idx, sq in enumerate(sub_questions):
        question = sq.get("question", "")
        angle = sq.get("angle", "general")

        yield {"type": "sub_research_start", "index": idx, "question": question, "angle": angle}

        research_prompt = f"""You are a {angle} researcher. Investigate this specific question thoroughly.

Main Topic: {decomposition.get('main_thesis', query)}
Sub-Question: {question}
Research Angle: {angle}

Provide a detailed, evidence-based analysis. Consider multiple perspectives.

Respond with ONLY a JSON object:
- "question": string (the original question)
- "angle": string ("{angle}")
- "summary": string (2-3 sentence executive summary)
- "detailed_analysis": string (detailed markdown analysis, 200-500 words)
- "confidence": number 0-1 (confidence in findings)
- "key_facts": array of strings (3-6 key facts discovered)
- "uncertainties": array of strings (areas of uncertainty)
- "connections": array of strings (connections to other sub-questions)"""

        try:
            resp = await provider.complete(research_prompt, system="You are a deep researcher. Output only valid JSON.", timeout=120)
            total_tokens += resp.tokens_out or len(resp.content) // 4

            if resp.success:
                finding = _extract_json(resp.content)
                if finding:
                    finding.setdefault("question", question)
                    finding.setdefault("angle", angle)
                    finding.setdefault("summary", "Research completed.")
                    finding.setdefault("detailed_analysis", resp.content[:500])
                    finding.setdefault("confidence", 0.7)
                    finding.setdefault("key_facts", [])
                    finding.setdefault("uncertainties", [])
                    finding.setdefault("connections", [])
                    findings.append(finding)
                    yield {"type": "sub_research_complete", "index": idx, "finding": finding}
                else:
                    # Fallback: use raw content
                    fallback_finding = {
                        "question": question,
                        "angle": angle,
                        "summary": resp.content[:200],
                        "detailed_analysis": resp.content,
                        "confidence": 0.5,
                        "key_facts": [],
                        "uncertainties": ["Could not parse structured response"],
                        "connections": [],
                    }
                    findings.append(fallback_finding)
                    yield {"type": "sub_research_complete", "index": idx, "finding": fallback_finding}
            else:
                yield {"type": "sub_research_complete", "index": idx, "finding": {
                    "question": question, "angle": angle,
                    "summary": f"Research failed: {resp.error}",
                    "detailed_analysis": "", "confidence": 0.0,
                    "key_facts": [], "uncertainties": [resp.error or "Unknown error"],
                    "connections": [],
                }}
        except Exception as e:
            yield {"type": "sub_research_complete", "index": idx, "finding": {
                "question": question, "angle": angle,
                "summary": f"Error: {str(e)}",
                "detailed_analysis": "", "confidence": 0.0,
                "key_facts": [], "uncertainties": [str(e)],
                "connections": [],
            }}

    # ═══════════════════════════════════════════════════════
    # PHASE 3: CROSS-REFERENCE — Compare findings
    # ═══════════════════════════════════════════════════════
    yield {"type": "phase", "phase": "cross_reference", "message": "Cross-referencing findings for contradictions and connections..."}

    findings_summary = "\n\n".join(
        f"[{f.get('angle', 'general')}] {f.get('question', '')}\nSummary: {f.get('summary', '')}\nKey Facts: {', '.join(f.get('key_facts', []))}"
        for f in findings
    )

    cross_ref_prompt = f"""You are an analytical reviewer. Cross-reference these research findings for a query about: {decomposition.get('main_thesis', query)}

Findings:
{findings_summary}

Identify agreements, contradictions, gaps, and emergent insights.

Respond with ONLY a JSON object:
- "agreements": array of strings (where findings agree)
- "contradictions": array of {{"claim_a": string, "claim_b": string, "resolution": string}}
- "gaps": array of strings (important areas not covered)
- "emergent_insights": array of strings (new insights from combining findings)
- "overall_confidence": number 0-1 (overall research confidence)"""

    try:
        resp = await provider.complete(cross_ref_prompt, system="You are an analytical reviewer. Output only valid JSON.", timeout=90)
        total_tokens += resp.tokens_out or len(resp.content) // 4

        cross_reference = _extract_json(resp.content) if resp.success else None
        if not cross_reference:
            cross_reference = {
                "agreements": [], "contradictions": [], "gaps": [],
                "emergent_insights": [], "overall_confidence": 0.5,
            }
        cross_reference.setdefault("agreements", [])
        cross_reference.setdefault("contradictions", [])
        cross_reference.setdefault("gaps", [])
        cross_reference.setdefault("emergent_insights", [])
        cross_reference.setdefault("overall_confidence", 0.5)

    except Exception as e:
        cross_reference = {
            "agreements": [], "contradictions": [], "gaps": [str(e)],
            "emergent_insights": [], "overall_confidence": 0.3,
        }

    yield {"type": "cross_reference", **cross_reference}

    # ═══════════════════════════════════════════════════════
    # PHASE 4: SYNTHESIZE — Generate final report
    # ═══════════════════════════════════════════════════════
    yield {"type": "phase", "phase": "synthesize", "message": "Synthesizing research into final report..."}

    synth_prompt = f"""You are a research writer. Synthesize all findings into a comprehensive research report.

Main Topic: {decomposition.get('main_thesis', query)}
Research Scope: {decomposition.get('research_scope', 'general')}
Key Domains: {', '.join(decomposition.get('key_domains', []))}

Findings:
{findings_summary}

Cross-Reference Analysis:
- Agreements: {json.dumps(cross_reference.get('agreements', []))}
- Contradictions: {json.dumps(cross_reference.get('contradictions', []))}
- Gaps: {json.dumps(cross_reference.get('gaps', []))}
- Emergent Insights: {json.dumps(cross_reference.get('emergent_insights', []))}

Write a comprehensive research report in markdown format. Include:
1. Executive Summary
2. Key Findings (organized by theme, not by sub-question)
3. Analysis & Insights
4. Contradictions & Unresolved Questions
5. Conclusions
6. Recommendations for Further Research

Write the full report directly, not as JSON."""

    try:
        resp = await provider.complete(synth_prompt, system="You are a research writer. Write in clear, professional markdown.", timeout=180)
        total_tokens += resp.tokens_out or len(resp.content) // 4

        report = resp.content if resp.success else "Report generation failed."
    except Exception as e:
        report = f"Report synthesis error: {str(e)}"

    yield {"type": "report", "content": report}

    # ═══════════════════════════════════════════════════════
    # PHASE 5: PERSIST — Full provenance save
    # ═══════════════════════════════════════════════════════
    yield {"type": "phase", "phase": "persist", "message": "Persisting ALL research artifacts with full provenance..."}

    elapsed = time.time() - start_time

    # ── Save complete research artifact ──
    research_dir = Path(__file__).resolve().parent.parent / "memory" / "research"
    research_dir.mkdir(parents=True, exist_ok=True)

    research_artifact = {
        "run_id": run_id,
        "query": query,
        "depth": depth,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "elapsed_seconds": round(elapsed, 1),
        "total_tokens": total_tokens,
        "decomposition": decomposition,
        "findings": findings,
        "cross_reference": cross_reference,
        "report": report,
        "meta": {
            "sub_questions": len(sub_questions),
            "findings_count": len(findings),
            "contradictions_count": len(cross_reference.get("contradictions", [])),
            "overall_confidence": cross_reference.get("overall_confidence", 0.5),
            "gaps": cross_reference.get("gaps", []),
        },
    }

    # Save full research artifact as JSON
    artifact_path = research_dir / f"{run_id}.json"
    artifact_path.write_text(
        json.dumps(research_artifact, indent=2, default=str),
        encoding="utf-8"
    )

    # Save the synthesized report as standalone markdown
    report_path = research_dir / f"{run_id}_report.md"
    report_header = (
        f"# Research Report: {decomposition.get('main_thesis', query)}\n\n"
        f"> **Run ID:** {run_id}  \n"
        f"> **Query:** {query}  \n"
        f"> **Depth:** {depth}  \n"
        f"> **Sub-questions:** {len(sub_questions)}  \n"
        f"> **Findings:** {len(findings)}  \n"
        f"> **Confidence:** {cross_reference.get('overall_confidence', 0.5):.0%}  \n"
        f"> **Elapsed:** {round(elapsed, 1)}s  \n"
        f"> **Generated:** {time.strftime('%Y-%m-%d %H:%M:%S')}  \n\n"
        f"---\n\n"
    )
    report_path.write_text(report_header + report, encoding="utf-8")

    # ── Save to knowledge graph via evolution engine ──
    try:
        from evolution import get_evolution_engine, log_evolution_event
        evo = get_evolution_engine()

        # Convert findings to knowledge nodes
        knowledge_nodes = []
        for f in findings:
            knowledge_nodes.append({
                "label": f.get("question", "")[:100],
                "node_type": "research_finding",
                "angle": f.get("angle", "general"),
                "confidence": f.get("confidence", 0.5),
                "source_run": run_id,
            })
            for fact in f.get("key_facts", [])[:3]:
                knowledge_nodes.append({
                    "label": fact[:100],
                    "node_type": "fact",
                    "source_run": run_id,
                })

        added = evo.knowledge.add_nodes(knowledge_nodes)

        # ── Save run trace for RunAnalytics ──
        traces_dir = Path(__file__).resolve().parent.parent / "memory" / "traces"
        traces_dir.mkdir(parents=True, exist_ok=True)
        trace = {
            "run_id": run_id,
            "type": "deep_research",
            "query": query,
            "depth": depth,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "elapsed_seconds": round(elapsed, 1),
            "total_tokens": total_tokens,
            "avg_score": round(cross_reference.get("overall_confidence", 0.5) * 100),
            "task_count": len(sub_questions),
            "tasks_passed": len([f for f in findings if f.get("confidence", 0) >= 0.5]),
            "complexity": "complex" if depth == "deep" else "moderate",
            "knowledge_nodes_added": added,
            "artifacts": [str(artifact_path), str(report_path)],
        }
        trace_path = traces_dir / f"{run_id}.json"
        trace_path.write_text(
            json.dumps(trace, indent=2, default=str),
            encoding="utf-8"
        )

        # Log the evolution event
        log_evolution_event("deep_research_complete", {
            "run_id": run_id,
            "query": query[:100],
            "findings": len(findings),
            "knowledge_added": added,
            "confidence": cross_reference.get("overall_confidence", 0.5),
            "artifact_path": str(artifact_path),
            "report_path": str(report_path),
            "trace_path": str(trace_path),
        })

    except Exception:
        added = 0

    # ═══════════════════════════════════════════════════════
    # COMPLETE
    # ═══════════════════════════════════════════════════════

    yield {
        "type": "complete",
        "run_id": run_id,
        "sub_questions": len(sub_questions),
        "findings_count": len(findings),
        "contradictions_count": len(cross_reference.get("contradictions", [])),
        "overall_confidence": cross_reference.get("overall_confidence", 0.5),
        "gaps": cross_reference.get("gaps", []),
        "knowledge_nodes_added": added,
        "elapsed_seconds": round(elapsed, 1),
        "total_tokens": total_tokens,
        "artifacts_saved": {
            "research_json": str(artifact_path),
            "report_md": str(report_path),
            "trace_json": str(trace_path) if 'trace_path' in dir() else None,
        },
    }


# ── Helpers ──────────────────────────────────────────────

import re

def _extract_json(text: str) -> dict | None:
    """Parse JSON from LLM response (handles markdown code blocks)."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
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
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        break
    return None
