"""First-pass context compiler for the active ION kernel stack.

This helper compiles real ContextPackage objects from explicit inputs and, when
requested, uses the current index/graph stack to resolve related open questions for a
work unit. It does not claim the full daemon-driven compiler pipeline exists yet.
"""

from __future__ import annotations

from dataclasses import dataclass, is_dataclass, replace
from datetime import datetime
import hashlib
import json
from typing import Any

from .graph import GraphEdgeType, KernelGraph
from .index import KernelIndex
from .model import (
    AgentIdentity,
    ContextPackage,
    ContextTiers,
    DependencyInterface,
    KernelRecord,
    OpenQuestion,
    OpenQuestionStatus,
    PriorFinding,
    SemanticOverlay,
    TargetFile,
    TierFiveDependencies,
    TierFourSemantic,
    TierOneDoctrine,
    TierThreeMission,
    TierTwoTarget,
    WorkUnit,
)


@dataclass(frozen=True)
class ContextCompileRequest(KernelRecord):
    work_unit: WorkUnit
    doctrine: TierOneDoctrine
    target_files: tuple[TargetFile, ...]
    task_payload: str
    objective: str
    agent_identity: AgentIdentity | None = None
    semantic_overlays: tuple[SemanticOverlay, ...] = ()
    prior_findings: tuple[PriorFinding, ...] = ()
    open_questions: tuple[str, ...] = ()
    dependency_interfaces: tuple[DependencyInterface, ...] = ()
    token_budget: int = 4000
    output_schema: str | None = None
    context_package_id: str | None = None
    compiled_at: str | None = None


class ContextCompilerError(Exception):
    """Raised when one context compilation request cannot be satisfied."""


def compile_context_package(request: ContextCompileRequest) -> ContextPackage:
    """Compile one ContextPackage deterministically from explicit bounded inputs."""

    work_unit = request.work_unit
    agent_identity = request.agent_identity or _agent_identity_from_work_unit(work_unit)
    compiled_at = request.compiled_at or _iso_now()
    tier_3_mission = TierThreeMission(
        task_payload=request.task_payload,
        objective=request.objective,
        output_schema=request.output_schema or work_unit.expected_output_schema,
    )
    tier_4_semantic = TierFourSemantic(
        semantic_overlays=request.semantic_overlays,
        prior_findings=request.prior_findings,
        open_questions=request.open_questions,
    )
    tier_5_dependencies = TierFiveDependencies(
        dependency_interfaces=request.dependency_interfaces,
    )
    dropped: list[str] = []

    while True:
        candidate_tiers = ContextTiers(
            tier_1_doctrine=request.doctrine,
            tier_2_target=TierTwoTarget(target_files=request.target_files),
            tier_3_mission=tier_3_mission,
            tier_4_semantic=tier_4_semantic,
            tier_5_dependencies=tier_5_dependencies,
        )
        actual_tokens = _estimate_context_tokens(
            work_unit=work_unit,
            agent_identity=agent_identity,
            tiers=candidate_tiers,
            token_budget=request.token_budget,
            tiers_dropped=tuple(dropped),
        )
        if actual_tokens <= request.token_budget:
            break

        next_drop = _next_drop(tier_4_semantic, tier_5_dependencies, tier_3_mission)
        if next_drop is None:
            break

        drop_label, tier_4_semantic, tier_5_dependencies, tier_3_mission = next_drop(
            tier_4_semantic,
            tier_5_dependencies,
            tier_3_mission,
        )
        dropped.append(drop_label)

    tiers = ContextTiers(
        tier_1_doctrine=request.doctrine,
        tier_2_target=TierTwoTarget(target_files=request.target_files),
        tier_3_mission=tier_3_mission,
        tier_4_semantic=tier_4_semantic,
        tier_5_dependencies=tier_5_dependencies,
    )
    context_version = _context_version_for(
        work_unit=work_unit,
        agent_identity=agent_identity,
        tiers=tiers,
    )
    context_package_id = request.context_package_id or f"cp-{work_unit.work_unit_id}-{context_version[:12]}"
    actual_tokens = _estimate_context_tokens(
        work_unit=work_unit,
        agent_identity=agent_identity,
        tiers=tiers,
        token_budget=request.token_budget,
        tiers_dropped=tuple(dropped),
    )
    return ContextPackage(
        context_package_id=context_package_id,
        context_version=context_version,
        compiled_at=compiled_at,
        work_unit_id=work_unit.work_unit_id,
        protocol_id=work_unit.protocol_id,
        transition_id=work_unit.transition_id,
        agent_identity=agent_identity,
        tiers=tiers,
        token_budget=request.token_budget,
        actual_tokens=actual_tokens,
        tiers_dropped=tuple(dropped),
        allowed_writes=work_unit.allowed_writes,
        allowed_next_actions=work_unit.allowed_next_actions,
        must_not=work_unit.must_not,
    )


def compile_context_package_for_work_unit(
    index: KernelIndex,
    graph: KernelGraph,
    work_unit_id: str,
    *,
    doctrine: TierOneDoctrine,
    target_files: tuple[TargetFile, ...],
    task_payload: str,
    objective: str,
    semantic_overlays: tuple[SemanticOverlay, ...] = (),
    prior_findings: tuple[PriorFinding, ...] = (),
    dependency_interfaces: tuple[DependencyInterface, ...] = (),
    token_budget: int = 4000,
    output_schema: str | None = None,
    agent_identity: AgentIdentity | None = None,
    context_package_id: str | None = None,
    compiled_at: str | None = None,
) -> ContextPackage:
    """Compile for one stored work unit, resolving related questions from the stack."""

    work_unit = index.get("work_unit", work_unit_id)
    if not isinstance(work_unit, WorkUnit):
        raise ContextCompilerError(f"Work unit not found in index: {work_unit_id}")

    return compile_context_package(
        ContextCompileRequest(
            work_unit=work_unit,
            doctrine=doctrine,
            target_files=target_files,
            task_payload=task_payload,
            objective=objective,
            agent_identity=agent_identity,
            semantic_overlays=semantic_overlays,
            prior_findings=prior_findings,
            open_questions=_resolve_open_question_texts(index, graph, work_unit),
            dependency_interfaces=dependency_interfaces,
            token_budget=token_budget,
            output_schema=output_schema,
            context_package_id=context_package_id,
            compiled_at=compiled_at,
        )
    )


def render_context_package_text(context_package: ContextPackage) -> str:
    """Render one compiled package into a readable deterministic text surface."""

    lines = [
        "# COMPILED CONTEXT PACKAGE",
        "",
        f"- context_package_id: {context_package.context_package_id}",
        f"- context_version: {context_package.context_version}",
        f"- work_unit_id: {context_package.work_unit_id}",
        f"- protocol_id: {context_package.protocol_id}",
        f"- transition_id: {context_package.transition_id}",
        f"- actual_tokens: {context_package.actual_tokens}",
        f"- token_budget: {context_package.token_budget}",
        "",
        "## Agent Identity",
        "",
        f"- personal_name: {context_package.agent_identity.personal_name}",
        f"- role: {context_package.agent_identity.role}",
        f"- structural_identity: {context_package.agent_identity.structural_identity}",
        f"- tier: {context_package.agent_identity.tier}",
        f"- domain: {context_package.agent_identity.domain}",
        f"- specialty: {context_package.agent_identity.specialty}",
        "",
        "## Tier 1 Doctrine",
        "",
        context_package.tiers.tier_1_doctrine.constitution_excerpt,
        "",
        context_package.tiers.tier_1_doctrine.template_spec,
        "",
        "## Tier 2 Target",
        "",
    ]
    for target_file in context_package.tiers.tier_2_target.target_files:
        lines.extend(
            [
                f"- file: {target_file.path}",
                f"  language: {target_file.language or 'unknown'}",
                f"  line_count: {target_file.line_count}",
            ]
        )
    lines.extend(
        [
            "",
            "## Tier 3 Mission",
            "",
            f"- objective: {context_package.tiers.tier_3_mission.objective}",
            f"- output_schema: {context_package.tiers.tier_3_mission.output_schema or 'none'}",
            context_package.tiers.tier_3_mission.task_payload or "[task payload dropped]",
            "",
            "## Tier 4 Semantic",
            "",
        ]
    )
    for overlay in context_package.tiers.tier_4_semantic.semantic_overlays:
        lines.append(f"- semantic_overlay: {overlay.path}")
    for finding in context_package.tiers.tier_4_semantic.prior_findings:
        lines.append(f"- prior_finding: {finding.source} ({finding.confidence:.2f})")
    for question in context_package.tiers.tier_4_semantic.open_questions:
        lines.append(f"- open_question: {question}")
    lines.extend(["", "## Tier 5 Dependencies", ""])
    for dependency in context_package.tiers.tier_5_dependencies.dependency_interfaces:
        lines.append(f"- dependency_interface: {dependency.path}")
    return "\n".join(lines)


def _resolve_open_question_texts(
    index: KernelIndex,
    graph: KernelGraph,
    work_unit: WorkUnit,
) -> tuple[str, ...]:
    resolved: list[str] = []
    seen: set[str] = set()

    for candidate in work_unit.open_questions_in_scope:
        text = _question_text_from_scope_value(index, candidate)
        if text and text not in seen:
            seen.add(text)
            resolved.append(text)

    for record in index.records_for_work_unit(work_unit.work_unit_id):
        if isinstance(record, OpenQuestion) and record.status in (
            OpenQuestionStatus.OPEN,
            OpenQuestionStatus.ASSIGNED,
        ):
            if record.question_text not in seen:
                seen.add(record.question_text)
                resolved.append(record.question_text)

    work_node = graph.node_id("work_unit", work_unit.work_unit_id)
    for question_node in graph.predecessors(work_node, GraphEdgeType.BLOCKS_WORK):
        if not question_node.startswith("open_question:"):
            continue
        question_id = question_node.split(":", 1)[1]
        question = index.get("open_question", question_id)
        if isinstance(question, OpenQuestion) and question.status in (
            OpenQuestionStatus.OPEN,
            OpenQuestionStatus.ASSIGNED,
        ):
            if question.question_text not in seen:
                seen.add(question.question_text)
                resolved.append(question.question_text)

    return tuple(resolved)


def _question_text_from_scope_value(index: KernelIndex, candidate: str) -> str:
    if index.exists("open_question", candidate):
        question = index.get("open_question", candidate)
        if isinstance(question, OpenQuestion):
            return question.question_text
    return candidate


def _agent_identity_from_work_unit(work_unit: WorkUnit) -> AgentIdentity:
    return AgentIdentity(
        personal_name=work_unit.agent_personal_name,
        role=work_unit.agent_role,
        structural_identity=work_unit.agent_structural_id,
        tier=work_unit.agent_tier,
        domain=work_unit.agent_domain,
        specialty=work_unit.agent_role,
    )


def _estimate_context_tokens(
    *,
    work_unit: WorkUnit,
    agent_identity: AgentIdentity,
    tiers: ContextTiers,
    token_budget: int,
    tiers_dropped: tuple[str, ...],
) -> int:
    rendered = _render_compilation_payload(
        work_unit=work_unit,
        agent_identity=agent_identity,
        tiers=tiers,
        token_budget=token_budget,
        tiers_dropped=tiers_dropped,
    )
    return max(1, len(rendered) // 4)


def _context_version_for(
    *,
    work_unit: WorkUnit,
    agent_identity: AgentIdentity,
    tiers: ContextTiers,
) -> str:
    payload = {
        "work_unit_id": work_unit.work_unit_id,
        "protocol_id": work_unit.protocol_id,
        "transition_id": work_unit.transition_id,
        "agent_identity": _plain(agent_identity),
        "tiers": _plain(tiers),
        "allowed_writes": work_unit.allowed_writes,
        "allowed_next_actions": work_unit.allowed_next_actions,
        "must_not": work_unit.must_not,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _render_compilation_payload(
    *,
    work_unit: WorkUnit,
    agent_identity: AgentIdentity,
    tiers: ContextTiers,
    token_budget: int,
    tiers_dropped: tuple[str, ...],
) -> str:
    payload = {
        "work_unit_id": work_unit.work_unit_id,
        "protocol_id": work_unit.protocol_id,
        "transition_id": work_unit.transition_id,
        "agent_identity": _plain(agent_identity),
        "tiers": _plain(tiers),
        "token_budget": token_budget,
        "tiers_dropped": tiers_dropped,
        "allowed_writes": work_unit.allowed_writes,
        "allowed_next_actions": work_unit.allowed_next_actions,
        "must_not": work_unit.must_not,
    }
    return json.dumps(payload, sort_keys=True)


def _plain(value: Any) -> Any:
    if is_dataclass(value):
        return {
            field_name: _plain(field_value)
            for field_name, field_value in value.to_dict().items()
        }
    if isinstance(value, tuple):
        return [_plain(item) for item in value]
    if isinstance(value, list):
        return [_plain(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _plain(item) for key, item in value.items()}
    return value


def _next_drop(
    tier_4_semantic: TierFourSemantic,
    tier_5_dependencies: TierFiveDependencies,
    tier_3_mission: TierThreeMission,
):
    if tier_5_dependencies.dependency_interfaces:
        return _drop_largest_dependency
    if (
        tier_4_semantic.semantic_overlays
        or tier_4_semantic.prior_findings
        or tier_4_semantic.open_questions
    ):
        return _drop_largest_semantic_item
    if tier_3_mission.task_payload:
        return _drop_task_payload
    return None


def _drop_largest_dependency(
    tier_4_semantic: TierFourSemantic,
    tier_5_dependencies: TierFiveDependencies,
    tier_3_mission: TierThreeMission,
):
    dependencies = list(tier_5_dependencies.dependency_interfaces)
    target = max(dependencies, key=lambda item: len(item.signatures_only))
    dependencies.remove(target)
    return (
        f"tier_5_dependencies:{target.path}",
        tier_4_semantic,
        replace(tier_5_dependencies, dependency_interfaces=tuple(dependencies)),
        tier_3_mission,
    )


def _drop_largest_semantic_item(
    tier_4_semantic: TierFourSemantic,
    tier_5_dependencies: TierFiveDependencies,
    tier_3_mission: TierThreeMission,
):
    candidates: list[tuple[int, str, str]] = []
    candidates.extend(
        (len(item.content), "semantic_overlay", item.path)
        for item in tier_4_semantic.semantic_overlays
    )
    candidates.extend(
        (len(item.summary), "prior_finding", item.source)
        for item in tier_4_semantic.prior_findings
    )
    candidates.extend(
        (len(item), "open_question", item)
        for item in tier_4_semantic.open_questions
    )
    _, item_kind, item_value = max(candidates, key=lambda item: item[0])

    if item_kind == "semantic_overlay":
        semantic_overlays = tuple(
            item for item in tier_4_semantic.semantic_overlays if item.path != item_value
        )
        updated = replace(tier_4_semantic, semantic_overlays=semantic_overlays)
    elif item_kind == "prior_finding":
        prior_findings = tuple(
            item for item in tier_4_semantic.prior_findings if item.source != item_value
        )
        updated = replace(tier_4_semantic, prior_findings=prior_findings)
    else:
        open_questions = list(tier_4_semantic.open_questions)
        open_questions.remove(item_value)
        updated = replace(tier_4_semantic, open_questions=tuple(open_questions))

    return (
        f"tier_4_semantic:{item_kind}:{item_value}",
        updated,
        tier_5_dependencies,
        tier_3_mission,
    )


def _drop_task_payload(
    tier_4_semantic: TierFourSemantic,
    tier_5_dependencies: TierFiveDependencies,
    tier_3_mission: TierThreeMission,
):
    return (
        "tier_3_mission:task_payload",
        tier_4_semantic,
        tier_5_dependencies,
        replace(tier_3_mission, task_payload=""),
    )


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
