"""First-pass post-commit artifact applier for the active ION kernel stack.

This module sits one layer above validation. It does not claim the full receipt,
signal, or reconciliation layer already exists. It provides the smaller truthful
hook the current kernel can support today: once a work unit is already COMMITTED
and its CommitDelta has been accepted, materialize the proposed artifacts and
state mutations into an explicit workspace root with strict path safety.
"""

from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path
import re

from .index import KernelIndex
from .model import (
    ArtifactOperation,
    CommitDelta,
    CommitDeltaStatus,
    StateMutation,
    StateMutationOperation,
    WorkUnit,
    WorkUnitStatus,
)

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


class KernelCommitError(Exception):
    """Raised when one post-commit application cannot be completed lawfully."""


@dataclass(frozen=True)
class CommitApplication:
    """Resolved post-commit application scope for one accepted delta."""

    work_unit: WorkUnit
    commit_delta: CommitDelta
    workspace_root: Path


@dataclass(frozen=True)
class CommitApplicationResult:
    """Result of applying one accepted commit delta into a workspace root."""

    preparation: CommitApplication
    artifact_paths: tuple[Path, ...]
    state_targets: tuple[Path, ...]


class KernelCommitApplier:
    """Apply already-validated commit deltas to a bounded workspace root."""

    _ALLOWED_DELTA_STATUSES = (
        CommitDeltaStatus.ACCEPTED,
        CommitDeltaStatus.ACCEPTED_AS_WITNESS,
    )

    def prepare_application(
        self,
        index: KernelIndex,
        work_unit_id: str,
        delta_id: str,
        workspace_root: str | Path,
    ) -> CommitApplication:
        work_unit = index.get("work_unit", work_unit_id)
        if not isinstance(work_unit, WorkUnit):
            raise KernelCommitError(f"Unknown work unit: {work_unit_id}")
        if work_unit.status is not WorkUnitStatus.COMMITTED:
            raise KernelCommitError(
                f"Work unit is not in COMMITTED: {work_unit_id} ({work_unit.status})"
            )

        commit_delta = index.get("commit_delta", delta_id)
        if not isinstance(commit_delta, CommitDelta):
            raise KernelCommitError(f"Unknown commit delta: {delta_id}")
        if commit_delta.status not in self._ALLOWED_DELTA_STATUSES:
            raise KernelCommitError(
                f"Commit delta is not in an applyable status: {delta_id} ({commit_delta.status})"
            )

        _validate_binding(work_unit, commit_delta)

        resolved_root = Path(workspace_root).resolve()
        resolved_root.mkdir(parents=True, exist_ok=True)
        _validate_write_targets(work_unit, commit_delta, resolved_root)

        return CommitApplication(
            work_unit=work_unit,
            commit_delta=commit_delta,
            workspace_root=resolved_root,
        )

    def apply_commit_delta(
        self,
        index: KernelIndex,
        work_unit_id: str,
        delta_id: str,
        workspace_root: str | Path,
    ) -> CommitApplicationResult:
        preparation = self.prepare_application(
            index,
            work_unit_id,
            delta_id,
            workspace_root,
        )

        artifact_paths = tuple(
            _apply_produced_artifact(preparation.workspace_root, artifact)
            for artifact in preparation.commit_delta.produced_artifacts
        )
        state_targets = tuple(
            _apply_state_mutation(preparation.workspace_root, mutation)
            for mutation in preparation.commit_delta.state_mutations
        )

        return CommitApplicationResult(
            preparation=preparation,
            artifact_paths=artifact_paths,
            state_targets=state_targets,
        )


IonCommitApplier = KernelCommitApplier


def _validate_binding(work_unit: WorkUnit, commit_delta: CommitDelta) -> None:
    if commit_delta.work_unit_id != work_unit.work_unit_id:
        raise KernelCommitError(
            "Commit delta work-unit mismatch: "
            f"expected {work_unit.work_unit_id}, found {commit_delta.work_unit_id}"
        )
    if commit_delta.protocol_id != work_unit.protocol_id:
        raise KernelCommitError(
            "Commit delta protocol mismatch: "
            f"expected {work_unit.protocol_id}, found {commit_delta.protocol_id}"
        )
    if commit_delta.transition_id != work_unit.transition_id:
        raise KernelCommitError(
            "Commit delta transition mismatch: "
            f"expected {work_unit.transition_id}, found {commit_delta.transition_id}"
        )
    if commit_delta.agent_personal_name != work_unit.agent_personal_name:
        raise KernelCommitError(
            "Commit delta personal-name mismatch: "
            f"expected {work_unit.agent_personal_name}, found {commit_delta.agent_personal_name}"
        )
    if commit_delta.agent_structural_id != work_unit.agent_structural_id:
        raise KernelCommitError(
            "Commit delta structural-identity mismatch: "
            f"expected {work_unit.agent_structural_id}, found {commit_delta.agent_structural_id}"
        )


def _validate_write_targets(
    work_unit: WorkUnit,
    commit_delta: CommitDelta,
    workspace_root: Path,
) -> None:
    for artifact in commit_delta.produced_artifacts:
        _validate_target(
            target=artifact.path,
            workspace_root=workspace_root,
            allowed_writes=work_unit.allowed_writes,
            must_not=work_unit.must_not,
            label="produced artifact",
        )
    for mutation in commit_delta.state_mutations:
        _validate_target(
            target=mutation.target,
            workspace_root=workspace_root,
            allowed_writes=work_unit.allowed_writes,
            must_not=work_unit.must_not,
            label="state mutation",
        )


def _validate_target(
    *,
    target: str,
    workspace_root: Path,
    allowed_writes: tuple[str, ...],
    must_not: tuple[str, ...],
    label: str,
) -> Path:
    resolved = _resolve_workspace_target(workspace_root, target)
    if not any(fnmatch(target, pattern) for pattern in allowed_writes):
        raise KernelCommitError(f"{label.title()} is outside allowed_writes: {target}")
    if any(fnmatch(target, pattern) for pattern in must_not):
        raise KernelCommitError(f"{label.title()} touches forbidden target: {target}")
    return resolved


def _resolve_workspace_target(workspace_root: Path, target: str) -> Path:
    clean_target = target.strip()
    if not clean_target:
        raise KernelCommitError("Target path is empty.")

    target_path = Path(clean_target)
    if target_path.is_absolute():
        raise KernelCommitError(f"Absolute target paths are not allowed: {target}")

    resolved_root = workspace_root.resolve()
    resolved_target = (resolved_root / target_path).resolve()
    try:
        resolved_target.relative_to(resolved_root)
    except ValueError as exc:
        raise KernelCommitError(f"Target path escapes workspace root: {target}") from exc
    return resolved_target


def _apply_produced_artifact(workspace_root: Path, artifact) -> Path:
    target_path = _resolve_workspace_target(workspace_root, artifact.path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    if artifact.operation is ArtifactOperation.CREATE:
        if target_path.exists():
            raise KernelCommitError(f"CREATE target already exists: {artifact.path}")
        target_path.write_text(artifact.content, encoding="utf-8")
        return target_path

    if artifact.operation is ArtifactOperation.UPDATE:
        if not target_path.exists():
            raise KernelCommitError(f"UPDATE target does not exist: {artifact.path}")
        target_path.write_text(artifact.content, encoding="utf-8")
        return target_path

    if artifact.operation is ArtifactOperation.APPEND:
        if not target_path.exists():
            raise KernelCommitError(f"APPEND target does not exist: {artifact.path}")
        with target_path.open("a", encoding="utf-8") as handle:
            handle.write(artifact.content)
        return target_path

    raise KernelCommitError(f"Unsupported artifact operation: {artifact.operation}")


def _apply_state_mutation(workspace_root: Path, mutation: StateMutation) -> Path:
    target_path = _resolve_workspace_target(workspace_root, mutation.target)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    if mutation.operation is StateMutationOperation.APPEND:
        if not target_path.exists():
            raise KernelCommitError(f"APPEND state target does not exist: {mutation.target}")
        with target_path.open("a", encoding="utf-8") as handle:
            handle.write(mutation.content)
        return target_path

    if mutation.operation is StateMutationOperation.UPDATE_SECTION:
        if not target_path.exists():
            raise KernelCommitError(
                f"UPDATE_SECTION target does not exist: {mutation.target}"
            )
        existing = target_path.read_text(encoding="utf-8")
        updated = _replace_markdown_section(existing, mutation.content, mutation.target)
        target_path.write_text(updated, encoding="utf-8")
        return target_path

    raise KernelCommitError(f"Unsupported state mutation operation: {mutation.operation}")


def _replace_markdown_section(document: str, replacement: str, target: str) -> str:
    heading_level, heading_text = _extract_heading(replacement)
    lines = document.splitlines()

    start_index = None
    for index, line in enumerate(lines):
        match = _HEADING_RE.match(line)
        if match and len(match.group(1)) == heading_level and line.strip() == heading_text:
            start_index = index
            break

    if start_index is None:
        raise KernelCommitError(
            f"UPDATE_SECTION heading not found in target {target}: {heading_text}"
        )

    end_index = len(lines)
    for index in range(start_index + 1, len(lines)):
        match = _HEADING_RE.match(lines[index])
        if match and len(match.group(1)) <= heading_level:
            end_index = index
            break

    replacement_lines = replacement.rstrip("\n").splitlines()
    updated_lines = lines[:start_index] + replacement_lines + lines[end_index:]
    return "\n".join(updated_lines) + "\n"


def _extract_heading(section_text: str) -> tuple[int, str]:
    for line in section_text.splitlines():
        match = _HEADING_RE.match(line)
        if match:
            return len(match.group(1)), line.strip()
    raise KernelCommitError(
        "UPDATE_SECTION content must include a markdown heading naming the section to replace."
    )
