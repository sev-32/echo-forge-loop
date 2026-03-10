"""
Git Operations — Code State Snapshots & Provenance
====================================================

Provides git integration for the IDE, enabling:
  - Code state snapshots tied to run history
  - Diff generation for code review
  - Branch management for AI-directed evolution
  - Commit history with provenance tracking

Every code generation run creates a traceable git state.

Usage:
  from git_ops import GitManager
  gm = GitManager("/path/to/project")
  snapshot = gm.snapshot("codegen: add greeting component", metadata={...})
"""

import os, json, subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional


class GitManager:
    """Manages git operations for code state snapshots and provenance."""

    def __init__(self, project_path: str = ""):
        self.root = Path(project_path) if project_path else Path.cwd()

    def _run(self, *args: str, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
        """Execute a git command in the project directory."""
        cmd = ["git"] + list(args)
        return subprocess.run(
            cmd,
            cwd=str(self.root),
            capture_output=capture,
            text=True,
            check=check,
            timeout=30,
        )

    # ── Status & Info ────────────────────────────────

    def is_repo(self) -> bool:
        """Check if the project path is a git repository."""
        try:
            self._run("rev-parse", "--is-inside-work-tree")
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False

    def init(self) -> dict:
        """Initialize a git repo if not already one."""
        if self.is_repo():
            return {"status": "already_initialized", "path": str(self.root)}
        self._run("init")
        return {"status": "initialized", "path": str(self.root)}

    def status(self) -> dict:
        """Get current git status."""
        try:
            result = self._run("status", "--porcelain", "-b")
            lines = result.stdout.strip().split("\n") if result.stdout.strip() else []

            branch_line = lines[0] if lines else ""
            branch = branch_line.replace("## ", "").split("...")[0] if branch_line.startswith("##") else "unknown"

            changes = []
            for line in lines[1:]:
                if len(line) >= 3:
                    status_code = line[:2].strip()
                    filepath = line[3:]
                    changes.append({"status": status_code, "path": filepath})

            head = self.current_commit()
            return {
                "branch": branch,
                "head": head,
                "changes": changes,
                "clean": len(changes) == 0,
            }
        except Exception as e:
            return {"error": str(e)}

    def current_commit(self) -> str:
        """Get the current HEAD commit hash."""
        try:
            result = self._run("rev-parse", "--short", "HEAD")
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return "no-commits"

    def current_branch(self) -> str:
        """Get the current branch name."""
        try:
            result = self._run("branch", "--show-current")
            return result.stdout.strip() or "HEAD"
        except subprocess.CalledProcessError:
            return "unknown"

    # ── Snapshots (Core Feature) ─────────────────────

    def snapshot(
        self,
        message: str,
        metadata: Optional[dict] = None,
        tag: Optional[str] = None,
    ) -> dict:
        """
        Create a code state snapshot — stages all changes and commits.
        
        This is the primary provenance mechanism:
        - Every code generation run creates a snapshot
        - Run history can reference the commit hash
        - Diffs can be reconstructed from any snapshot
        
        Args:
            message: Commit message (prefixed with [aim-os] for tracking)
            metadata: Dict to store as commit trailer (run_id, tokens, etc.)
            tag: Optional git tag for important milestones
        
        Returns:
            {commit: str, branch: str, timestamp: str, files_changed: int}
        """
        if not self.is_repo():
            self.init()

        # Stage all changes
        self._run("add", "-A")

        # Check if there's anything to commit
        status = self.status()
        if status.get("clean", True):
            return {
                "commit": self.current_commit(),
                "branch": self.current_branch(),
                "status": "no_changes",
                "timestamp": datetime.now().isoformat(),
            }

        # Build commit message with AIM-OS prefix and metadata trailer
        full_msg = f"[aim-os] {message}"
        if metadata:
            trailer = json.dumps(metadata, separators=(",", ":"))
            full_msg += f"\n\nAIM-OS-Metadata: {trailer}"

        self._run("commit", "-m", full_msg, "--allow-empty", check=False)

        commit_hash = self.current_commit()

        # Optional tag
        if tag:
            self._run("tag", "-a", tag, "-m", f"AIM-OS snapshot: {message}", check=False)

        return {
            "commit": commit_hash,
            "branch": self.current_branch(),
            "timestamp": datetime.now().isoformat(),
            "files_changed": len(status.get("changes", [])),
            "message": message,
        }

    # ── Diff & History ───────────────────────────────

    def diff(self, from_ref: str = "HEAD~1", to_ref: str = "HEAD") -> dict:
        """Get the diff between two refs."""
        try:
            result = self._run("diff", "--stat", from_ref, to_ref, check=False)
            stat = result.stdout.strip()

            result_full = self._run("diff", from_ref, to_ref, check=False)
            full_diff = result_full.stdout

            return {"stat": stat, "diff": full_diff[:10000], "truncated": len(full_diff) > 10000}
        except Exception as e:
            return {"error": str(e)}

    def log(self, limit: int = 20, format_str: str = "oneline") -> list[dict]:
        """Get commit history with AIM-OS metadata parsing."""
        try:
            result = self._run(
                "log", f"--max-count={limit}",
                "--pretty=format:%H|%h|%s|%ai|%an",
                check=False,
            )
            entries = []
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                parts = line.split("|", 4)
                if len(parts) >= 5:
                    entry: dict = {
                        "hash": parts[0],
                        "short_hash": parts[1],
                        "message": parts[2],
                        "date": parts[3],
                        "author": parts[4],
                        "is_aim_os": parts[2].startswith("[aim-os]"),
                    }
                    entries.append(entry)
            return entries
        except Exception as e:
            return [{"error": str(e)}]

    def show_commit(self, ref: str = "HEAD") -> dict:
        """Show details of a specific commit including AIM-OS metadata."""
        try:
            result = self._run("show", "--stat", ref, check=False)
            body = result.stdout

            # Extract AIM-OS metadata if present
            metadata = None
            if "AIM-OS-Metadata:" in body:
                meta_line = body.split("AIM-OS-Metadata:")[1].split("\n")[0].strip()
                try:
                    metadata = json.loads(meta_line)
                except json.JSONDecodeError:
                    pass

            return {
                "ref": ref,
                "body": body[:5000],
                "metadata": metadata,
            }
        except Exception as e:
            return {"error": str(e)}

    # ── Branch Management ────────────────────────────

    def branches(self) -> list[dict]:
        """List all branches."""
        try:
            result = self._run("branch", "-a", "--format=%(refname:short)|%(objectname:short)|%(subject)")
            branches = []
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                parts = line.split("|", 2)
                if len(parts) >= 3:
                    branches.append({
                        "name": parts[0],
                        "commit": parts[1],
                        "message": parts[2],
                    })
            return branches
        except Exception as e:
            return [{"error": str(e)}]

    def create_branch(self, name: str, checkout: bool = True) -> dict:
        """Create a new branch (for AI-directed evolution experiments)."""
        try:
            if checkout:
                self._run("checkout", "-b", name)
            else:
                self._run("branch", name)
            return {"branch": name, "checked_out": checkout}
        except subprocess.CalledProcessError as e:
            return {"error": str(e)}

    def checkout(self, ref: str) -> dict:
        """Checkout a branch or commit."""
        try:
            self._run("checkout", ref)
            return {"ref": ref, "success": True}
        except subprocess.CalledProcessError as e:
            return {"error": str(e)}

    # ── File History ─────────────────────────────────

    def file_history(self, filepath: str, limit: int = 10) -> list[dict]:
        """Get commit history for a specific file."""
        try:
            result = self._run(
                "log", f"--max-count={limit}",
                "--pretty=format:%h|%s|%ai",
                "--follow", "--", filepath,
                check=False,
            )
            entries = []
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                parts = line.split("|", 2)
                if len(parts) >= 3:
                    entries.append({
                        "hash": parts[0],
                        "message": parts[1],
                        "date": parts[2],
                    })
            return entries
        except Exception as e:
            return [{"error": str(e)}]

    def file_at_commit(self, filepath: str, ref: str = "HEAD") -> Optional[str]:
        """Get a file's content at a specific commit."""
        try:
            result = self._run("show", f"{ref}:{filepath}")
            return result.stdout
        except subprocess.CalledProcessError:
            return None


# ── Singleton ────────────────────────────────────────

_git_manager: Optional[GitManager] = None

def get_git_manager(project_path: str = "") -> GitManager:
    global _git_manager
    if _git_manager is None or project_path:
        path = project_path or os.environ.get("EFL_PROJECT_PATH", "")
        _git_manager = GitManager(path)
    return _git_manager
