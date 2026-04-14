"""First-pass child-work issuance helper for the active ION kernel stack.

This module sits one layer above validation and commit gating. It does not claim the
full daemon transition planner already exists. It provides the smaller truthful step
the current stack can support today: when an accepted CommitDelta proposes bounded
follow-up work, issue real child WorkUnit and ContextPackage records so the existing
scheduler and dispatcher can pick them up naturally.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path
import re

from .context_compiler import ContextCompileRequest, compile_context_package
from .graph import KernelGraph
from .index import KernelIndex
from .model import (
    AgentIdentity,
    ChildSpec,
    CommitDelta,
    CommitDeltaStatus,
    ContextPackage,
    KernelRecord,
    ScopeType,
    SpawnPolicy,
    TargetFile,
    TierOneDoctrine,
    WorkUnit,
    WorkUnitStatus,
)
from .store import KernelStore


class KernelChildWorkIssuanceError(Exception):
    """Raised when one child-work issuance operation cannot be completed lawfully."""


@dataclass(frozen=True)
class ChildAgentBinding(KernelRecord):
    """Minimal binding required to issue one child work unit for an agent."""

    personal_name: str
    role: str
    structural_identity: str
    tier: int
    domain: str
    chassis: str
    specialty: str | None = None

    def to_agent_identity(self) -> AgentIdentity:
        return AgentIdentity(
            personal_name=self.personal_name,
            role=self.role,
            structural_identity=self.structural_identity,
            tier=self.tier,
            domain=self.domain,
            specialty=self.specialty or self.role,
        )


@dataclass(frozen=True)
class PreparedChildWork(KernelRecord):
    """Resolved child work unit and compiled context package for one ChildSpec."""

    child_spec: ChildSpec
    work_unit: WorkUnit
    context_package: ContextPackage


@dataclass(frozen=True)
class ChildWorkIssuancePreparation:
    """Prepared child records ready to persist."""

    parent_work_unit: WorkUnit
    commit_delta: CommitDelta
    prepared_children: tuple[PreparedChildWork, ...]


@dataclass(frozen=True)
class ChildWorkIssuanceResult:
    """Result of persisting child work and rebuilding the causal graph."""

    preparation: ChildWorkIssuancePreparation
    created_work_units: tuple[WorkUnit, ...]
    created_context_packages: tuple[ContextPackage, ...]
    graph_node_count: int
    graph_edge_count: int


class KernelChildWorkIssuer:
    """Issue bounded child work from accepted parent deltas."""

    _ACCEPTED_PARENT_DELTA_STATUSES = (
        CommitDeltaStatus.ACCEPTED,
        CommitDeltaStatus.ACCEPTED_AS_WITNESS,
    )

    def prepare_issuance(
        self,
        index: KernelIndex,
        work_unit_id: str,
        delta_id: str,
        *,
        repo_root: str | Path,
        doctrine: TierOneDoctrine,
        agent_bindings: dict[str, ChildAgentBinding] | None = None,
        created_at: str | None = None,
    ) -> ChildWorkIssuancePreparation:
        parent_work_unit = _resolve_parent_work_unit(index, work_unit_id)
        commit_delta = _resolve_parent_delta(index, delta_id)
        _validate_parent_binding(parent_work_unit, commit_delta)
        _validate_spawn_policy(parent_work_unit, commit_delta)

        resolved_repo_root = Path(repo_root).resolve()
        bindings = agent_bindings or {}
        preparation_created_at = created_at or _iso_now()

        prepared_children: list[PreparedChildWork] = []
        for ordinal, child_spec in enumerate(commit_delta.proposed_child_work_units, start=1):
            binding = _resolve_child_binding(parent_work_unit, child_spec, bindings)
            scope_ref, scope_type, allowed_writes, target_files = _resolve_child_scope(
                resolved_repo_root,
                child_spec.scope_ref,
            )
            child_work_unit_id = _child_work_unit_id(
                parent_work_unit.work_unit_id,
                commit_delta.delta_id,
                ordinal,
            )
            provisional_work_unit = WorkUnit(
                work_unit_id=child_work_unit_id,
                created_at=preparation_created_at,
                protocol_id=parent_work_unit.protocol_id,
                transition_id=parent_work_unit.transition_id,
                context_version="PENDING_COMPILATION",
                agent_personal_name=binding.personal_name,
                agent_role=binding.role,
                agent_structural_id=binding.structural_identity,
                agent_tier=binding.tier,
                agent_domain=binding.domain,
                chassis=binding.chassis,
                scope_type=scope_type,
                scope_ref=scope_ref,
                bound_template=child_spec.suggested_template,
                input_refs=(),
                context_package_id=f"cp-{child_work_unit_id}-pending",
                allowed_writes=allowed_writes,
                allowed_next_actions=parent_work_unit.allowed_next_actions,
                priority=parent_work_unit.priority,
                status=WorkUnitStatus.PENDING,
                must_not=parent_work_unit.must_not,
                dependencies=(parent_work_unit.work_unit_id,),
                spawn_policy=SpawnPolicy(may_spawn=False),
                expected_output_schema="CommitDelta",
                parent_work_unit_id=parent_work_unit.work_unit_id,
            )
            context_package = compile_context_package(
                ContextCompileRequest(
                    work_unit=provisional_work_unit,
                    doctrine=doctrine,
                    target_files=target_files,
                    task_payload=_task_payload_for_child(
                        parent_work_unit,
                        commit_delta,
                        child_spec,
                    ),
                    objective=child_spec.rationale,
                    agent_identity=binding.to_agent_identity(),
                    compiled_at=preparation_created_at,
                )
            )
            final_work_unit = replace(
                provisional_work_unit,
                context_version=context_package.context_version,
                context_package_id=context_package.context_package_id,
            )
            prepared_children.append(
                PreparedChildWork(
                    child_spec=child_spec,
                    work_unit=final_work_unit,
                    context_package=context_package,
                )
            )

        return ChildWorkIssuancePreparation(
            parent_work_unit=parent_work_unit,
            commit_delta=commit_delta,
            prepared_children=tuple(prepared_children),
        )

    def issue_child_work_units(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        work_unit_id: str,
        delta_id: str,
        *,
        repo_root: str | Path,
        doctrine: TierOneDoctrine,
        agent_bindings: dict[str, ChildAgentBinding] | None = None,
        created_at: str | None = None,
    ) -> ChildWorkIssuanceResult:
        preparation = self.prepare_issuance(
            index,
            work_unit_id,
            delta_id,
            repo_root=repo_root,
            doctrine=doctrine,
            agent_bindings=agent_bindings,
            created_at=created_at,
        )

        created_work_units: list[WorkUnit] = []
        created_context_packages: list[ContextPackage] = []
        for prepared in preparation.prepared_children:
            if index.exists("work_unit", prepared.work_unit.work_unit_id):
                raise KernelChildWorkIssuanceError(
                    f"Child work unit already exists: {prepared.work_unit.work_unit_id}"
                )
            if index.exists("context_package", prepared.context_package.context_package_id):
                raise KernelChildWorkIssuanceError(
                    f"Child context package already exists: {prepared.context_package.context_package_id}"
                )
            store.create(prepared.work_unit)
            index.record_added(prepared.work_unit)
            store.create(prepared.context_package)
            index.record_added(prepared.context_package)
            created_work_units.append(prepared.work_unit)
            created_context_packages.append(prepared.context_package)

        graph.build_from_index(index)
        return ChildWorkIssuanceResult(
            preparation=preparation,
            created_work_units=tuple(created_work_units),
            created_context_packages=tuple(created_context_packages),
            graph_node_count=graph.node_count,
            graph_edge_count=graph.edge_count,
        )


IonChildWorkIssuer = KernelChildWorkIssuer


def _resolve_parent_work_unit(index: KernelIndex, work_unit_id: str) -> WorkUnit:
    record = index.get("work_unit", work_unit_id)
    if not isinstance(record, WorkUnit):
        raise KernelChildWorkIssuanceError(f"Unknown parent work unit: {work_unit_id}")
    if record.status is not WorkUnitStatus.COMMITTED:
        raise KernelChildWorkIssuanceError(
            f"Parent work unit is not in COMMITTED: {work_unit_id} ({record.status})"
        )
    return record


def _resolve_parent_delta(index: KernelIndex, delta_id: str) -> CommitDelta:
    record = index.get("commit_delta", delta_id)
    if not isinstance(record, CommitDelta):
        raise KernelChildWorkIssuanceError(f"Unknown parent commit delta: {delta_id}")
    if record.status not in KernelChildWorkIssuer._ACCEPTED_PARENT_DELTA_STATUSES:
        raise KernelChildWorkIssuanceError(
            f"Parent commit delta is not in an accepted status: {delta_id} ({record.status})"
        )
    return record


def _validate_parent_binding(parent_work_unit: WorkUnit, commit_delta: CommitDelta) -> None:
    if commit_delta.work_unit_id != parent_work_unit.work_unit_id:
        raise KernelChildWorkIssuanceError(
            "Parent delta work-unit mismatch: "
            f"expected {parent_work_unit.work_unit_id}, found {commit_delta.work_unit_id}"
        )
    if commit_delta.protocol_id != parent_work_unit.protocol_id:
        raise KernelChildWorkIssuanceError(
            "Parent delta protocol mismatch: "
            f"expected {parent_work_unit.protocol_id}, found {commit_delta.protocol_id}"
        )
    if commit_delta.transition_id != parent_work_unit.transition_id:
        raise KernelChildWorkIssuanceError(
            "Parent delta transition mismatch: "
            f"expected {parent_work_unit.transition_id}, found {commit_delta.transition_id}"
        )
    if commit_delta.agent_personal_name != parent_work_unit.agent_personal_name:
        raise KernelChildWorkIssuanceError(
            "Parent delta personal-name mismatch: "
            f"expected {parent_work_unit.agent_personal_name}, found {commit_delta.agent_personal_name}"
        )
    if commit_delta.agent_structural_id != parent_work_unit.agent_structural_id:
        raise KernelChildWorkIssuanceError(
            "Parent delta structural-identity mismatch: "
            f"expected {parent_work_unit.agent_structural_id}, found {commit_delta.agent_structural_id}"
        )


def _validate_spawn_policy(parent_work_unit: WorkUnit, commit_delta: CommitDelta) -> None:
    proposed_children = commit_delta.proposed_child_work_units
    if not proposed_children:
        return

    policy = parent_work_unit.spawn_policy
    if not policy.may_spawn:
        raise KernelChildWorkIssuanceError(
            f"Parent work unit may not spawn children: {parent_work_unit.work_unit_id}"
        )
    if policy.spawn_requires_approval:
        raise KernelChildWorkIssuanceError(
            f"Parent work unit requires approval before spawning children: {parent_work_unit.work_unit_id}"
        )
    if policy.max_children and len(proposed_children) > policy.max_children:
        raise KernelChildWorkIssuanceError(
            f"Parent work unit exceeded max_children ({policy.max_children}): {parent_work_unit.work_unit_id}"
        )
    if policy.spawn_templates:
        disallowed = [
            child.suggested_template
            for child in proposed_children
            if child.suggested_template not in policy.spawn_templates
        ]
        if disallowed:
            rendered = ", ".join(disallowed)
            raise KernelChildWorkIssuanceError(
                f"Parent work unit proposed disallowed child template(s): {rendered}"
            )


def _resolve_child_binding(
    parent_work_unit: WorkUnit,
    child_spec: ChildSpec,
    agent_bindings: dict[str, ChildAgentBinding],
) -> ChildAgentBinding:
    target_agent = child_spec.suggested_agent or parent_work_unit.agent_personal_name
    if target_agent == parent_work_unit.agent_personal_name:
        return ChildAgentBinding(
            personal_name=parent_work_unit.agent_personal_name,
            role=parent_work_unit.agent_role,
            structural_identity=parent_work_unit.agent_structural_id,
            tier=parent_work_unit.agent_tier,
            domain=parent_work_unit.agent_domain,
            chassis=parent_work_unit.chassis,
            specialty=parent_work_unit.agent_role,
        )
    if target_agent not in agent_bindings:
        raise KernelChildWorkIssuanceError(
            f"Missing child agent binding for suggested agent: {target_agent}"
        )
    return agent_bindings[target_agent]


def _resolve_child_scope(
    repo_root: Path,
    scope_ref: str,
) -> tuple[str, ScopeType, tuple[str, ...], tuple[TargetFile, ...]]:
    cleaned = scope_ref.strip()
    if not cleaned:
        raise KernelChildWorkIssuanceError("Child scope_ref is empty.")

    candidate = Path(cleaned)
    if candidate.is_absolute():
        resolved = candidate.resolve()
        try:
            normalized = resolved.relative_to(repo_root).as_posix()
        except ValueError as exc:
            raise KernelChildWorkIssuanceError(
                f"Child scope_ref escapes repo root: {scope_ref}"
            ) from exc
    else:
        normalized = candidate.as_posix().lstrip("./")
        resolved = (repo_root / normalized).resolve()
        try:
            resolved.relative_to(repo_root)
        except ValueError as exc:
            raise KernelChildWorkIssuanceError(
                f"Child scope_ref escapes repo root: {scope_ref}"
            ) from exc

    if resolved.exists() and resolved.is_dir():
        entries = sorted(
            path.name + ("/" if path.is_dir() else "")
            for path in resolved.iterdir()
        )
        manifest = "\n".join(entries)
        return (
            normalized,
            ScopeType.DIRECTORY,
            (normalized, f"{normalized}/**"),
            (
                TargetFile(
                    path=normalized,
                    content=manifest,
                    line_count=len(entries),
                    language="directory",
                ),
            ),
        )

    if resolved.exists() and resolved.is_file():
        content = resolved.read_text(encoding="utf-8")
        return (
            normalized,
            ScopeType.FILE,
            (normalized,),
            (
                TargetFile(
                    path=normalized,
                    content=content,
                    line_count=len(content.splitlines()),
                    language=_language_for_path(resolved),
                ),
            ),
        )

    if candidate.suffix:
        return (
            normalized,
            ScopeType.FILE,
            (normalized,),
            (
                TargetFile(
                    path=normalized,
                    content="",
                    line_count=0,
                    language=_language_for_path(candidate),
                ),
            ),
        )

    raise KernelChildWorkIssuanceError(
        f"Child scope_ref does not exist and cannot be treated as a file target: {scope_ref}"
    )


def _child_work_unit_id(parent_work_unit_id: str, delta_id: str, ordinal: int) -> str:
    delta_slug = re.sub(r"[^0-9a-z]+", "-", delta_id.lower()).strip("-")
    return f"{parent_work_unit_id}-{delta_slug}-child-{ordinal:02d}"


def _task_payload_for_child(
    parent_work_unit: WorkUnit,
    commit_delta: CommitDelta,
    child_spec: ChildSpec,
) -> str:
    return (
        f"Follow-up child work issued from parent {parent_work_unit.work_unit_id} "
        f"after accepted delta {commit_delta.delta_id}. "
        f"Template: {child_spec.suggested_template}. "
        f"Scope: {child_spec.scope_ref}. "
        f"Rationale: {child_spec.rationale}"
    )


def _language_for_path(path: Path) -> str | None:
    suffix = path.suffix.lower()
    return {
        ".py": "python",
        ".md": "markdown",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".sh": "shell",
    }.get(suffix)


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
