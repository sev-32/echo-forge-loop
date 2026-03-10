"""
Autonomous Loop — Full AI Build Cycle Orchestrator
====================================================

Chains the entire IDE pipeline into an autonomous loop:
  generate → apply → snapshot → verify → debug → retry

State Machine:
  IDLE → GENERATING → APPLYING → SNAPSHOTTING → VERIFYING →
    (if pass) → COMPLETE
    (if fail) → DEBUGGING → APPLYING → SNAPSHOTTING → VERIFYING → ...
    (if max retries) → FAILED

Each transition emits SSE events for real-time UI updates.

Usage:
  loop = AutonomousLoop(project_path="/path/to/project")
  async for event in loop.run("Add a user auth system"):
      print(event)
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import AsyncIterator, Optional

from code_gen import run_code_gen_stream, run_auto_debug_stream, apply_operations
from run_history import get_run_store
from git_ops import get_git_manager
from verification_engine import get_verification_engine

logger = logging.getLogger("echo_forge.autonomous")


# ═══════════════════════════════════════════════════════
# STATE MACHINE
# ═══════════════════════════════════════════════════════

class LoopState(str, Enum):
    IDLE = "idle"
    PLANNING = "planning"
    GENERATING = "generating"
    APPLYING = "applying"
    SNAPSHOTTING = "snapshotting"
    VERIFYING = "verifying"
    DEBUGGING = "debugging"
    COMPLETE = "complete"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class LoopIteration:
    """Record of a single generate-apply-verify cycle."""
    iteration: int
    phase: str  # "initial" or "debug_retry"
    generated_operations: list = field(default_factory=list)
    applied_results: list = field(default_factory=list)
    snapshot: dict = field(default_factory=dict)
    verification: dict = field(default_factory=dict)
    debug_diagnosis: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)
    tokens_used: int = 0
    duration_ms: int = 0


@dataclass
class LoopSession:
    """Full autonomous session state."""
    session_id: str
    prompt: str
    project_path: str
    state: LoopState = LoopState.IDLE
    iterations: list[LoopIteration] = field(default_factory=list)
    max_retries: int = 3
    current_iteration: int = 0
    total_tokens: int = 0
    total_duration_ms: int = 0
    run_id: str = ""
    error: str = ""
    created_at: float = 0.0

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "prompt": self.prompt,
            "state": self.state.value,
            "current_iteration": self.current_iteration,
            "max_retries": self.max_retries,
            "total_tokens": self.total_tokens,
            "total_duration_ms": self.total_duration_ms,
            "run_id": self.run_id,
            "error": self.error,
            "iterations": len(self.iterations),
        }


# ═══════════════════════════════════════════════════════
# AUTONOMOUS LOOP ENGINE
# ═══════════════════════════════════════════════════════

class AutonomousLoop:
    """
    Orchestrates the full autonomous build cycle.
    
    Yields SSE-compatible event dicts throughout execution.
    """

    def __init__(
        self,
        project_path: str = "",
        max_retries: int = 3,
        verify_steps: list[str] | None = None,
    ):
        self.project_path = project_path or str(Path.cwd())
        self.max_retries = max_retries
        self.verify_steps = verify_steps
        self._cancelled = False
        self._session: Optional[LoopSession] = None

    def cancel(self):
        """Cancel the running loop."""
        self._cancelled = True
        if self._session:
            self._session.state = LoopState.CANCELLED

    @property
    def session(self) -> Optional[LoopSession]:
        return self._session

    async def run(
        self,
        prompt: str,
        file_context: dict[str, str] | None = None,
        conversation: list[dict] | None = None,
    ) -> AsyncIterator[dict]:
        """
        Execute the full autonomous loop.
        
        Yields event dicts:
            {type: "loop_start", ...}
            {type: "state_change", state: "generating", ...}
            {type: "codegen_thinking", thinking: "..."}
            {type: "codegen_result", operations: [...]}
            {type: "apply_result", results: [...]}
            {type: "snapshot_result", commit: "..."}
            {type: "verify_start", steps: [...]}
            {type: "verify_result", passed: bool, report: {...}}
            {type: "debug_start", errors: "..."}
            {type: "debug_diagnosis", diagnosis: "...", fix: {...}}
            {type: "loop_complete", summary: {...}}
            {type: "loop_failed", error: "...", summary: {...}}
        """
        session_id = str(uuid.uuid4())[:8]
        self._session = LoopSession(
            session_id=session_id,
            prompt=prompt,
            project_path=self.project_path,
            max_retries=self.max_retries,
            created_at=time.time(),
        )
        self._cancelled = False

        store = get_run_store()
        git = get_git_manager(self.project_path)
        verifier = get_verification_engine(self.project_path)

        # Record the run
        run_id = store.record_run(
            run_type="autonomous",
            prompt=prompt,
            project_type=verifier.detect_project_type(),
        )
        self._session.run_id = run_id

        loop_start = time.monotonic()

        yield self._event("loop_start", {
            "session_id": session_id,
            "prompt": prompt,
            "project_type": verifier.detect_project_type(),
            "max_retries": self.max_retries,
        })

        # ── Build learning context ──
        learning_ctx = store.build_learning_context(
            prompt, verifier.detect_project_type()
        )
        if learning_ctx:
            yield self._event("learning_context", {
                "has_learning": True,
                "context_length": len(learning_ctx),
            })

        # ── Main loop ──
        operations = None
        iteration_num = 0

        while iteration_num <= self.max_retries:
            if self._cancelled:
                yield self._event("loop_cancelled", self._session.to_dict())
                store.score_run(run_id, "cancelled")
                return

            iteration = LoopIteration(
                iteration=iteration_num,
                phase="initial" if iteration_num == 0 else "debug_retry",
            )
            iter_start = time.monotonic()

            # ── STEP 1: Generate (or debug-fix) ──
            if iteration_num == 0:
                # Initial generation
                yield self._state_change(LoopState.GENERATING)
                yield self._event("iteration_start", {
                    "iteration": iteration_num,
                    "phase": "initial",
                })

                operations = []
                async for evt in run_code_gen_stream(
                    prompt=prompt,
                    file_context=file_context,
                    project_path=self.project_path,
                    conversation=conversation,
                ):
                    if evt.get("type") == "codegen_thinking":
                        yield self._event("codegen_thinking", {
                            "thinking": evt.get("thinking", ""),
                        })
                    elif evt.get("type") == "codegen_result":
                        operations = evt.get("operations", [])
                        iteration.generated_operations = operations
                        iteration.tokens_used = evt.get("tokens", 0)
                        yield self._event("codegen_result", {
                            "operation_count": len(operations),
                            "plan": evt.get("plan", ""),
                            "tokens": evt.get("tokens", 0),
                        })
                    elif evt.get("type") == "codegen_error":
                        self._session.error = evt.get("error", "Generation failed")
                        yield self._event("loop_failed", {
                            "error": self._session.error,
                            "phase": "generation",
                        })
                        store.score_run(run_id, "failure",
                                        error_text=self._session.error)
                        self._session.state = LoopState.FAILED
                        return

            # ── STEP 2: Apply operations ──
            if operations:
                yield self._state_change(LoopState.APPLYING)
                try:
                    results = apply_operations(operations, self.project_path)
                    iteration.applied_results = results
                    applied_ok = all(r.get("success") for r in results)
                    
                    yield self._event("apply_result", {
                        "total": len(results),
                        "success": sum(1 for r in results if r.get("success")),
                        "failed": sum(1 for r in results if not r.get("success")),
                        "files": [r.get("path", "") for r in results],
                    })

                    if not applied_ok:
                        fail_msgs = [r.get("error", "") for r in results if not r.get("success")]
                        iteration.errors = fail_msgs
                except Exception as e:
                    yield self._event("apply_error", {"error": str(e)})
                    iteration.errors = [str(e)]

            # ── STEP 3: Git snapshot ──
            yield self._state_change(LoopState.SNAPSHOTTING)
            try:
                snap = git.snapshot(
                    message=f"autonomous[{iteration_num}]: {prompt[:80]}",
                    metadata={
                        "run_id": run_id,
                        "iteration": iteration_num,
                        "session_id": session_id,
                    },
                )
                iteration.snapshot = snap
                yield self._event("snapshot_result", snap)
            except Exception as e:
                logger.warning(f"Snapshot failed: {e}")
                yield self._event("snapshot_skipped", {"reason": str(e)})

            # ── STEP 4: Verify ──
            yield self._state_change(LoopState.VERIFYING)
            report = await verifier.verify(steps=self.verify_steps)
            iteration.verification = report.to_dict()

            yield self._event("verify_result", {
                "passed": report.passed,
                "summary": report.summary(),
                "total_errors": report.total_errors,
                "duration_ms": report.duration_ms,
                "steps": [{
                    "step": r.step,
                    "passed": r.passed,
                    "error_count": len(r.errors),
                } for r in report.results],
            })

            # ── STEP 5: Decision point ──
            iteration.duration_ms = int((time.monotonic() - iter_start) * 1000)
            self._session.iterations.append(iteration)
            self._session.total_tokens += iteration.tokens_used

            if report.passed:
                # SUCCESS
                self._session.state = LoopState.COMPLETE
                total_ms = int((time.monotonic() - loop_start) * 1000)
                self._session.total_duration_ms = total_ms

                store.score_run(run_id, "success", score=1.0,
                                auto_feedback=f"Passed after {iteration_num} retries")
                store.add_event(run_id, "complete", {
                    "iterations": iteration_num + 1,
                    "duration_ms": total_ms,
                })

                yield self._event("loop_complete", {
                    "iterations": iteration_num + 1,
                    "total_tokens": self._session.total_tokens,
                    "total_duration_ms": total_ms,
                    "commit": iteration.snapshot.get("commit", ""),
                })
                return

            # FAILED — attempt debug
            if iteration_num >= self.max_retries:
                break

            # ── STEP 6: Debug and retry ──
            yield self._state_change(LoopState.DEBUGGING)
            yield self._event("debug_start", {
                "iteration": iteration_num + 1,
                "errors": report.error_text()[:1000],
            })

            store.add_event(run_id, "debug_retry", {
                "iteration": iteration_num,
                "errors": report.total_errors,
            })

            # Collect file context for the failing files
            debug_file_ctx = file_context or {}
            for result in report.results:
                for error_line in result.errors:
                    # Try to extract file paths from error messages
                    for part in error_line.split():
                        if "/" in part or "\\" in part:
                            fpath = Path(self.project_path) / part.split(":")[0]
                            if fpath.exists() and fpath.stat().st_size < 50000:
                                try:
                                    debug_file_ctx[str(fpath)] = fpath.read_text(
                                        encoding="utf-8", errors="replace"
                                    )
                                except Exception:
                                    pass

            # Run auto-debug
            operations = []
            async for evt in run_auto_debug_stream(
                error_text=report.error_text(),
                file_context=debug_file_ctx,
                project_path=self.project_path,
            ):
                if evt.get("type") == "debug_diagnosis":
                    iteration.debug_diagnosis = {
                        "diagnosis": evt.get("diagnosis", ""),
                        "root_cause": evt.get("root_cause", ""),
                    }
                    yield self._event("debug_diagnosis", {
                        "diagnosis": evt.get("diagnosis", ""),
                        "root_cause": evt.get("root_cause", ""),
                    })
                elif evt.get("type") == "debug_fix":
                    fix = evt.get("fix", {})
                    operations = fix.get("operations", [])
                    yield self._event("debug_fix", {
                        "plan": fix.get("plan", ""),
                        "operation_count": len(operations),
                    })
                elif evt.get("type") == "debug_error":
                    yield self._event("debug_error", {
                        "error": evt.get("error", "Debug failed"),
                    })

            iteration_num += 1

        # ── Exhausted retries ──
        self._session.state = LoopState.FAILED
        total_ms = int((time.monotonic() - loop_start) * 1000)
        self._session.total_duration_ms = total_ms
        self._session.error = f"Failed after {self.max_retries} retries"

        store.score_run(run_id, "failure", score=0.0,
                        error_text=self._session.error,
                        auto_feedback=f"Exhausted {self.max_retries} retries")

        yield self._event("loop_failed", {
            "error": self._session.error,
            "iterations": iteration_num,
            "total_tokens": self._session.total_tokens,
            "total_duration_ms": total_ms,
        })

    # ── Event helpers ──

    def _event(self, event_type: str, data: dict) -> dict:
        return {"type": event_type, **data}

    def _state_change(self, new_state: LoopState) -> dict:
        if self._session:
            self._session.state = new_state
            self._session.current_iteration = len(self._session.iterations)
        return {
            "type": "state_change",
            "state": new_state.value,
            "iteration": self._session.current_iteration if self._session else 0,
        }


# ═══════════════════════════════════════════════════════
# SESSION MANAGER — tracks active/completed loops
# ═══════════════════════════════════════════════════════

class LoopManager:
    """Manages autonomous loop sessions."""

    def __init__(self):
        self._active: Optional[AutonomousLoop] = None
        self._history: list[dict] = []

    @property
    def active(self) -> Optional[AutonomousLoop]:
        return self._active

    @property
    def is_running(self) -> bool:
        return (
            self._active is not None
            and self._active.session is not None
            and self._active.session.state
            not in (LoopState.COMPLETE, LoopState.FAILED, LoopState.CANCELLED, LoopState.IDLE)
        )

    def start(self, project_path: str = "", max_retries: int = 3) -> AutonomousLoop:
        """Create and register a new autonomous loop."""
        if self.is_running:
            raise RuntimeError("An autonomous loop is already running")
        self._active = AutonomousLoop(
            project_path=project_path,
            max_retries=max_retries,
        )
        return self._active

    def cancel(self):
        """Cancel the active loop."""
        if self._active:
            self._active.cancel()

    def finish(self):
        """Archive the active session."""
        if self._active and self._active.session:
            self._history.append(self._active.session.to_dict())
        self._active = None

    def status(self) -> dict:
        """Get current loop status."""
        if self._active and self._active.session:
            return {
                "active": True,
                **self._active.session.to_dict(),
            }
        return {
            "active": False,
            "history_count": len(self._history),
        }

    def history(self, limit: int = 10) -> list[dict]:
        return self._history[-limit:]


# ── Singleton ────────────────────────────────────────

_manager: Optional[LoopManager] = None


def get_loop_manager() -> LoopManager:
    global _manager
    if _manager is None:
        _manager = LoopManager()
    return _manager
