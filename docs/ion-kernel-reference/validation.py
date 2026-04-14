"""First-pass validator / commit-gate helper for the active ION kernel stack.

This module sits one layer above execution. It does not claim the full artifact-apply
pipeline already exists. It performs the smaller truthful step the current kernel can
support: validate a proposed CommitDelta against the bound WorkUnit, decide the delta
status, apply the first authority-aware downgrade rule, and move the work unit toward
COMMITTED or FAILED without inventing hidden authority.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from fnmatch import fnmatch

from .index import KernelIndex
from .model import AuthorityClass, CommitDelta, CommitDeltaStatus, ProducedArtifact, WorkUnit, WorkUnitStatus
from .store import KernelStore


class KernelValidationError(Exception):
    """Raised when one validation operation cannot be completed lawfully."""


@dataclass(frozen=True)
class ValidationDecision:
    """Prepared validation outcome for one proposed commit delta."""

    commit_delta_before: CommitDelta
    commit_delta_after: CommitDelta
    work_unit_before: WorkUnit
    work_unit_after: WorkUnit
    reasons: tuple[str, ...]


class KernelValidator:
    """Validate proposed commit deltas against the current kernel state."""

    def __init__(self, *, review_confidence_threshold: float = 0.6) -> None:
        self._review_confidence_threshold = review_confidence_threshold

    def prepare_validation(
        self,
        index: KernelIndex,
        work_unit_id: str,
        delta_id: str,
    ) -> ValidationDecision:
        work_unit = index.get("work_unit", work_unit_id)
        if not isinstance(work_unit, WorkUnit):
            raise KernelValidationError(f"Unknown work unit: {work_unit_id}")
        if work_unit.status is not WorkUnitStatus.VALIDATING:
            raise KernelValidationError(
                f"Work unit is not in VALIDATING: {work_unit_id} ({work_unit.status})"
            )

        commit_delta = index.get("commit_delta", delta_id)
        if not isinstance(commit_delta, CommitDelta):
            raise KernelValidationError(f"Unknown commit delta: {delta_id}")
        if commit_delta.status is not CommitDeltaStatus.PROPOSED:
            raise KernelValidationError(
                f"Commit delta is not in PROPOSED: {delta_id} ({commit_delta.status})"
            )

        _validate_binding(work_unit, commit_delta)

        outcome, updated_artifacts, reasons = self._decide(work_unit, commit_delta)
        commit_delta_after = replace(
            commit_delta,
            status=outcome,
            produced_artifacts=updated_artifacts,
            review_reasons=reasons if outcome is CommitDeltaStatus.REQUIRES_REVIEW else (),
        )
        work_unit_after = replace(
            work_unit,
            status=_work_unit_status_for_outcome(outcome, work_unit.status),
        )
        return ValidationDecision(
            commit_delta_before=commit_delta,
            commit_delta_after=commit_delta_after,
            work_unit_before=work_unit,
            work_unit_after=work_unit_after,
            reasons=reasons,
        )

    def apply_validation(
        self,
        store: KernelStore,
        index: KernelIndex,
        work_unit_id: str,
        delta_id: str,
    ) -> ValidationDecision:
        decision = self.prepare_validation(index, work_unit_id, delta_id)
        store.replace(decision.commit_delta_after)
        index.record_changed(decision.commit_delta_after)
        store.replace(decision.work_unit_after)
        index.record_changed(decision.work_unit_after)
        return decision

    def _decide(
        self,
        work_unit: WorkUnit,
        commit_delta: CommitDelta,
    ) -> tuple[CommitDeltaStatus, tuple[ProducedArtifact, ...], tuple[str, ...]]:
        reasons: list[str] = []

        if not commit_delta.produced_artifacts:
            return (
                CommitDeltaStatus.REJECTED,
                commit_delta.produced_artifacts,
                ("NO_PRODUCED_ARTIFACTS",),
            )

        if _has_illegal_write(work_unit, commit_delta):
            return (
                CommitDeltaStatus.REJECTED,
                commit_delta.produced_artifacts,
                ("OUTSIDE_ALLOWED_WRITES",),
            )

        if _touches_forbidden_target(work_unit, commit_delta):
            return (
                CommitDeltaStatus.REJECTED,
                commit_delta.produced_artifacts,
                ("TOUCHES_FORBIDDEN_TARGET",),
            )

        if any(
            artifact.authority_class is AuthorityClass.STALE_COMPETITOR
            for artifact in commit_delta.produced_artifacts
        ):
            return (
                CommitDeltaStatus.REQUIRES_REVIEW,
                commit_delta.produced_artifacts,
                ("STALE_COMPETITOR_REVIEW",),
            )

        if commit_delta.confidence < self._review_confidence_threshold:
            return (
                CommitDeltaStatus.REQUIRES_REVIEW,
                commit_delta.produced_artifacts,
                ("LOW_CONFIDENCE_REVIEW",),
            )

        if commit_delta.context_version != work_unit.context_version:
            if any(
                artifact.authority_class is AuthorityClass.AUTHORITY
                for artifact in commit_delta.produced_artifacts
            ):
                downgraded = tuple(
                    replace(artifact, authority_class=AuthorityClass.WITNESS)
                    if artifact.authority_class is AuthorityClass.AUTHORITY
                    else artifact
                    for artifact in commit_delta.produced_artifacts
                )
                return (
                    CommitDeltaStatus.ACCEPTED_AS_WITNESS,
                    downgraded,
                    ("STALE_CONTEXT_AUTHORITY_DOWNGRADE",),
                )
            reasons.append("STALE_CONTEXT_NONAUTHORITY")

        if reasons:
            return (
                CommitDeltaStatus.ACCEPTED,
                commit_delta.produced_artifacts,
                tuple(reasons),
            )

        return (
            CommitDeltaStatus.ACCEPTED,
            commit_delta.produced_artifacts,
            ("VALID_FRESH_DELTA",),
        )


IonValidator = KernelValidator


def _validate_binding(work_unit: WorkUnit, commit_delta: CommitDelta) -> None:
    if commit_delta.work_unit_id != work_unit.work_unit_id:
        raise KernelValidationError(
            "Commit delta work-unit mismatch: "
            f"expected {work_unit.work_unit_id}, found {commit_delta.work_unit_id}"
        )
    if commit_delta.protocol_id != work_unit.protocol_id:
        raise KernelValidationError(
            "Commit delta protocol mismatch: "
            f"expected {work_unit.protocol_id}, found {commit_delta.protocol_id}"
        )
    if commit_delta.transition_id != work_unit.transition_id:
        raise KernelValidationError(
            "Commit delta transition mismatch: "
            f"expected {work_unit.transition_id}, found {commit_delta.transition_id}"
        )
    if commit_delta.agent_personal_name != work_unit.agent_personal_name:
        raise KernelValidationError(
            "Commit delta personal-name mismatch: "
            f"expected {work_unit.agent_personal_name}, found {commit_delta.agent_personal_name}"
        )
    if commit_delta.agent_structural_id != work_unit.agent_structural_id:
        raise KernelValidationError(
            "Commit delta structural-identity mismatch: "
            f"expected {work_unit.agent_structural_id}, found {commit_delta.agent_structural_id}"
        )


def _has_illegal_write(work_unit: WorkUnit, commit_delta: CommitDelta) -> bool:
    allowed_patterns = work_unit.allowed_writes
    for artifact in commit_delta.produced_artifacts:
        if not any(fnmatch(artifact.path, pattern) for pattern in allowed_patterns):
            return True
    return False


def _touches_forbidden_target(work_unit: WorkUnit, commit_delta: CommitDelta) -> bool:
    forbidden_patterns = work_unit.must_not
    if not forbidden_patterns:
        return False
    for artifact in commit_delta.produced_artifacts:
        if any(fnmatch(artifact.path, pattern) for pattern in forbidden_patterns):
            return True
    return False


def _work_unit_status_for_outcome(
    outcome: CommitDeltaStatus,
    current_status: WorkUnitStatus,
) -> WorkUnitStatus:
    if outcome in (CommitDeltaStatus.ACCEPTED, CommitDeltaStatus.ACCEPTED_AS_WITNESS):
        return WorkUnitStatus.COMMITTED
    if outcome is CommitDeltaStatus.REJECTED:
        return WorkUnitStatus.FAILED
    return current_status
