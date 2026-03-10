"""
Run History — Execution Tracking & Learning System
====================================================

Tracks every code generation and debug run with:
  - Git commit references (code state provenance)
  - Effectiveness scoring (success/fail/partial)
  - User feedback integration
  - Pattern learning from past outcomes

The AI can query past runs to improve future code generation.

Usage:
  from run_history import get_run_store
  store = get_run_store()
  run_id = store.record_run("codegen", prompt, result, commit_hash)
  store.score_run(run_id, "success", feedback="worked perfectly")
  patterns = store.learn_patterns(limit=10)
"""

import os, json, sqlite3, uuid
from pathlib import Path
from datetime import datetime
from typing import Optional
from contextlib import contextmanager


# ── Database Setup ───────────────────────────────────

DB_DIR = Path(__file__).resolve().parent / "memory"
DB_PATH = DB_DIR / "run_history.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,              -- 'codegen' | 'debug' | 'apply'
    timestamp TEXT NOT NULL,
    prompt TEXT,
    result_summary TEXT,
    
    -- Git provenance
    commit_hash TEXT,
    branch TEXT,
    files_changed TEXT,             -- JSON array of paths
    
    -- Effectiveness
    outcome TEXT DEFAULT 'pending', -- 'success' | 'partial' | 'failure' | 'pending'
    score REAL DEFAULT 0.0,         -- 0.0 to 1.0
    user_feedback TEXT,
    auto_feedback TEXT,             -- AI-generated feedback
    
    -- Metrics
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    files_count INTEGER DEFAULT 0,
    error_text TEXT,
    
    -- Context
    project_type TEXT,
    model_used TEXT,
    context_tokens INTEGER DEFAULT 0,
    
    -- Learning
    patterns TEXT,                  -- JSON: extracted patterns for learning
    tags TEXT                       -- JSON: categorization tags
);

CREATE INDEX IF NOT EXISTS idx_runs_type ON runs(type);
CREATE INDEX IF NOT EXISTS idx_runs_outcome ON runs(outcome);
CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp);
CREATE INDEX IF NOT EXISTS idx_runs_commit ON runs(commit_hash);

CREATE TABLE IF NOT EXISTS run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,       -- 'start' | 'context' | 'generate' | 'apply' | 'error' | 'feedback'
    data TEXT,                      -- JSON payload
    FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS learned_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,     -- 'success_pattern' | 'failure_pattern' | 'optimization'
    description TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0.5,
    source_runs TEXT,               -- JSON array of run IDs
    created_at TEXT,
    updated_at TEXT,
    tags TEXT                       -- JSON
);
"""


class RunStore:
    """SQLite-backed run history with learning capabilities."""

    def __init__(self, db_path: str = ""):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # ── Record Runs ──────────────────────────────────

    def record_run(
        self,
        run_type: str,
        prompt: str,
        result_summary: str = "",
        commit_hash: str = "",
        branch: str = "",
        files_changed: list[str] | None = None,
        tokens_used: int = 0,
        duration_ms: int = 0,
        project_type: str = "",
        model_used: str = "",
        context_tokens: int = 0,
        tags: list[str] | None = None,
    ) -> str:
        """Record a new run. Returns the run ID."""
        run_id = str(uuid.uuid4())[:12]
        now = datetime.now().isoformat()

        with self._conn() as conn:
            conn.execute("""
                INSERT INTO runs (id, type, timestamp, prompt, result_summary,
                    commit_hash, branch, files_changed, tokens_used, duration_ms,
                    files_count, project_type, model_used, context_tokens, tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                run_id, run_type, now, prompt[:1000], result_summary[:2000],
                commit_hash, branch,
                json.dumps(files_changed or []),
                tokens_used, duration_ms,
                len(files_changed or []),
                project_type, model_used, context_tokens,
                json.dumps(tags or []),
            ))

            # Record start event
            conn.execute("""
                INSERT INTO run_events (id, run_id, timestamp, event_type, data)
                VALUES (?, ?, ?, 'start', ?)
            """, (str(uuid.uuid4())[:12], run_id, now, json.dumps({"prompt": prompt[:500]})))

        return run_id

    def add_event(self, run_id: str, event_type: str, data: dict | None = None):
        """Add an event to a run's timeline."""
        with self._conn() as conn:
            conn.execute("""
                INSERT INTO run_events (id, run_id, timestamp, event_type, data)
                VALUES (?, ?, ?, ?, ?)
            """, (str(uuid.uuid4())[:12], run_id, datetime.now().isoformat(),
                  event_type, json.dumps(data or {})))

    # ── Score & Feedback ─────────────────────────────

    def score_run(
        self,
        run_id: str,
        outcome: str,
        score: float = 0.0,
        user_feedback: str = "",
        auto_feedback: str = "",
        error_text: str = "",
    ):
        """Score a run's effectiveness."""
        # Auto-calculate score if not provided
        if score == 0.0:
            score = {"success": 1.0, "partial": 0.5, "failure": 0.0, "pending": 0.0}.get(outcome, 0.0)

        with self._conn() as conn:
            conn.execute("""
                UPDATE runs SET outcome=?, score=?, user_feedback=?,
                    auto_feedback=?, error_text=?
                WHERE id=?
            """, (outcome, score, user_feedback, auto_feedback, error_text, run_id))

            # Record feedback event
            self.add_event(run_id, "feedback", {
                "outcome": outcome, "score": score,
                "user_feedback": user_feedback,
            })

    # ── Query History ────────────────────────────────

    def get_runs(
        self,
        limit: int = 50,
        run_type: str = "",
        outcome: str = "",
        since: str = "",
    ) -> list[dict]:
        """Get run history with optional filtering."""
        query = "SELECT * FROM runs WHERE 1=1"
        params: list = []

        if run_type:
            query += " AND type=?"
            params.append(run_type)
        if outcome:
            query += " AND outcome=?"
            params.append(outcome)
        if since:
            query += " AND timestamp>=?"
            params.append(since)

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        with self._conn() as conn:
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]

    def get_run(self, run_id: str) -> dict | None:
        """Get a single run with its events."""
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                return None
            run = dict(row)

            events = conn.execute(
                "SELECT * FROM run_events WHERE run_id=? ORDER BY timestamp",
                (run_id,)
            ).fetchall()
            run["events"] = [dict(e) for e in events]
            return run

    def get_stats(self) -> dict:
        """Get aggregate statistics."""
        with self._conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
            by_type = dict(conn.execute(
                "SELECT type, COUNT(*) FROM runs GROUP BY type"
            ).fetchall())
            by_outcome = dict(conn.execute(
                "SELECT outcome, COUNT(*) FROM runs GROUP BY outcome"
            ).fetchall())
            avg_score = conn.execute(
                "SELECT AVG(score) FROM runs WHERE outcome != 'pending'"
            ).fetchone()[0] or 0.0
            total_tokens = conn.execute(
                "SELECT SUM(tokens_used) FROM runs"
            ).fetchone()[0] or 0

            # Recent trend (last 20 runs)
            recent = conn.execute(
                "SELECT score FROM runs WHERE outcome != 'pending' ORDER BY timestamp DESC LIMIT 20"
            ).fetchall()
            trend = [r[0] for r in recent]

            return {
                "total_runs": total,
                "by_type": by_type,
                "by_outcome": by_outcome,
                "avg_score": round(avg_score, 2),
                "total_tokens": total_tokens,
                "recent_trend": trend,
                "success_rate": round(
                    by_outcome.get("success", 0) / max(total, 1) * 100, 1
                ),
            }

    # ── Learning System ──────────────────────────────

    def learn_patterns(self, limit: int = 10) -> list[dict]:
        """Extract patterns from successful and failed runs."""
        with self._conn() as conn:
            # Get recent successful runs
            successes = conn.execute("""
                SELECT prompt, result_summary, project_type, tags
                FROM runs WHERE outcome='success'
                ORDER BY timestamp DESC LIMIT ?
            """, (limit * 2,)).fetchall()

            # Get recent failures
            failures = conn.execute("""
                SELECT prompt, error_text, project_type, tags
                FROM runs WHERE outcome='failure'
                ORDER BY timestamp DESC LIMIT ?
            """, (limit,)).fetchall()

            patterns = []

            # Success patterns
            for row in successes:
                patterns.append({
                    "type": "success_pattern",
                    "prompt_excerpt": (row[0] or "")[:200],
                    "result": (row[1] or "")[:200],
                    "project_type": row[2] or "",
                })

            # Failure patterns
            for row in failures:
                patterns.append({
                    "type": "failure_pattern",
                    "prompt_excerpt": (row[0] or "")[:200],
                    "error": (row[1] or "")[:200],
                    "project_type": row[2] or "",
                })

            return patterns[:limit]

    def get_similar_runs(self, prompt: str, limit: int = 5) -> list[dict]:
        """Find runs with similar prompts (basic keyword matching)."""
        keywords = [w.lower() for w in prompt.split() if len(w) > 3][:10]
        if not keywords:
            return []

        with self._conn() as conn:
            # Use LIKE for each keyword and score by match count
            conditions = " OR ".join(["LOWER(prompt) LIKE ?"] * len(keywords))
            params = [f"%{kw}%" for kw in keywords]

            rows = conn.execute(f"""
                SELECT *, ({' + '.join([f"CASE WHEN LOWER(prompt) LIKE ? THEN 1 ELSE 0 END" for _ in keywords])}) as relevance
                FROM runs
                WHERE {conditions}
                ORDER BY relevance DESC, timestamp DESC
                LIMIT ?
            """, params + params + [limit]).fetchall()

            return [dict(r) for r in rows]

    def build_learning_context(self, prompt: str, project_type: str = "") -> str:
        """Build a learning context prompt section from past runs."""
        parts = []

        # Similar successful runs
        similar = self.get_similar_runs(prompt, limit=3)
        successes = [r for r in similar if r.get("outcome") == "success"]
        failures = [r for r in similar if r.get("outcome") == "failure"]

        if successes:
            parts.append("## Previous Successful Approaches")
            for r in successes:
                parts.append(f"- **Prompt**: {r['prompt'][:150]}")
                parts.append(f"  **Result**: {r.get('result_summary', '')[:150]}")
                parts.append(f"  **Score**: {r.get('score', 0)}")

        if failures:
            parts.append("\n## Previous Failures to Avoid")
            for r in failures:
                parts.append(f"- **Prompt**: {r['prompt'][:150]}")
                parts.append(f"  **Error**: {r.get('error_text', '')[:150]}")

        # General stats
        stats = self.get_stats()
        if stats["total_runs"] > 0:
            parts.append(f"\n## Run Statistics")
            parts.append(f"- Total runs: {stats['total_runs']}")
            parts.append(f"- Success rate: {stats['success_rate']}%")
            parts.append(f"- Average score: {stats['avg_score']}")

        return "\n".join(parts) if parts else ""


# ── Singleton ────────────────────────────────────────

_store: Optional[RunStore] = None

def get_run_store() -> RunStore:
    global _store
    if _store is None:
        _store = RunStore()
    return _store
