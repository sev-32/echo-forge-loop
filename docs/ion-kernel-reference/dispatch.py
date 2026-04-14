"""First-pass dispatch helper for the active ION kernel stack.

This module sits one layer above the bounded scheduler. It does not claim the full
daemon dispatcher, signal router, or execution loop already exists. It provides the
smaller truthful path the current stack can support today: confirm a work unit is
dispatchable, require a matching compiled context package, emit a durable dispatch
packet, and persist the `PENDING -> DISPATCHED` transition.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
import json
from pathlib import Path

from .context_compiler import render_context_package_text
from .graph import KernelGraph
from .index import KernelIndex
from .model import ContextPackage, KernelRecord, WorkPriority, WorkUnit, WorkUnitStatus
from .scheduler import KernelScheduler, WorkUnitDispatchAssessment
from .store import KernelStore


class KernelDispatchError(Exception):
    """Raised when one dispatch operation cannot be completed lawfully."""


@dataclass(frozen=True)
class DispatchPacket(KernelRecord):
    """Minimal durable packet emitted when one work unit is dispatched."""

    dispatched_at: str
    work_unit_id: str
    context_package_id: str
    context_version: str
    protocol_id: str
    transition_id: str
    agent_personal_name: str
    agent_role: str
    agent_structural_id: str
    chassis: str
    bound_template: str
    scope_ref: str
    priority: WorkPriority
    target_files: tuple[str, ...]
    allowed_writes: tuple[str, ...]
    allowed_next_actions: tuple[str, ...]
    objective: str
    task_payload: str
    expected_output_schema: str | None = None
    open_questions: tuple[str, ...] = ()


@dataclass(frozen=True)
class DispatchPreparation:
    """Resolved dispatch packet plus the assessed work unit and compiled context."""

    assessment: WorkUnitDispatchAssessment
    context_package: ContextPackage
    packet: DispatchPacket


@dataclass(frozen=True)
class DispatchResult:
    """Result of persisting a dispatch transition."""

    preparation: DispatchPreparation
    work_unit_before: WorkUnit
    work_unit_after: WorkUnit
    packet_path: Path | None = None


class KernelDispatcher:
    """Prepare and persist bounded dispatch transitions for the current kernel."""

    def __init__(self, *, scheduler: KernelScheduler | None = None) -> None:
        self._scheduler = scheduler or KernelScheduler()

    def prepare_dispatch(
        self,
        index: KernelIndex,
        graph: KernelGraph,
        work_unit_id: str,
        *,
        dispatched_at: str | None = None,
    ) -> DispatchPreparation:
        assessment = self._scheduler.assess_work_unit(index, graph, work_unit_id)
        if not assessment.dispatchable:
            raise KernelDispatchError(
                f"Work unit is not dispatchable: {work_unit_id} ({assessment.reason})"
            )

        work_unit = assessment.work_unit
        context_package = _resolve_context_package(index, work_unit)
        packet = DispatchPacket(
            dispatched_at=dispatched_at or _iso_now(),
            work_unit_id=work_unit.work_unit_id,
            context_package_id=context_package.context_package_id,
            context_version=context_package.context_version,
            protocol_id=work_unit.protocol_id,
            transition_id=work_unit.transition_id,
            agent_personal_name=work_unit.agent_personal_name,
            agent_role=work_unit.agent_role,
            agent_structural_id=work_unit.agent_structural_id,
            chassis=work_unit.chassis,
            bound_template=work_unit.bound_template,
            scope_ref=work_unit.scope_ref,
            priority=work_unit.priority,
            target_files=tuple(
                target_file.path for target_file in context_package.tiers.tier_2_target.target_files
            ),
            allowed_writes=work_unit.allowed_writes,
            allowed_next_actions=work_unit.allowed_next_actions,
            objective=context_package.tiers.tier_3_mission.objective,
            task_payload=context_package.tiers.tier_3_mission.task_payload,
            expected_output_schema=work_unit.expected_output_schema,
            open_questions=context_package.tiers.tier_4_semantic.open_questions,
        )
        return DispatchPreparation(
            assessment=assessment,
            context_package=context_package,
            packet=packet,
        )

    def dispatch_work_unit(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        work_unit_id: str,
        *,
        dispatched_at: str | None = None,
        packet_output_path: str | Path | None = None,
    ) -> DispatchResult:
        preparation = self.prepare_dispatch(
            index,
            graph,
            work_unit_id,
            dispatched_at=dispatched_at,
        )
        work_unit_before = preparation.assessment.work_unit
        work_unit_after = replace(work_unit_before, status=WorkUnitStatus.DISPATCHED)
        store.replace(work_unit_after)
        index.record_changed(work_unit_after)

        packet_path = None
        if packet_output_path is not None:
            packet_path = write_dispatch_packet(
                preparation.packet,
                preparation.context_package,
                packet_output_path,
            )

        return DispatchResult(
            preparation=preparation,
            work_unit_before=work_unit_before,
            work_unit_after=work_unit_after,
            packet_path=packet_path,
        )

    def dispatch_next(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        dispatched_at: str | None = None,
        packet_output_path: str | Path | None = None,
    ) -> DispatchResult | None:
        next_item = self._scheduler.next_dispatchable(index, graph)
        if next_item is None:
            return None
        return self.dispatch_work_unit(
            store,
            index,
            graph,
            next_item.work_unit.work_unit_id,
            dispatched_at=dispatched_at,
            packet_output_path=packet_output_path,
        )


IonDispatcher = KernelDispatcher


def render_dispatch_packet(packet: DispatchPacket, context_package: ContextPackage) -> str:
    """Render one dispatch packet into a durable machine-readable payload."""

    payload = {
        "packet": packet.to_dict(),
        "context_package": context_package.to_dict(),
        "context_package_text": render_context_package_text(context_package),
    }
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def write_dispatch_packet(
    packet: DispatchPacket,
    context_package: ContextPackage,
    output_path: str | Path,
) -> Path:
    """Persist one dispatch packet to disk."""

    resolved_output = Path(output_path)
    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    resolved_output.write_text(
        render_dispatch_packet(packet, context_package),
        encoding="utf-8",
    )
    return resolved_output


def _resolve_context_package(index: KernelIndex, work_unit: WorkUnit) -> ContextPackage:
    record = index.get("context_package", work_unit.context_package_id)
    if not isinstance(record, ContextPackage):
        raise KernelDispatchError(
            f"Missing context package for work unit {work_unit.work_unit_id}: {work_unit.context_package_id}"
        )

    if record.work_unit_id != work_unit.work_unit_id:
        raise KernelDispatchError(
            "Context package work-unit mismatch: "
            f"expected {work_unit.work_unit_id}, found {record.work_unit_id}"
        )
    if record.protocol_id != work_unit.protocol_id:
        raise KernelDispatchError(
            "Context package protocol mismatch: "
            f"expected {work_unit.protocol_id}, found {record.protocol_id}"
        )
    if record.transition_id != work_unit.transition_id:
        raise KernelDispatchError(
            "Context package transition mismatch: "
            f"expected {work_unit.transition_id}, found {record.transition_id}"
        )
    if record.context_version != work_unit.context_version:
        raise KernelDispatchError(
            "Context package version mismatch: "
            f"expected {work_unit.context_version}, found {record.context_version}"
        )
    if record.agent_identity.personal_name != work_unit.agent_personal_name:
        raise KernelDispatchError(
            "Context package personal-name mismatch: "
            f"expected {work_unit.agent_personal_name}, found {record.agent_identity.personal_name}"
        )
    if record.agent_identity.role != work_unit.agent_role:
        raise KernelDispatchError(
            "Context package role mismatch: "
            f"expected {work_unit.agent_role}, found {record.agent_identity.role}"
        )
    if record.agent_identity.structural_identity != work_unit.agent_structural_id:
        raise KernelDispatchError(
            "Context package structural-identity mismatch: "
            f"expected {work_unit.agent_structural_id}, found {record.agent_identity.structural_identity}"
        )
    return record


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
