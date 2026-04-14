"""First-pass higher-order daemon loop for the active ION kernel stack.

This module sits one layer above daemon act-once execution. It does not claim the
full autonomous daemon already exists. It provides the smaller truthful loop the
current stack can support today: repeatedly arbitrate and execute supported daemon
actions until the runtime reaches idle, encounters unsupported pressure, or hits
an explicit step cap.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import re

from .children import ChildAgentBinding
from .daemon_actions import DaemonActOnceResult, DaemonActOnceStatus, KernelDaemonActuator
from .graph import KernelGraph
from .index import KernelIndex
from .model import StrEnum, TierOneDoctrine
from .store import KernelStore


class DaemonLoopStatus(StrEnum):
    IDLE = "IDLE"
    BLOCKED_UNSUPPORTED = "BLOCKED_UNSUPPORTED"
    MAX_STEPS_REACHED = "MAX_STEPS_REACHED"


@dataclass(frozen=True)
class DaemonLoopResult:
    """Visible result of one bounded higher-order daemon run."""

    status: DaemonLoopStatus
    steps: tuple[DaemonActOnceResult, ...]
    final_result: DaemonActOnceResult
    run_id: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    receipt_path: str | None = None
    ledger_path: str | None = None

    @property
    def step_count(self) -> int:
        return len(self.steps)


class KernelDaemonLoopError(Exception):
    """Raised when one higher-order daemon loop request is not lawful."""


class KernelDaemonLoop:
    """Repeat daemon act-once execution until idle, unsupported, or capped."""

    def __init__(self, *, actuator: KernelDaemonActuator | None = None) -> None:
        self._actuator = actuator or KernelDaemonActuator()

    def run_until_blocked(
        self,
        store: KernelStore,
        index: KernelIndex,
        graph: KernelGraph,
        *,
        max_steps: int = 25,
        workspace_root: str | Path | None = None,
        signals_dir: str = "ION/05_context/signals",
        archive_dir: str = "ION/05_context/signals/archive",
        signal_target: str | None = "DAEMON",
        packet_output_root: str | Path | None = None,
        repo_root: str | Path | None = None,
        doctrine: TierOneDoctrine | None = None,
        agent_bindings: dict[str, ChildAgentBinding] | None = None,
        action_timestamp: str | None = None,
        history_dir: str = "ION/05_context/history",
        loop_receipts_dir: str = "ION/05_context/history/daemon_loop_receipts",
    ) -> DaemonLoopResult:
        if max_steps <= 0:
            raise KernelDaemonLoopError("max_steps must be positive.")

        started_at = action_timestamp or _iso_now()
        steps: list[DaemonActOnceResult] = []
        for _ in range(max_steps):
            step = self._actuator.act_once(
                store,
                index,
                graph,
                workspace_root=workspace_root,
                signals_dir=signals_dir,
                archive_dir=archive_dir,
                signal_target=signal_target,
                packet_output_root=packet_output_root,
                repo_root=repo_root,
                doctrine=doctrine,
                agent_bindings=agent_bindings,
                action_timestamp=action_timestamp,
            )
            steps.append(step)
            if step.status is DaemonActOnceStatus.IDLE:
                return self._finalize_result(
                    status=DaemonLoopStatus.IDLE,
                    steps=tuple(steps),
                    final_result=step,
                    workspace_root=workspace_root,
                    history_dir=history_dir,
                    loop_receipts_dir=loop_receipts_dir,
                    started_at=started_at,
                    completed_at=action_timestamp or _iso_now(),
                )
            if step.status is DaemonActOnceStatus.UNSUPPORTED:
                return self._finalize_result(
                    status=DaemonLoopStatus.BLOCKED_UNSUPPORTED,
                    steps=tuple(steps),
                    final_result=step,
                    workspace_root=workspace_root,
                    history_dir=history_dir,
                    loop_receipts_dir=loop_receipts_dir,
                    started_at=started_at,
                    completed_at=action_timestamp or _iso_now(),
                )

        return self._finalize_result(
            status=DaemonLoopStatus.MAX_STEPS_REACHED,
            steps=tuple(steps),
            final_result=steps[-1],
            workspace_root=workspace_root,
            history_dir=history_dir,
            loop_receipts_dir=loop_receipts_dir,
            started_at=started_at,
            completed_at=action_timestamp or _iso_now(),
        )


    def _finalize_result(
        self,
        *,
        status: DaemonLoopStatus,
        steps: tuple[DaemonActOnceResult, ...],
        final_result: DaemonActOnceResult,
        workspace_root: str | Path | None,
        history_dir: str,
        loop_receipts_dir: str,
        started_at: str,
        completed_at: str,
    ) -> DaemonLoopResult:
        run_id = _daemon_loop_run_id(started_at)
        receipt_path: str | None = None
        ledger_path: str | None = None

        if workspace_root is not None:
            receipt_relative_path = Path(loop_receipts_dir) / f"{run_id}.daemon_loop_receipt.json"
            ledger_relative_path = Path(history_dir) / "system_ledger.json"
            _write_loop_receipt_and_ledger(
                Path(workspace_root).resolve(),
                receipt_relative_path=receipt_relative_path,
                ledger_relative_path=ledger_relative_path,
                run_id=run_id,
                status=status,
                steps=steps,
                started_at=started_at,
                completed_at=completed_at,
            )
            receipt_path = str(receipt_relative_path)
            ledger_path = str(ledger_relative_path)

        return DaemonLoopResult(
            status=status,
            steps=steps,
            final_result=final_result,
            run_id=run_id,
            started_at=started_at,
            completed_at=completed_at,
            receipt_path=receipt_path,
            ledger_path=ledger_path,
        )


IonDaemonLoop = KernelDaemonLoop


_SAFE_ID_RE = re.compile(r"[^0-9a-z]+")


def _daemon_loop_run_id(started_at: str) -> str:
    safe = _SAFE_ID_RE.sub("-", started_at.lower()).strip("-") or "run"
    return f"daemon-loop-{safe}"


def _write_loop_receipt_and_ledger(
    workspace_root: Path,
    *,
    receipt_relative_path: Path,
    ledger_relative_path: Path,
    run_id: str,
    status: DaemonLoopStatus,
    steps: tuple[DaemonActOnceResult, ...],
    started_at: str,
    completed_at: str,
) -> None:
    receipt_path = _resolve_relative_file(workspace_root, receipt_relative_path)
    ledger_path = _resolve_relative_file(workspace_root, ledger_relative_path)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.parent.mkdir(parents=True, exist_ok=True)

    receipt_payload = {
        "run_id": run_id,
        "started_at": started_at,
        "completed_at": completed_at,
        "status": status.value,
        "step_count": len(steps),
        "steps": [
            _step_telemetry(step, index)
            for index, step in enumerate(steps, start=1)
        ],
    }
    if steps:
        receipt_payload["final_action_type"] = steps[-1].candidate.action_type.value
        receipt_payload["final_step_status"] = steps[-1].status.value
        receipt_payload["final_reason"] = steps[-1].reason

    receipt_path.write_text(json.dumps(receipt_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    ledger_rows: list[dict[str, object]] = []
    if ledger_path.exists():
        existing = json.loads(ledger_path.read_text(encoding="utf-8"))
        if not isinstance(existing, list):
            raise KernelDaemonLoopError("system_ledger.json must contain a JSON list.")
        ledger_rows = existing

    ledger_rows.append(
        {
            "event_id": run_id,
            "event_type": "daemon_loop_run",
            "created_at": completed_at,
            "status": status.value,
            "step_count": len(steps),
            "receipt_path": str(receipt_relative_path),
            "final_action_type": steps[-1].candidate.action_type.value if steps else None,
            "final_step_status": steps[-1].status.value if steps else None,
        }
    )
    ledger_path.write_text(json.dumps(ledger_rows, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _step_telemetry(step: DaemonActOnceResult, step_index: int) -> dict[str, object]:
    row: dict[str, object] = {
        "step_index": step_index,
        "action_type": step.candidate.action_type.value,
        "status": step.status.value,
        "reason": step.reason,
    }
    if step.candidate.work_unit_id:
        row["work_unit_id"] = step.candidate.work_unit_id
    if step.candidate.delta_id:
        row["delta_id"] = step.candidate.delta_id
    if step.dispatch_result is not None:
        row["dispatched_work_unit_id"] = step.dispatch_result.work_unit_after.work_unit_id
        if step.dispatch_result.packet_path is not None:
            row["dispatch_packet_path"] = str(step.dispatch_result.packet_path)
    if step.question_routing_result is not None:
        row["created_question_ids"] = [q.question_id for q in step.question_routing_result.created_questions]
    if step.planner_manifest_result is not None:
        row["planner_manifest_id"] = step.planner_manifest_result.persisted_manifest.manifest_id
        row["planner_manifest_status"] = step.planner_manifest_result.persisted_manifest.status.value
    if step.maintained_planner_manifest is not None:
        row["maintained_planner_manifest_id"] = step.maintained_planner_manifest.manifest_id
        row["maintained_planner_manifest_status"] = step.maintained_planner_manifest.status.value
        row["maintained_planner_manifest_reason"] = step.maintained_planner_manifest.status_reason
    if step.planner_manifest_sweep_result is not None:
        row["planner_manifest_sweep_receipt_id"] = step.planner_manifest_sweep_result.receipt.receipt_id
        row["swept_planner_manifest_ids"] = list(step.planner_manifest_sweep_result.receipt.maintained_manifest_ids)
        row["swept_planner_manifest_statuses"] = [status.value for status in step.planner_manifest_sweep_result.receipt.resulting_statuses]
    if step.planner_manifest_sweep_aggregate_result is not None:
        row["planner_manifest_sweep_aggregate_id"] = step.planner_manifest_sweep_aggregate_result.aggregate.aggregate_id
        row["retained_planner_sweep_receipt_ids"] = list(step.planner_manifest_sweep_aggregate_result.aggregate.retained_receipt_ids)
        row["aggregate_total_maintained_count"] = step.planner_manifest_sweep_aggregate_result.aggregate.total_maintained_count
    if step.reviewer_queue_refresh_sweep_result is not None:
        row["reviewer_queue_refresh_receipt_id"] = step.reviewer_queue_refresh_sweep_result.receipt.receipt_id
        row["refreshed_reviewer_queue_projection_ids"] = list(step.reviewer_queue_refresh_sweep_result.receipt.refreshed_projection_ids)
        row["reviewer_queue_refresh_reasons"] = list(step.reviewer_queue_refresh_sweep_result.receipt.reasons)
    if step.refreshed_reviewer_queue is not None:
        row["refreshed_reviewer_queue_projection_id"] = step.refreshed_reviewer_queue.refreshed_result.projection.projection_id
        row["refreshed_reviewer_queue_reason"] = step.refreshed_reviewer_queue.reason
        row["refreshed_pending_total_count"] = step.refreshed_reviewer_queue.refreshed_result.projection.pending_total_count
        row["refreshed_answer_total_count"] = step.refreshed_reviewer_queue.refreshed_result.projection.recent_answer_total_count
    if step.child_work_result is not None:
        row["created_child_work_unit_ids"] = [w.work_unit_id for w in step.child_work_result.created_work_units]
    if step.review_escalation_result is not None and step.review_escalation_result.created_question is not None:
        row["review_question_id"] = step.review_escalation_result.created_question.question_id
    if step.signal_interpretation_result is not None:
        interpretation = step.signal_interpretation_result.interpretation
        row["signal_id"] = interpretation.signal_id
        row["signal_type"] = interpretation.signal_type.value
        row["recommended_action"] = interpretation.recommended_action.value
    if step.signal_consumption_result is not None:
        row["archived_signal_path"] = str(step.signal_consumption_result.archive_path)
    if step.signal_follow_up_result is not None:
        row["signal_follow_up_disposition"] = step.signal_follow_up_result.disposition.value
        if step.signal_follow_up_result.created_question is not None:
            row["signal_follow_up_question_id"] = step.signal_follow_up_result.created_question.question_id
        if step.signal_follow_up_result.resolved_questions:
            row["resolved_question_ids"] = [
                resolution.question_after.question_id
                for resolution in step.signal_follow_up_result.resolved_questions
            ]
    return row


def _resolve_relative_file(root: Path, relative_path: Path) -> Path:
    if relative_path.is_absolute():
        raise KernelDaemonLoopError(f"Absolute output paths are not allowed: {relative_path}")
    resolved = (root / relative_path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise KernelDaemonLoopError(f"Output path escapes workspace root: {relative_path}") from exc
    return resolved


def _iso_now() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()
