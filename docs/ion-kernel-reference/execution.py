"""First-pass execution helper for the active ION kernel stack.

This module sits one layer above dispatch. It does not claim to run the actor itself.
Instead, it accepts an explicit returned execution payload for a dispatched work unit,
materializes a proposed CommitDelta, persists it, and advances the work unit into
VALIDATING so later runtime helpers can perform gatekeeping and commit decisions.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
import re

from .model import (
    ChildSpec,
    CommitDelta,
    CommitDeltaStatus,
    ContextPackage,
    KernelRecord,
    LedgerEntry,
    ProducedArtifact,
    ProposedSignal,
    StateMutation,
    WorkUnit,
    WorkUnitStatus,
)
from .index import KernelIndex
from .store import KernelStore


class KernelExecutionError(Exception):
    """Raised when one execution submission cannot be recorded lawfully."""


@dataclass(frozen=True)
class ExecutionSubmission(KernelRecord):
    """Explicit returned payload from one bounded actor execution."""

    produced_artifacts: tuple[ProducedArtifact, ...]
    confidence: float
    context_version: str | None = None
    ledger_additions: tuple[LedgerEntry, ...] = ()
    state_mutations: tuple[StateMutation, ...] = ()
    proposed_signals: tuple[ProposedSignal, ...] = ()
    proposed_open_questions: tuple[str, ...] = ()
    proposed_child_work_units: tuple[ChildSpec, ...] = ()
    contradictions: tuple[str, ...] = ()
    notes: str | None = None
    delta_id: str | None = None
    created_at: str | None = None
    status: CommitDeltaStatus = CommitDeltaStatus.PROPOSED


@dataclass(frozen=True)
class ExecutionPreparation:
    """Resolved work-unit/context binding plus the proposed commit delta."""

    work_unit: WorkUnit
    context_package: ContextPackage
    commit_delta: CommitDelta


@dataclass(frozen=True)
class ExecutionResult:
    """Result of persisting one execution submission."""

    preparation: ExecutionPreparation
    work_unit_before: WorkUnit
    work_unit_after: WorkUnit


class KernelExecutor:
    """Materialize proposed commit deltas from explicit execution submissions."""

    _ALLOWED_PREVALIDATION_STATUSES = (
        WorkUnitStatus.DISPATCHED,
        WorkUnitStatus.EXECUTING,
    )

    def prepare_execution(
        self,
        index: KernelIndex,
        work_unit_id: str,
        submission: ExecutionSubmission,
    ) -> ExecutionPreparation:
        work_unit = index.get("work_unit", work_unit_id)
        if not isinstance(work_unit, WorkUnit):
            raise KernelExecutionError(f"Unknown work unit: {work_unit_id}")
        if work_unit.status not in self._ALLOWED_PREVALIDATION_STATUSES:
            raise KernelExecutionError(
                f"Work unit is not in a lawful execution-return state: {work_unit_id} ({work_unit.status})"
            )
        if submission.status is not CommitDeltaStatus.PROPOSED:
            raise KernelExecutionError(
                f"Execution submissions must enter as PROPOSED deltas, not {submission.status}."
            )

        context_package = _resolve_context_package(index, work_unit)
        created_at = submission.created_at or _iso_now()
        delta_id = submission.delta_id or _default_delta_id(work_unit.work_unit_id, created_at)

        commit_delta = CommitDelta(
            delta_id=delta_id,
            created_at=created_at,
            work_unit_id=work_unit.work_unit_id,
            context_version=submission.context_version or context_package.context_version,
            protocol_id=work_unit.protocol_id,
            transition_id=work_unit.transition_id,
            agent_personal_name=work_unit.agent_personal_name,
            agent_structural_id=work_unit.agent_structural_id,
            chassis=work_unit.chassis,
            produced_artifacts=submission.produced_artifacts,
            status=CommitDeltaStatus.PROPOSED,
            confidence=submission.confidence,
            ledger_additions=submission.ledger_additions,
            state_mutations=submission.state_mutations,
            proposed_signals=submission.proposed_signals,
            proposed_open_questions=submission.proposed_open_questions,
            proposed_child_work_units=submission.proposed_child_work_units,
            contradictions=submission.contradictions,
            notes=submission.notes,
        )
        return ExecutionPreparation(
            work_unit=work_unit,
            context_package=context_package,
            commit_delta=commit_delta,
        )

    def submit_execution(
        self,
        store: KernelStore,
        index: KernelIndex,
        work_unit_id: str,
        submission: ExecutionSubmission,
    ) -> ExecutionResult:
        preparation = self.prepare_execution(index, work_unit_id, submission)
        work_unit_before = preparation.work_unit
        store.create(preparation.commit_delta)
        index.record_added(preparation.commit_delta)

        work_unit_after = replace(work_unit_before, status=WorkUnitStatus.VALIDATING)
        store.replace(work_unit_after)
        index.record_changed(work_unit_after)

        return ExecutionResult(
            preparation=preparation,
            work_unit_before=work_unit_before,
            work_unit_after=work_unit_after,
        )


IonExecutor = KernelExecutor


def _resolve_context_package(index: KernelIndex, work_unit: WorkUnit) -> ContextPackage:
    record = index.get("context_package", work_unit.context_package_id)
    if not isinstance(record, ContextPackage):
        raise KernelExecutionError(
            f"Missing context package for work unit {work_unit.work_unit_id}: {work_unit.context_package_id}"
        )

    if record.work_unit_id != work_unit.work_unit_id:
        raise KernelExecutionError(
            "Context package work-unit mismatch: "
            f"expected {work_unit.work_unit_id}, found {record.work_unit_id}"
        )
    if record.protocol_id != work_unit.protocol_id:
        raise KernelExecutionError(
            "Context package protocol mismatch: "
            f"expected {work_unit.protocol_id}, found {record.protocol_id}"
        )
    if record.transition_id != work_unit.transition_id:
        raise KernelExecutionError(
            "Context package transition mismatch: "
            f"expected {work_unit.transition_id}, found {record.transition_id}"
        )
    if record.agent_identity.personal_name != work_unit.agent_personal_name:
        raise KernelExecutionError(
            "Context package personal-name mismatch: "
            f"expected {work_unit.agent_personal_name}, found {record.agent_identity.personal_name}"
        )
    if record.agent_identity.role != work_unit.agent_role:
        raise KernelExecutionError(
            "Context package role mismatch: "
            f"expected {work_unit.agent_role}, found {record.agent_identity.role}"
        )
    if record.agent_identity.structural_identity != work_unit.agent_structural_id:
        raise KernelExecutionError(
            "Context package structural-identity mismatch: "
            f"expected {work_unit.agent_structural_id}, found {record.agent_identity.structural_identity}"
        )
    return record


def _default_delta_id(work_unit_id: str, created_at: str) -> str:
    suffix = re.sub(r"[^0-9a-z]+", "", created_at.lower())
    return f"delta-{work_unit_id}-{suffix}"


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
