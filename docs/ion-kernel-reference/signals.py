"""First-pass canonical signal lifecycle / interpretation helper for the ION kernel.

This module sits one layer above receipt/signal emission. It does not claim the
full daemon signal router already exists. It provides the smaller truthful path
the current stack can support today: discover active canonical `.signal.json`
artifacts, interpret the bounded meaning of the emitted canonical signal types,
consume them for one target, and expire stale signals explicitly into an archive
lane with lifecycle provenance.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
import json
from pathlib import Path

from .receipts import CanonicalSignalType, EmittedSignal, SignalLifecycleStatus
from .model import KernelRecord, StrEnum, WorkPriority


class KernelSignalConsumerError(Exception):
    """Raised when one signal consumption operation is not lawful."""


class SignalMeaning(StrEnum):
    COMPLETION = "COMPLETION"
    FAILURE = "FAILURE"
    BLOCKER = "BLOCKER"


class SignalRecommendedAction(StrEnum):
    ACKNOWLEDGE_AND_ARCHIVE = "ACKNOWLEDGE_AND_ARCHIVE"
    REPLAN_OR_RETRY = "REPLAN_OR_RETRY"
    ESCALATE_REQUIRED_ROLE = "ESCALATE_REQUIRED_ROLE"


@dataclass(frozen=True)
class SignalFileRef:
    signal: EmittedSignal
    path: Path


@dataclass(frozen=True)
class SignalInterpretation(KernelRecord):
    signal_id: str
    signal_type: CanonicalSignalType
    meaning: SignalMeaning
    recommended_action: SignalRecommendedAction
    work_unit_id: str
    delta_id: str
    summary: str
    receipt_path: str
    output_path: str | None = None
    needed_from: str | None = None
    recoverable: bool | None = None
    confidence: float | None = None


@dataclass(frozen=True)
class SignalInterpretationResult:
    signal: EmittedSignal
    interpretation: SignalInterpretation
    source_path: Path


@dataclass(frozen=True)
class SignalConsumptionResult:
    signal_before: EmittedSignal
    signal_consumed: EmittedSignal
    signal_archived: EmittedSignal
    source_path: Path
    archive_path: Path


@dataclass(frozen=True)
class SignalExpirationResult:
    signal_before: EmittedSignal
    signal_expired: EmittedSignal
    source_path: Path
    archive_path: Path
    age_seconds: int
    stale_after_seconds: int


class KernelSignalInterpreter:
    """Interpret the bounded semantics of the current canonical signal surface."""

    def __init__(self, *, signal_consumer: KernelSignalConsumer | None = None) -> None:
        self._signal_consumer = signal_consumer or KernelSignalConsumer()

    def interpret_signal(self, signal: EmittedSignal) -> SignalInterpretation:
        payload = signal.payload
        signal_type = signal.signal_type

        if signal_type is CanonicalSignalType.TASK_COMPLETE:
            work_unit_id = _require_payload_value(payload, "work_unit_id", signal)
            delta_id = _require_payload_value(payload, "delta_id", signal)
            receipt_path = _require_payload_value(payload, "receipt_path", signal)
            output_path = _require_payload_value(payload, "output_path", signal)
            confidence = float(_require_payload_value(payload, "confidence", signal))
            return SignalInterpretation(
                signal_id=signal.signal_id,
                signal_type=signal_type,
                meaning=SignalMeaning.COMPLETION,
                recommended_action=SignalRecommendedAction.ACKNOWLEDGE_AND_ARCHIVE,
                work_unit_id=work_unit_id,
                delta_id=delta_id,
                summary=f"Completion recorded for {work_unit_id}; acknowledge and archive.",
                receipt_path=receipt_path,
                output_path=output_path,
                confidence=confidence,
            )

        if signal_type is CanonicalSignalType.TASK_FAILED:
            work_unit_id = _require_payload_value(payload, "work_unit_id", signal)
            delta_id = _require_payload_value(payload, "delta_id", signal)
            receipt_path = _require_payload_value(payload, "receipt_path", signal)
            recoverable = bool(_require_payload_value(payload, "recoverable", signal))
            return SignalInterpretation(
                signal_id=signal.signal_id,
                signal_type=signal_type,
                meaning=SignalMeaning.FAILURE,
                recommended_action=SignalRecommendedAction.REPLAN_OR_RETRY,
                work_unit_id=work_unit_id,
                delta_id=delta_id,
                summary=f"Failure recorded for {work_unit_id}; replan or retry the work.",
                receipt_path=receipt_path,
                recoverable=recoverable,
            )

        if signal_type is CanonicalSignalType.BLOCKED:
            work_unit_id = _require_payload_value(payload, "work_unit_id", signal)
            delta_id = _require_payload_value(payload, "delta_id", signal)
            receipt_path = _require_payload_value(payload, "receipt_path", signal)
            needed_from = _require_payload_value(payload, "needed_from", signal)
            return SignalInterpretation(
                signal_id=signal.signal_id,
                signal_type=signal_type,
                meaning=SignalMeaning.BLOCKER,
                recommended_action=SignalRecommendedAction.ESCALATE_REQUIRED_ROLE,
                work_unit_id=work_unit_id,
                delta_id=delta_id,
                summary=f"Work unit {work_unit_id} is blocked; escalate to {needed_from}.",
                receipt_path=receipt_path,
                needed_from=needed_from,
            )

        raise KernelSignalConsumerError(
            f"Unsupported canonical signal type: {signal.signal_type}"
        )

    def interpret_active_signals(
        self,
        workspace_root: str | Path,
        *,
        signals_dir: str = "ION/05_context/signals",
        target: str | None = "DAEMON",
    ) -> tuple[SignalInterpretationResult, ...]:
        return tuple(
            SignalInterpretationResult(
                signal=signal_ref.signal,
                interpretation=self.interpret_signal(signal_ref.signal),
                source_path=signal_ref.path,
            )
            for signal_ref in self._signal_consumer.discover_active_signals(
                workspace_root,
                signals_dir=signals_dir,
                target=target,
            )
        )

    def interpret_signal_path(
        self,
        workspace_root: str | Path,
        signal_path: str | Path,
        *,
        signals_dir: str = "ION/05_context/signals",
    ) -> SignalInterpretationResult:
        resolved_path = _resolve_signal_path(
            workspace_root,
            signal_path,
            signals_dir=signals_dir,
        )
        signal = _read_signal(resolved_path)
        if signal.status is not SignalLifecycleStatus.ACTIVE:
            raise KernelSignalConsumerError(
                f"Signal is not ACTIVE: {resolved_path} ({signal.status})"
            )
        return SignalInterpretationResult(
            signal=signal,
            interpretation=self.interpret_signal(signal),
            source_path=resolved_path,
        )


class KernelSignalConsumer:
    """Discover, consume, and archive canonical active signal artifacts."""

    def discover_active_signals(
        self,
        workspace_root: str | Path,
        *,
        signals_dir: str = "ION/05_context/signals",
        target: str | None = "DAEMON",
    ) -> tuple[SignalFileRef, ...]:
        resolved_signals_dir = _resolve_dir(workspace_root, signals_dir)
        if not resolved_signals_dir.exists():
            return ()

        discovered: list[SignalFileRef] = []
        for path in sorted(resolved_signals_dir.glob("*.signal.json")):
            signal = _read_signal(path)
            if signal.status is not SignalLifecycleStatus.ACTIVE:
                continue
            if target is not None and signal.target != target:
                continue
            discovered.append(SignalFileRef(signal=signal, path=path))
        return tuple(discovered)

    def discover_stale_signals(
        self,
        workspace_root: str | Path,
        *,
        stale_after_seconds: int,
        as_of: str | None = None,
        signals_dir: str = "ION/05_context/signals",
        target: str | None = "DAEMON",
    ) -> tuple[SignalFileRef, ...]:
        if stale_after_seconds < 0:
            raise KernelSignalConsumerError("stale_after_seconds must be non-negative.")

        reference_time = _parse_iso(as_of or _iso_now())
        stale_signals: list[SignalFileRef] = []
        for signal_ref in self.discover_active_signals(
            workspace_root,
            signals_dir=signals_dir,
            target=target,
        ):
            age_seconds = _signal_age_seconds(signal_ref.signal, reference_time)
            if age_seconds > stale_after_seconds:
                stale_signals.append(signal_ref)
        return tuple(stale_signals)

    def consume_signal(
        self,
        workspace_root: str | Path,
        signal_path: str | Path,
        *,
        consumer: str = "DAEMON",
        signals_dir: str = "ION/05_context/signals",
        archive_dir: str = "ION/05_context/signals/archive",
        consumed_at: str | None = None,
    ) -> SignalConsumptionResult:
        timestamp = consumed_at or _iso_now()
        resolved_signals_dir = _resolve_dir(workspace_root, signals_dir)
        resolved_archive_dir = _resolve_dir(workspace_root, archive_dir)
        resolved_source_path = _resolve_signal_path(
            workspace_root,
            signal_path,
            signals_dir=signals_dir,
        )

        signal_before = _read_signal(resolved_source_path)
        if signal_before.status is not SignalLifecycleStatus.ACTIVE:
            raise KernelSignalConsumerError(
                f"Signal is not ACTIVE: {resolved_source_path} ({signal_before.status})"
            )

        signal_consumed = replace(
            signal_before,
            status=SignalLifecycleStatus.CONSUMED,
            consumed_by=consumer,
            consumed_at=timestamp,
        )
        signal_archived = replace(signal_consumed, status=SignalLifecycleStatus.ARCHIVED)

        archive_path = _archive_signal(
            source_path=resolved_source_path,
            archive_dir=resolved_archive_dir,
            signal=signal_archived,
        )

        return SignalConsumptionResult(
            signal_before=signal_before,
            signal_consumed=signal_consumed,
            signal_archived=signal_archived,
            source_path=resolved_source_path,
            archive_path=archive_path,
        )

    def expire_signal(
        self,
        workspace_root: str | Path,
        signal_path: str | Path,
        *,
        expirer: str = "DAEMON",
        signals_dir: str = "ION/05_context/signals",
        archive_dir: str = "ION/05_context/signals/archive",
        stale_after_seconds: int,
        expired_at: str | None = None,
    ) -> SignalExpirationResult:
        if stale_after_seconds < 0:
            raise KernelSignalConsumerError("stale_after_seconds must be non-negative.")

        timestamp = expired_at or _iso_now()
        reference_time = _parse_iso(timestamp)
        resolved_archive_dir = _resolve_dir(workspace_root, archive_dir)
        resolved_source_path = _resolve_signal_path(
            workspace_root,
            signal_path,
            signals_dir=signals_dir,
        )

        signal_before = _read_signal(resolved_source_path)
        if signal_before.status is not SignalLifecycleStatus.ACTIVE:
            raise KernelSignalConsumerError(
                f"Signal is not ACTIVE: {resolved_source_path} ({signal_before.status})"
            )

        age_seconds = _signal_age_seconds(signal_before, reference_time)
        if age_seconds <= stale_after_seconds:
            raise KernelSignalConsumerError(
                f"Signal is not stale: {resolved_source_path} (age={age_seconds}s, threshold={stale_after_seconds}s)"
            )

        signal_expired = replace(
            signal_before,
            status=SignalLifecycleStatus.EXPIRED,
            expired_by=expirer,
            expired_at=timestamp,
        )
        archive_path = _archive_signal(
            source_path=resolved_source_path,
            archive_dir=resolved_archive_dir,
            signal=signal_expired,
        )
        return SignalExpirationResult(
            signal_before=signal_before,
            signal_expired=signal_expired,
            source_path=resolved_source_path,
            archive_path=archive_path,
            age_seconds=age_seconds,
            stale_after_seconds=stale_after_seconds,
        )

    def consume_active_signals(
        self,
        workspace_root: str | Path,
        *,
        consumer: str = "DAEMON",
        signals_dir: str = "ION/05_context/signals",
        archive_dir: str = "ION/05_context/signals/archive",
        target: str | None = "DAEMON",
        consumed_at: str | None = None,
    ) -> tuple[SignalConsumptionResult, ...]:
        results: list[SignalConsumptionResult] = []
        for signal_ref in self.discover_active_signals(
            workspace_root,
            signals_dir=signals_dir,
            target=target,
        ):
            results.append(
                self.consume_signal(
                    workspace_root,
                    signal_ref.path,
                    consumer=consumer,
                    signals_dir=signals_dir,
                    archive_dir=archive_dir,
                    consumed_at=consumed_at,
                )
            )
        return tuple(results)

    def expire_stale_signals(
        self,
        workspace_root: str | Path,
        *,
        expirer: str = "DAEMON",
        stale_after_seconds: int,
        as_of: str | None = None,
        signals_dir: str = "ION/05_context/signals",
        archive_dir: str = "ION/05_context/signals/archive",
        target: str | None = "DAEMON",
    ) -> tuple[SignalExpirationResult, ...]:
        timestamp = as_of or _iso_now()
        results: list[SignalExpirationResult] = []
        for signal_ref in self.discover_stale_signals(
            workspace_root,
            stale_after_seconds=stale_after_seconds,
            as_of=timestamp,
            signals_dir=signals_dir,
            target=target,
        ):
            results.append(
                self.expire_signal(
                    workspace_root,
                    signal_ref.path,
                    expirer=expirer,
                    signals_dir=signals_dir,
                    archive_dir=archive_dir,
                    stale_after_seconds=stale_after_seconds,
                    expired_at=timestamp,
                )
            )
        return tuple(results)


IonSignalConsumer = KernelSignalConsumer
IonSignalInterpreter = KernelSignalInterpreter


def _read_signal(path: Path) -> EmittedSignal:
    payload = json.loads(path.read_text(encoding="utf-8"))
    try:
        return EmittedSignal(
            signal_id=payload["signal_id"],
            created_at=payload["created_at"],
            source_agent=payload["source_agent"],
            source_work_unit=payload["source_work_unit"],
            source_role=payload["source_role"],
            target=payload["target"],
            signal_type=CanonicalSignalType(payload["signal_type"]),
            payload=payload["payload"],
            priority=WorkPriority(payload["priority"]),
            status=SignalLifecycleStatus(payload["status"]),
            consumed_by=payload.get("consumed_by"),
            consumed_at=payload.get("consumed_at"),
            expired_by=payload.get("expired_by"),
            expired_at=payload.get("expired_at"),
            related_artifacts=tuple(payload.get("related_artifacts", ())),
        )
    except KeyError as exc:
        raise KernelSignalConsumerError(f"Malformed signal payload at {path}: missing {exc}") from exc
    except ValueError as exc:
        raise KernelSignalConsumerError(f"Malformed signal enum at {path}: {exc}") from exc


def _resolve_dir(workspace_root: str | Path, relative_dir: str) -> Path:
    root = Path(workspace_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    candidate = (root / relative_dir).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise KernelSignalConsumerError(
            f"Configured directory escapes workspace root: {relative_dir}"
        ) from exc
    return candidate


def _resolve_signal_path(
    workspace_root: str | Path,
    signal_path: str | Path,
    *,
    signals_dir: str,
) -> Path:
    root = Path(workspace_root).resolve()
    base_signals_dir = _resolve_dir(root, signals_dir)

    candidate = Path(signal_path)
    if not candidate.is_absolute():
        candidate = (root / candidate).resolve()
    else:
        candidate = candidate.resolve()

    if candidate.suffixes[-2:] != [".signal", ".json"]:
        raise KernelSignalConsumerError(f"Not a canonical .signal.json path: {signal_path}")
    try:
        candidate.relative_to(base_signals_dir)
    except ValueError as exc:
        raise KernelSignalConsumerError(
            f"Signal path is outside configured signals dir: {signal_path}"
        ) from exc
    if not candidate.exists():
        raise KernelSignalConsumerError(f"Signal path does not exist: {signal_path}")
    return candidate


def _archive_signal(*, source_path: Path, archive_dir: Path, signal: EmittedSignal) -> Path:
    archive_path = (archive_dir / source_path.name).resolve()
    try:
        archive_path.relative_to(archive_dir)
    except ValueError as exc:
        raise KernelSignalConsumerError(
            f"Archive path escapes archive dir: {archive_path}"
        ) from exc
    if archive_path.exists():
        raise KernelSignalConsumerError(f"Archive target already exists: {archive_path}")

    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_path.write_text(
        json.dumps(signal.to_dict(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    source_path.unlink()
    return archive_path


def _require_payload_value(
    payload: dict[str, object],
    key: str,
    signal: EmittedSignal,
) -> str | bool | float:
    if key not in payload:
        raise KernelSignalConsumerError(
            f"Malformed canonical signal payload for {signal.signal_id}: missing {key}"
        )
    return payload[key]  # type: ignore[return-value]


def _signal_age_seconds(signal: EmittedSignal, reference_time: datetime) -> int:
    created_at = _parse_iso(signal.created_at)
    return int((reference_time - created_at).total_seconds())


def _parse_iso(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise KernelSignalConsumerError(f"Malformed timestamp: {value}") from exc


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
