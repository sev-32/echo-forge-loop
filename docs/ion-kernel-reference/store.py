"""First-pass persistence layer for the active ION kernel record types.

This store is intentionally narrower than the older markdown-ion filesystem. It
persists the current machine-facing kernel records so later index, graph, and
compiler work can build on durable typed state without pretending the broader
legacy kernel has already been ported.
"""

from __future__ import annotations

from dataclasses import dataclass, fields, is_dataclass
from datetime import datetime
from enum import Enum
import json
from pathlib import Path
from types import UnionType
from typing import Any, Union, get_args, get_origin, get_type_hints

from .model import AutomationStateRecord, BranchClaimReceipt, BranchControlReceipt, BranchHorizonSyncReceipt, BranchMergeProposal, BranchRescheduleReceipt, BranchSettlementReceipt, CommitDelta, ContextPackage, ContextPerfectContinuationReceipt, ExecutorCapability, HorizonEnactmentReceipt, HorizonRecord, KernelRecord, ManifestRouteStateRecord, ManualAutomationEquivalenceReceipt, OpenQuestion, PlannerManifest, PlannerManifestSweepAggregateRecord, PlannerManifestSweepReceipt, QuestionAnswerRecord, ReviewerAnswerQueueProjectionRecord, ReviewerQueueRefreshReceipt, ScheduleCompletionReleaseReceipt, ScheduleControlReceipt, ScheduleDispatchReconciliationReceipt, ScheduleExecutorStartPacketMaterializationReceipt, ScheduleLineageArchiveReceipt, ScheduleLineageReplayReceipt, ScheduleResumeProjectionReceipt, ScheduleResumeBundleMaterializationReceipt, ScheduleTakeoverEntryActivationReceipt, ScheduleActivationHandoffCapsuleReceipt, ScheduleHandoffEntryRehearsalReceipt, ScheduleReceipt, ScheduleSettlementReceipt, TakeoverAssessmentReceipt, WorkUnit


@dataclass(frozen=True)
class RecordSpec:
    record_type: str
    directory: str
    cls: type[KernelRecord]
    id_field: str


class KernelStoreError(Exception):
    """Raised when one kernel store operation fails."""


class KernelStore:
    """Filesystem-backed persistence for the first-pass kernel record set."""

    _SPECS: tuple[RecordSpec, ...] = (
        RecordSpec(
            record_type="work_unit",
            directory="work_units",
            cls=WorkUnit,
            id_field="work_unit_id",
        ),
        RecordSpec(
            record_type="context_package",
            directory="context_packages",
            cls=ContextPackage,
            id_field="context_package_id",
        ),
        RecordSpec(
            record_type="commit_delta",
            directory="commit_deltas",
            cls=CommitDelta,
            id_field="delta_id",
        ),
        RecordSpec(
            record_type="open_question",
            directory="open_questions",
            cls=OpenQuestion,
            id_field="question_id",
        ),
        RecordSpec(
            record_type="question_answer",
            directory="question_answers",
            cls=QuestionAnswerRecord,
            id_field="answer_id",
        ),
        RecordSpec(
            record_type="reviewer_answer_queue",
            directory="reviewer_answer_queues",
            cls=ReviewerAnswerQueueProjectionRecord,
            id_field="projection_id",
        ),
        RecordSpec(
            record_type="reviewer_queue_refresh",
            directory="reviewer_queue_refresh_receipts",
            cls=ReviewerQueueRefreshReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="planner_manifest",
            directory="planner_manifests",
            cls=PlannerManifest,
            id_field="manifest_id",
        ),
        RecordSpec(
            record_type="planner_manifest_sweep",
            directory="planner_manifest_sweeps",
            cls=PlannerManifestSweepReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="planner_manifest_sweep_aggregate",
            directory="planner_manifest_sweep_aggregates",
            cls=PlannerManifestSweepAggregateRecord,
            id_field="aggregate_id",
        ),
        RecordSpec(
            record_type="manifest_route_state",
            directory="manifest_route_states",
            cls=ManifestRouteStateRecord,
            id_field="manifest_id",
        ),
        RecordSpec(
            record_type="automation_state",
            directory="automation_states",
            cls=AutomationStateRecord,
            id_field="automation_state_id",
        ),
        RecordSpec(
            record_type="horizon_state",
            directory="horizon_states",
            cls=HorizonRecord,
            id_field="horizon_id",
        ),
        RecordSpec(
            record_type="horizon_enactment_receipt",
            directory="horizon_enactment_receipts",
            cls=HorizonEnactmentReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_receipt",
            directory="schedule_receipts",
            cls=ScheduleReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="executor_capability",
            directory="executor_capabilities",
            cls=ExecutorCapability,
            id_field="capability_id",
        ),
        RecordSpec(
            record_type="takeover_assessment_receipt",
            directory="takeover_assessment_receipts",
            cls=TakeoverAssessmentReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="manual_automation_equivalence_receipt",
            directory="manual_automation_equivalence_receipts",
            cls=ManualAutomationEquivalenceReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="context_perfect_continuation_receipt",
            directory="context_perfect_continuation_receipts",
            cls=ContextPerfectContinuationReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="branch_claim_receipt",
            directory="branch_claim_receipts",
            cls=BranchClaimReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="branch_control_receipt",
            directory="branch_control_receipts",
            cls=BranchControlReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="branch_merge_proposal",
            directory="branch_merge_proposals",
            cls=BranchMergeProposal,
            id_field="proposal_id",
        ),
        RecordSpec(
            record_type="branch_settlement_receipt",
            directory="branch_settlement_receipts",
            cls=BranchSettlementReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="branch_horizon_sync_receipt",
            directory="branch_horizon_sync_receipts",
            cls=BranchHorizonSyncReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="branch_reschedule_receipt",
            directory="branch_reschedule_receipts",
            cls=BranchRescheduleReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_control_receipt",
            directory="schedule_control_receipts",
            cls=ScheduleControlReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_dispatch_reconciliation_receipt",
            directory="schedule_dispatch_reconciliation_receipts",
            cls=ScheduleDispatchReconciliationReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_completion_release_receipt",
            directory="schedule_completion_release_receipts",
            cls=ScheduleCompletionReleaseReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_settlement_receipt",
            directory="schedule_settlement_receipts",
            cls=ScheduleSettlementReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_lineage_archive_receipt",
            directory="schedule_lineage_archive_receipts",
            cls=ScheduleLineageArchiveReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_lineage_replay_receipt",
            directory="schedule_lineage_replay_receipts",
            cls=ScheduleLineageReplayReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_resume_projection_receipt",
            directory="schedule_resume_projection_receipts",
            cls=ScheduleResumeProjectionReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_resume_bundle_materialization_receipt",
            directory="schedule_resume_bundle_materialization_receipts",
            cls=ScheduleResumeBundleMaterializationReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_takeover_entry_activation_receipt",
            directory="schedule_takeover_entry_activation_receipts",
            cls=ScheduleTakeoverEntryActivationReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_activation_handoff_capsule_receipt",
            directory="schedule_activation_handoff_capsule_receipts",
            cls=ScheduleActivationHandoffCapsuleReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_handoff_entry_rehearsal_receipt",
            directory="schedule_handoff_entry_rehearsal_receipts",
            cls=ScheduleHandoffEntryRehearsalReceipt,
            id_field="receipt_id",
        ),
        RecordSpec(
            record_type="schedule_executor_start_packet_materialization_receipt",
            directory="schedule_executor_start_packet_materialization_receipts",
            cls=ScheduleExecutorStartPacketMaterializationReceipt,
            id_field="receipt_id",
        ),
    )

    _SPECS_BY_TYPE = {spec.record_type: spec for spec in _SPECS}
    _SPECS_BY_CLASS = {spec.cls: spec for spec in _SPECS}

    def __init__(self, root_dir: str | Path):
        self.root = Path(root_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    @classmethod
    def supported_record_types(cls) -> tuple[str, ...]:
        """Record families currently supported by the first-pass kernel store."""

        return tuple(spec.record_type for spec in cls._SPECS)

    def record_path(self, record_type: str, record_id: str) -> Path:
        """Resolve the deterministic on-disk path for one kernel record."""

        spec = self._spec_for_type(record_type)
        clean = record_id.strip()
        parts = clean.split("/")
        if (
            not clean
            or clean != clean.strip("/")
            or any(part in {"", ".."} for part in parts)
        ):
            raise KernelStoreError(f"Invalid record id: {record_id!r}")

        path = (self.root / spec.directory / f"{clean}.json").resolve()
        try:
            path.relative_to((self.root / spec.directory).resolve())
        except ValueError as exc:
            raise KernelStoreError(
                f"Record path escapes store directory: {record_type}::{record_id}"
            ) from exc
        return path

    def create(self, record: KernelRecord) -> Path:
        """Persist one new kernel record and fail if it already exists."""

        return self._write(record, overwrite=False)

    def replace(self, record: KernelRecord) -> Path:
        """Persist one kernel record, overwriting any prior version."""

        return self._write(record, overwrite=True)

    def read(self, record_type: str, record_id: str) -> KernelRecord:
        """Load one kernel record back into its typed dataclass form."""

        spec = self._spec_for_type(record_type)
        path = self.record_path(record_type, record_id)
        if not path.exists():
            raise KernelStoreError(f"Record not found: {record_type}::{record_id}")

        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("record_type") != spec.record_type:
            raise KernelStoreError(
                f"Stored type mismatch at {path}: expected {spec.record_type}, found {payload.get('record_type')}"
            )
        data = payload.get("data")
        if not isinstance(data, dict):
            raise KernelStoreError(f"Malformed record payload at {path}")
        return self._from_plain(spec.cls, data)

    def delete(self, record_type: str, record_id: str) -> bool:
        """Delete one stored kernel record."""

        path = self.record_path(record_type, record_id)
        if not path.exists():
            raise KernelStoreError(f"Record not found: {record_type}::{record_id}")
        path.unlink()
        parent = path.parent
        while parent != self.root and not any(parent.iterdir()):
            parent.rmdir()
            parent = parent.parent
        return True

    def exists(self, record_type: str, record_id: str) -> bool:
        """Check whether one stored record exists."""

        try:
            return self.record_path(record_type, record_id).exists()
        except KernelStoreError:
            return False

    def list_ids(self, record_type: str) -> list[str]:
        """List all stored ids for one kernel record family."""

        spec = self._spec_for_type(record_type)
        base = self.root / spec.directory
        if not base.exists():
            return []
        return sorted(str(path.relative_to(base).with_suffix("")) for path in base.rglob("*.json"))

    def list_records(self, record_type: str) -> list[KernelRecord]:
        """Load every stored record in one family."""

        return [self.read(record_type, record_id) for record_id in self.list_ids(record_type)]

    def count(self, record_type: str | None = None) -> int:
        """Count stored records globally or within one family."""

        if record_type is None:
            return sum(self.count(spec.record_type) for spec in self._SPECS)
        return len(self.list_ids(record_type))

    def summary(self) -> str:
        """Human-readable summary of current persisted record counts."""

        lines = [f"KernelStore: {self.root}", f"  Total records: {self.count()}"]
        for spec in self._SPECS:
            lines.append(f"  {spec.record_type}: {self.count(spec.record_type)}")
        return "\n".join(lines)

    def _write(self, record: KernelRecord, *, overwrite: bool) -> Path:
        spec = self._spec_for_record(record)
        record_id = self._record_id_for(record)
        path = self.record_path(spec.record_type, record_id)
        if path.exists() and not overwrite:
            raise KernelStoreError(f"Record already exists: {spec.record_type}::{record_id}")

        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "record_type": spec.record_type,
            "record_class": spec.cls.__name__,
            "stored_at": _iso_now(),
            "data": self._to_plain(record),
        }
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path

    @classmethod
    def _spec_for_type(cls, record_type: str) -> RecordSpec:
        try:
            return cls._SPECS_BY_TYPE[record_type]
        except KeyError as exc:
            raise KernelStoreError(f"Unknown record type: {record_type}") from exc

    @classmethod
    def _spec_for_record(cls, record: KernelRecord) -> RecordSpec:
        for candidate_cls, spec in cls._SPECS_BY_CLASS.items():
            if isinstance(record, candidate_cls):
                return spec
        raise KernelStoreError(f"Unsupported kernel record: {type(record).__name__}")

    @classmethod
    def _record_id_for(cls, record: KernelRecord) -> str:
        spec = cls._spec_for_record(record)
        return getattr(record, spec.id_field)

    @classmethod
    def _to_plain(cls, value: Any) -> Any:
        if isinstance(value, Enum):
            return value.value
        if is_dataclass(value):
            return {
                field.name: cls._to_plain(getattr(value, field.name))
                for field in fields(value)
            }
        if isinstance(value, tuple):
            return [cls._to_plain(item) for item in value]
        if isinstance(value, list):
            return [cls._to_plain(item) for item in value]
        if isinstance(value, dict):
            return {str(key): cls._to_plain(item) for key, item in value.items()}
        return value

    @classmethod
    def _from_plain(cls, target_type: type[Any], value: Any) -> Any:
        type_hints = get_type_hints(target_type)
        kwargs = {
            field.name: cls._coerce_value(type_hints[field.name], value[field.name])
            for field in fields(target_type)
            if field.name in value
        }
        return target_type(**kwargs)

    @classmethod
    def _coerce_value(cls, annotation: Any, value: Any) -> Any:
        if value is None or annotation is Any:
            return value

        origin = get_origin(annotation)
        args = get_args(annotation)
        if origin in (UnionType, Union):
            non_none = tuple(arg for arg in args if arg is not type(None))
            if len(non_none) == 1:
                return cls._coerce_value(non_none[0], value)

        if origin in (list, tuple):
            element_type = args[0] if args else Any
            items = [cls._coerce_value(element_type, item) for item in value]
            return tuple(items) if origin is tuple else items

        if origin is dict:
            value_type = args[1] if len(args) > 1 else Any
            return {
                str(key): cls._coerce_value(value_type, item)
                for key, item in value.items()
            }

        if isinstance(annotation, type) and issubclass(annotation, Enum):
            return annotation(value)

        if isinstance(annotation, type) and is_dataclass(annotation):
            return cls._from_plain(annotation, value)

        return value


IonStore = KernelStore


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
