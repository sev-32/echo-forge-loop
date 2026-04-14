"""First-pass validation-receipt / signal-emission helper for the ION kernel.

This module sits one layer above validation. It does not claim the full signal
router, ledger append, or reconciliation layer already exists. It provides the
smaller truthful path the current stack can support today: given a live
`ValidationDecision`, write one durable validation receipt and one canonical
machine-readable signal artifact into an explicit workspace root.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import re
from typing import Any

from .model import KernelRecord, StrEnum, WorkPriority
from .validation import ValidationDecision


class KernelReceiptError(Exception):
    """Raised when one receipt/signal emission operation is not lawful."""


class SignalLifecycleStatus(StrEnum):
    ACTIVE = "ACTIVE"
    CONSUMED = "CONSUMED"
    ARCHIVED = "ARCHIVED"
    EXPIRED = "EXPIRED"


class CanonicalSignalType(StrEnum):
    TASK_COMPLETE = "TASK_COMPLETE"
    TASK_FAILED = "TASK_FAILED"
    BLOCKED = "BLOCKED"


@dataclass(frozen=True)
class ValidationReceipt(KernelRecord):
    receipt_id: str
    created_at: str
    work_unit_id: str
    delta_id: str
    protocol_id: str
    transition_id: str
    agent_personal_name: str
    agent_structural_id: str
    commit_status: str
    resulting_work_status: str
    confidence: float
    reasons: tuple[str, ...]
    artifact_paths: tuple[str, ...]
    artifact_authorities: tuple[str, ...]
    proposed_signal_types: tuple[str, ...]


@dataclass(frozen=True)
class EmittedSignal(KernelRecord):
    signal_id: str
    created_at: str
    source_agent: str
    source_work_unit: str
    source_role: str
    target: str
    signal_type: CanonicalSignalType
    payload: dict[str, Any]
    priority: WorkPriority
    status: SignalLifecycleStatus
    consumed_by: str | None = None
    consumed_at: str | None = None
    expired_by: str | None = None
    expired_at: str | None = None
    related_artifacts: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReceiptPreparation:
    receipt: ValidationReceipt
    receipt_path: Path
    signal: EmittedSignal
    signal_path: Path


@dataclass(frozen=True)
class ReceiptEmissionResult:
    preparation: ReceiptPreparation


class KernelReceiptEmitter:
    """Emit the first bounded validation receipt and canonical post-validation signal."""

    def prepare_emission(
        self,
        decision: ValidationDecision,
        workspace_root: str | Path,
        *,
        receipts_dir: str = "ION/05_context/validation_receipts",
        signals_dir: str = "ION/05_context/signals",
        emitted_at: str | None = None,
    ) -> ReceiptPreparation:
        timestamp = emitted_at or _iso_now()
        root = Path(workspace_root).resolve()
        root.mkdir(parents=True, exist_ok=True)

        receipt_dir = _resolve_child_dir(root, receipts_dir)
        signal_dir = _resolve_child_dir(root, signals_dir)

        receipt = _build_validation_receipt(decision, timestamp)
        receipt_relative = Path(receipts_dir) / _receipt_filename(decision)
        signal_relative = Path(signals_dir) / _signal_filename(decision, timestamp)

        receipt_path = _resolve_relative_file(root, receipt_relative)
        signal_path = _resolve_relative_file(root, signal_relative)
        signal = _build_canonical_signal(
            decision,
            timestamp=timestamp,
            receipt_relative_path=receipt_relative,
        )

        # Force directory creation intent here so invalid configured dirs fail early.
        receipt_dir.mkdir(parents=True, exist_ok=True)
        signal_dir.mkdir(parents=True, exist_ok=True)

        return ReceiptPreparation(
            receipt=receipt,
            receipt_path=receipt_path,
            signal=signal,
            signal_path=signal_path,
        )

    def emit_validation_artifacts(
        self,
        decision: ValidationDecision,
        workspace_root: str | Path,
        *,
        receipts_dir: str = "ION/05_context/validation_receipts",
        signals_dir: str = "ION/05_context/signals",
        emitted_at: str | None = None,
    ) -> ReceiptEmissionResult:
        preparation = self.prepare_emission(
            decision,
            workspace_root,
            receipts_dir=receipts_dir,
            signals_dir=signals_dir,
            emitted_at=emitted_at,
        )

        preparation.receipt_path.parent.mkdir(parents=True, exist_ok=True)
        preparation.signal_path.parent.mkdir(parents=True, exist_ok=True)
        preparation.receipt_path.write_text(
            json.dumps(preparation.receipt.to_dict(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        preparation.signal_path.write_text(
            json.dumps(preparation.signal.to_dict(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return ReceiptEmissionResult(preparation=preparation)


IonReceiptEmitter = KernelReceiptEmitter


def _build_validation_receipt(decision: ValidationDecision, created_at: str) -> ValidationReceipt:
    delta = decision.commit_delta_after
    work_unit = decision.work_unit_after
    return ValidationReceipt(
        receipt_id=f"receipt-{delta.delta_id}",
        created_at=created_at,
        work_unit_id=work_unit.work_unit_id,
        delta_id=delta.delta_id,
        protocol_id=delta.protocol_id,
        transition_id=delta.transition_id,
        agent_personal_name=delta.agent_personal_name,
        agent_structural_id=delta.agent_structural_id,
        commit_status=delta.status.value,
        resulting_work_status=work_unit.status.value,
        confidence=delta.confidence,
        reasons=decision.reasons,
        artifact_paths=tuple(artifact.path for artifact in delta.produced_artifacts),
        artifact_authorities=tuple(artifact.authority_class.value for artifact in delta.produced_artifacts),
        proposed_signal_types=tuple(signal.signal_type for signal in delta.proposed_signals),
    )


def _build_canonical_signal(
    decision: ValidationDecision,
    *,
    timestamp: str,
    receipt_relative_path: Path,
) -> EmittedSignal:
    work_unit = decision.work_unit_after
    delta = decision.commit_delta_after
    signal_type, payload = _signal_content_for_decision(decision, receipt_relative_path)
    signal_id = _signal_id(work_unit.work_unit_id, timestamp)

    return EmittedSignal(
        signal_id=signal_id,
        created_at=timestamp,
        source_agent=delta.agent_personal_name,
        source_work_unit=work_unit.work_unit_id,
        source_role=delta.agent_structural_id,
        target="DAEMON",
        signal_type=signal_type,
        payload=payload,
        priority=work_unit.priority,
        status=SignalLifecycleStatus.ACTIVE,
        related_artifacts=(
            str(receipt_relative_path),
            *tuple(artifact.path for artifact in delta.produced_artifacts),
        ),
    )


def _signal_content_for_decision(
    decision: ValidationDecision,
    receipt_relative_path: Path,
) -> tuple[CanonicalSignalType, dict[str, Any]]:
    delta = decision.commit_delta_after
    output_path = (
        delta.produced_artifacts[0].path
        if delta.produced_artifacts
        else str(receipt_relative_path)
    )

    if delta.status.value in {"ACCEPTED", "ACCEPTED_AS_WITNESS"}:
        return (
            CanonicalSignalType.TASK_COMPLETE,
            {
                "work_unit_id": delta.work_unit_id,
                "output_path": output_path,
                "confidence": delta.confidence,
                "receipt_path": str(receipt_relative_path),
                "delta_id": delta.delta_id,
                "commit_status": delta.status.value,
            },
        )

    if delta.status.value == "REJECTED":
        return (
            CanonicalSignalType.TASK_FAILED,
            {
                "work_unit_id": delta.work_unit_id,
                "error": ", ".join(decision.reasons) or "VALIDATION_REJECTED",
                "recoverable": True,
                "receipt_path": str(receipt_relative_path),
                "delta_id": delta.delta_id,
            },
        )

    needed_from = "Nemesis" if "STALE_COMPETITOR_REVIEW" in decision.reasons else "Vizier"
    return (
        CanonicalSignalType.BLOCKED,
        {
            "work_unit_id": delta.work_unit_id,
            "blocker": ", ".join(decision.reasons) or "REVIEW_REQUIRED",
            "needed_from": needed_from,
            "receipt_path": str(receipt_relative_path),
            "delta_id": delta.delta_id,
        },
    )


def _receipt_filename(decision: ValidationDecision) -> str:
    return f"{decision.work_unit_after.work_unit_id}__{decision.commit_delta_after.delta_id}.validation_receipt.json"


def _signal_filename(decision: ValidationDecision, timestamp: str) -> str:
    delta = decision.commit_delta_after
    signal_type, _ = _signal_content_for_decision(decision, Path("receipt.json"))
    short = delta.delta_id[:12]
    stamp = re.sub(r"[^0-9]", "", timestamp)[:14]
    source = re.sub(r"[^A-Z0-9]+", "_", delta.agent_personal_name.upper())
    return f"{source}_{signal_type.value}_{short}_{stamp}.signal.json"


def _signal_id(work_unit_id: str, timestamp: str) -> str:
    suffix = re.sub(r"[^0-9a-z]+", "", timestamp.lower())
    return f"sig-{work_unit_id}-{suffix}"


def _resolve_child_dir(root: Path, relative_dir: str) -> Path:
    return _resolve_relative_file(root, Path(relative_dir))


def _resolve_relative_file(root: Path, relative_path: Path) -> Path:
    if relative_path.is_absolute():
        raise KernelReceiptError(f"Absolute output paths are not allowed: {relative_path}")
    resolved = (root / relative_path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise KernelReceiptError(f"Output path escapes workspace root: {relative_path}") from exc
    return resolved


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
