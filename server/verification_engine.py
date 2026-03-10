"""
Verification Engine — Build / Lint / Test Runner
==================================================

Detects project type and runs appropriate verification commands
after code changes to validate correctness.

Supports:
  - Node.js / TypeScript (npm/yarn/pnpm)
  - Python (pytest, mypy, flake8)
  - Rust (cargo)
  - Generic (any command)

Usage:
  engine = VerificationEngine("/path/to/project")
  result = await engine.verify()
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("echo_forge.verification")


# ═══════════════════════════════════════════════════════
# PROJECT TYPE DETECTION
# ═══════════════════════════════════════════════════════

PROJECT_SIGNATURES = {
    "node_ts": {
        "markers": ["package.json", "tsconfig.json"],
        "commands": {
            "typecheck": "npx tsc --noEmit",
            "lint": "npx eslint . --max-warnings 0",
            "build": "npm run build",
            "test": "npm test -- --passWithNoTests",
        },
        "priority": ["typecheck", "lint", "build"],
    },
    "node_js": {
        "markers": ["package.json"],
        "commands": {
            "lint": "npx eslint . --max-warnings 0",
            "build": "npm run build",
            "test": "npm test -- --passWithNoTests",
        },
        "priority": ["lint", "build"],
    },
    "python": {
        "markers": ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"],
        "commands": {
            "typecheck": "mypy .",
            "lint": "flake8 . --max-line-length 120 --count",
            "test": "pytest -x -q",
        },
        "priority": ["lint", "typecheck"],
    },
    "rust": {
        "markers": ["Cargo.toml"],
        "commands": {
            "build": "cargo check",
            "lint": "cargo clippy -- -D warnings",
            "test": "cargo test",
        },
        "priority": ["build", "lint"],
    },
    "vite": {
        "markers": ["vite.config.ts", "vite.config.js"],
        "commands": {
            "typecheck": "npx tsc --noEmit",
            "build": "npx vite build",
            "lint": "npx eslint src --max-warnings 0",
        },
        "priority": ["typecheck", "build"],
    },
}


@dataclass
class VerificationResult:
    """Result of a single verification step."""
    step: str                  # e.g. "typecheck", "lint", "build"
    command: str               # the actual command run
    passed: bool
    exit_code: int
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    errors: list = field(default_factory=list)   # parsed error messages

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "command": self.command,
            "passed": self.passed,
            "exit_code": self.exit_code,
            "stdout": self.stdout[:2000],  # cap output
            "stderr": self.stderr[:2000],
            "duration_ms": self.duration_ms,
            "errors": self.errors[:20],
            "error_count": len(self.errors),
        }


@dataclass
class VerificationReport:
    """Full verification report for a project."""
    project_type: str
    project_path: str
    passed: bool
    results: list[VerificationResult] = field(default_factory=list)
    total_errors: int = 0
    duration_ms: int = 0

    def to_dict(self) -> dict:
        return {
            "project_type": self.project_type,
            "project_path": self.project_path,
            "passed": self.passed,
            "results": [r.to_dict() for r in self.results],
            "total_errors": self.total_errors,
            "duration_ms": self.duration_ms,
            "summary": self.summary(),
        }

    def summary(self) -> str:
        parts = []
        for r in self.results:
            status = "PASS" if r.passed else f"FAIL ({len(r.errors)} errors)"
            parts.append(f"{r.step}: {status}")
        return " | ".join(parts) if parts else "no checks run"

    def error_text(self) -> str:
        """Compile all errors into a single text block for debugging."""
        lines = []
        for r in self.results:
            if not r.passed:
                lines.append(f"=== {r.step} ({r.command}) ===")
                if r.stderr.strip():
                    lines.append(r.stderr.strip())
                elif r.stdout.strip():
                    lines.append(r.stdout.strip())
                for e in r.errors:
                    lines.append(f"  - {e}")
        return "\n".join(lines)


class VerificationEngine:
    """Detect project type and run verification commands."""

    def __init__(self, project_path: str = ""):
        self.root = Path(project_path) if project_path else Path.cwd()

    def detect_project_type(self) -> str:
        """Detect project type from file markers."""
        # Vite takes priority over generic node
        for ptype in ["vite", "node_ts", "node_js", "python", "rust"]:
            sig = PROJECT_SIGNATURES[ptype]
            for marker in sig["markers"]:
                if (self.root / marker).exists():
                    logger.info(f"Detected project type: {ptype} (marker: {marker})")
                    return ptype
        return "unknown"

    def get_available_commands(self, project_type: str = "") -> dict:
        """Get commands available for the project type."""
        ptype = project_type or self.detect_project_type()
        sig = PROJECT_SIGNATURES.get(ptype, {})
        return sig.get("commands", {})

    async def run_command(self, command: str, timeout: int = 60) -> VerificationResult:
        """Run a single verification command."""
        import time
        start = time.monotonic()

        try:
            if sys.platform == "win32":
                proc = await asyncio.create_subprocess_exec(
                    "powershell.exe", "-NoLogo", "-NoProfile",
                    "-Command", command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(self.root),
                )
            else:
                proc = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(self.root),
                )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout)
            elapsed = int((time.monotonic() - start) * 1000)

            stdout_str = stdout.decode("utf-8", errors="replace")
            stderr_str = stderr.decode("utf-8", errors="replace")
            exit_code = proc.returncode or 0
            passed = exit_code == 0

            errors = self._parse_errors(stdout_str, stderr_str)

            return VerificationResult(
                step="custom",
                command=command,
                passed=passed,
                exit_code=exit_code,
                stdout=stdout_str,
                stderr=stderr_str,
                duration_ms=elapsed,
                errors=errors,
            )
        except asyncio.TimeoutError:
            elapsed = int((time.monotonic() - start) * 1000)
            return VerificationResult(
                step="custom",
                command=command,
                passed=False,
                exit_code=-1,
                stderr=f"Command timed out after {timeout}s",
                duration_ms=elapsed,
                errors=[f"Timeout after {timeout}s"],
            )
        except Exception as e:
            return VerificationResult(
                step="custom",
                command=command,
                passed=False,
                exit_code=-1,
                stderr=str(e),
                errors=[str(e)],
            )

    async def verify(
        self,
        steps: list[str] | None = None,
        stop_on_first_failure: bool = True,
    ) -> VerificationReport:
        """
        Run full verification suite for the project.

        Args:
            steps: specific steps to run (e.g. ["typecheck", "lint"])
                   defaults to project's priority list
            stop_on_first_failure: stop after first failed step
        """
        import time
        start = time.monotonic()

        ptype = self.detect_project_type()
        sig = PROJECT_SIGNATURES.get(ptype, {})
        commands = sig.get("commands", {})
        priority = sig.get("priority", list(commands.keys()))

        # Filter to requested steps
        run_steps = steps or priority
        run_steps = [s for s in run_steps if s in commands]

        report = VerificationReport(
            project_type=ptype,
            project_path=str(self.root),
            passed=True,
        )

        if not run_steps:
            logger.warning(f"No verification steps for project type: {ptype}")
            report.duration_ms = int((time.monotonic() - start) * 1000)
            return report

        for step_name in run_steps:
            cmd = commands[step_name]
            logger.info(f"Running verification step: {step_name} -> {cmd}")

            result = await self.run_command(cmd)
            result.step = step_name
            report.results.append(result)

            if not result.passed:
                report.passed = False
                report.total_errors += len(result.errors)
                if stop_on_first_failure:
                    break
            else:
                logger.info(f"  {step_name}: PASS ({result.duration_ms}ms)")

        report.duration_ms = int((time.monotonic() - start) * 1000)
        return report

    def _parse_errors(self, stdout: str, stderr: str) -> list[str]:
        """Extract error messages from command output."""
        errors = []
        combined = (stderr + "\n" + stdout).strip()

        for line in combined.split("\n"):
            line = line.strip()
            if not line:
                continue
            # Common error patterns
            if any(pat in line.lower() for pat in [
                "error", "err!", "failed", "cannot find",
                "is not defined", "unexpected token",
                "syntaxerror", "typeerror", "importerror",
                "modulenotfounderror", "attributeerror",
            ]):
                errors.append(line[:200])
            # TypeScript-style: src/file.ts(10,5): error TS2345
            elif "TS" in line and "error" in line.lower():
                errors.append(line[:200])

        return errors[:50]  # Cap at 50 errors


# ── Singleton ────────────────────────────────────────

_engine: Optional[VerificationEngine] = None


def get_verification_engine(project_path: str = "") -> VerificationEngine:
    global _engine
    if _engine is None or (project_path and str(_engine.root) != project_path):
        _engine = VerificationEngine(project_path)
    return _engine
