"""
Echo Forge Loop — Self-Evolution Engine
=========================================

The brain's learning system. This module turns Echo Forge from a static
pipeline into a self-improving one:

1. RULE ENGINE — Applies rules to prompts, tracks usage, scores effectiveness
2. RUN ANALYTICS — Analyzes run trace history for trends and anomalies
3. STRATEGY ADAPTATION — Learns which planning styles work best per complexity
4. KNOWLEDGE GRAPH — Manages, deduplicates, scores, and prunes knowledge nodes
5. RULE LIFECYCLE — Creates, promotes, demotes, and retires rules over time

The Evolution Engine is called at multiple pipeline stages:
  - Before PLAN:    inject_rules()     → add learned rules to planning prompt
  - Before EXECUTE: inject_strategy()  → apply best strategy for this complexity
  - After  VERIFY:  record_feedback()  → track which rules helped/hurt
  - After  EVOLVE:  analyze_and_adapt() → prune bad rules, promote good ones
"""
from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger('echo_forge.evolution')

# ── Storage Paths ────────────────────────────────────────
_server_dir = Path(__file__).resolve().parent
MEMORY_DIR = _server_dir / "memory"
RULES_FILE = MEMORY_DIR / "rules.json"
KNOWLEDGE_FILE = MEMORY_DIR / "knowledge.json"
REFLECTIONS_FILE = MEMORY_DIR / "reflections.jsonl"
RUN_TRACES_DIR = MEMORY_DIR / "traces"
STRATEGIES_FILE = MEMORY_DIR / "strategies.json"
EVOLUTION_LOG = MEMORY_DIR / "evolution_log.jsonl"

# ── Configuration ────────────────────────────────────────
RULE_MAX_AGE_RUNS = int(os.environ.get("EFL_RULE_MAX_AGE", "50"))      # Retire after N runs without help
RULE_MIN_HELP_RATE = float(os.environ.get("EFL_RULE_MIN_HELP", "0.3"))  # Min success rate to keep
KNOWLEDGE_MAX_NODES = int(os.environ.get("EFL_MAX_KNOWLEDGE", "500"))   # Cap knowledge graph
RULE_PROMO_THRESHOLD = 5   # Promote to "core" after N successful applications
RULE_RETIRE_THRESHOLD = 10 # Retire after N applications with low help rate


# ═══════════════════════════════════════════════════════════
# RULE ENGINE
# ═══════════════════════════════════════════════════════════

class RuleEngine:
    """
    Active rule management:
    - Loads rules and scores them by historical effectiveness
    - Injects the most relevant rules into prompts
    - Tracks which rules were applied per run
    - Updates effectiveness scores after verification
    """

    def __init__(self):
        self._rules: list[dict] = []
        self._applied_this_run: list[str] = []  # Rule IDs applied in current run
        self._run_score: float = 0.0
        self.load()

    def load(self):
        """Load rules from persistent storage."""
        if RULES_FILE.exists():
            try:
                self._rules = json.loads(RULES_FILE.read_text(encoding='utf-8'))
            except (json.JSONDecodeError, ValueError):
                self._rules = []
        # Ensure all rules have required fields
        for rule in self._rules:
            rule.setdefault('times_applied', 0)
            rule.setdefault('times_helped', 0)
            rule.setdefault('confidence', 0.5)
            rule.setdefault('created_run', 0)
            rule.setdefault('last_applied_run', 0)
            rule.setdefault('status', 'active')  # active, promoted, retired

    def save(self):
        """Persist rules to storage."""
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        RULES_FILE.write_text(
            json.dumps(self._rules, indent=2, default=str),
            encoding='utf-8'
        )

    @property
    def active_rules(self) -> list[dict]:
        """Get only active and promoted rules."""
        return [r for r in self._rules if r.get('status') in ('active', 'promoted')]

    @property
    def all_rules(self) -> list[dict]:
        return list(self._rules)

    def effectiveness_score(self, rule: dict) -> float:
        """Calculate a rule's effectiveness score (0.0 - 1.0)."""
        applied = rule.get('times_applied', 0)
        if applied == 0:
            return rule.get('confidence', 0.5)
        helped = rule.get('times_helped', 0)
        success_rate = helped / applied
        # Bayesian shrinkage toward 0.5 for low-count rules
        weight = min(1.0, applied / 10.0)
        return (1 - weight) * 0.5 + weight * success_rate

    def inject_rules(self, category: Optional[str] = None, max_rules: int = 5) -> str:
        """
        Generate a prompt section with the most effective rules.
        Called before PLAN/EXECUTE to inject learned wisdom.
        """
        rules = self.active_rules

        # Filter by category if specified
        if category:
            rules = [r for r in rules if r.get('category') == category]

        # Sort by effectiveness
        rules.sort(key=lambda r: self.effectiveness_score(r), reverse=True)
        rules = rules[:max_rules]

        if not rules:
            return ""

        lines = ["## Learned Process Rules (from past runs)"]
        for r in rules:
            score = self.effectiveness_score(r)
            status = "★" if r.get('status') == 'promoted' else "•"
            lines.append(f"{status} [{r.get('category', 'general')}] {r.get('rule_text', '')} (effectiveness: {score:.0%})")
            self._applied_this_run.append(r.get('id', ''))

        return "\n".join(lines)

    def record_application(self, run_number: int = 0):
        """Mark all applied rules as used in this run."""
        for rule in self._rules:
            if rule.get('id') in self._applied_this_run:
                rule['times_applied'] = rule.get('times_applied', 0) + 1
                rule['last_applied_run'] = run_number

    def record_feedback(self, avg_score: float, tasks_passed: int, total_tasks: int):
        """
        Record whether applied rules helped this run.
        Called after VERIFY phase with the run's verification scores.
        """
        self._run_score = avg_score
        helped = avg_score >= 70 and tasks_passed == total_tasks

        for rule in self._rules:
            if rule.get('id') in self._applied_this_run:
                if helped:
                    rule['times_helped'] = rule.get('times_helped', 0) + 1

        # Promote rules that consistently help
        for rule in self._rules:
            if (rule.get('times_helped', 0) >= RULE_PROMO_THRESHOLD
                    and rule.get('status') == 'active'):
                rule['status'] = 'promoted'
                rule['confidence'] = min(0.95, rule.get('confidence', 0.5) + 0.1)
                logger.info(f"Rule promoted: {rule.get('id')} — {rule.get('rule_text', '')[:50]}")

        self.save()

    def retire_ineffective(self, current_run: int = 0):
        """Retire rules that consistently fail to help."""
        retired = []
        for rule in self._rules:
            applied = rule.get('times_applied', 0)
            if applied < RULE_RETIRE_THRESHOLD:
                continue
            effectiveness = self.effectiveness_score(rule)
            if effectiveness < RULE_MIN_HELP_RATE:
                rule['status'] = 'retired'
                retired.append(rule.get('id'))
                logger.info(f"Rule retired: {rule.get('id')} (effectiveness: {effectiveness:.0%})")

        # Also retire rules not used in many runs
        if current_run > 0:
            for rule in self._rules:
                last = rule.get('last_applied_run', 0)
                if (current_run - last) > RULE_MAX_AGE_RUNS and rule.get('status') == 'active':
                    rule['status'] = 'retired'
                    retired.append(rule.get('id'))

        if retired:
            self.save()
        return retired

    def add_rules(self, new_rules: list[dict], current_run: int = 0):
        """Add new rules from the Evolve phase with de-duplication."""
        existing_texts = {r.get('rule_text', '').lower().strip() for r in self._rules}
        added = 0
        for rule in new_rules:
            text = rule.get('rule_text', '').lower().strip()
            if text and text not in existing_texts:
                rule.setdefault('status', 'active')
                rule.setdefault('times_applied', 0)
                rule.setdefault('times_helped', 0)
                rule.setdefault('created_run', current_run)
                self._rules.append(rule)
                existing_texts.add(text)
                added += 1
        if added:
            self.save()
        return added

    def reset_run(self):
        """Reset per-run tracking for a new pipeline run."""
        self._applied_this_run = []
        self._run_score = 0.0

    def stats(self) -> dict:
        """Return rule engine statistics."""
        active = [r for r in self._rules if r.get('status') == 'active']
        promoted = [r for r in self._rules if r.get('status') == 'promoted']
        retired = [r for r in self._rules if r.get('status') == 'retired']
        return {
            "total_rules": len(self._rules),
            "active": len(active),
            "promoted": len(promoted),
            "retired": len(retired),
            "avg_effectiveness": (
                sum(self.effectiveness_score(r) for r in self.active_rules) / max(1, len(self.active_rules))
            ),
            "most_effective": sorted(
                self.active_rules,
                key=lambda r: self.effectiveness_score(r),
                reverse=True
            )[:3],
        }


# ═══════════════════════════════════════════════════════════
# RUN ANALYTICS
# ═══════════════════════════════════════════════════════════

class RunAnalytics:
    """
    Analyzes run trace history to detect trends and anomalies.
    Provides data-driven insights for strategy adaptation.
    """

    def __init__(self):
        self._traces: list[dict] = []
        self.load()

    def load(self):
        """Load all run traces."""
        self._traces = []
        if RUN_TRACES_DIR.exists():
            for f in sorted(RUN_TRACES_DIR.glob("*.json")):
                try:
                    trace = json.loads(f.read_text(encoding='utf-8'))
                    self._traces.append(trace)
                except (json.JSONDecodeError, ValueError):
                    pass

    @property
    def total_runs(self) -> int:
        return len(self._traces)

    def recent(self, n: int = 10) -> list[dict]:
        """Get N most recent traces."""
        return self._traces[-n:]

    def score_trend(self, window: int = 10) -> dict:
        """Detect score trends over recent runs."""
        recent = self.recent(window)
        if len(recent) < 3:
            return {"trend": "insufficient_data", "direction": "flat", "avg": 0}

        scores = [t.get('avg_score', 0) for t in recent]
        avg = sum(scores) / len(scores)

        # Linear trend
        first_half = scores[:len(scores)//2]
        second_half = scores[len(scores)//2:]
        avg_first = sum(first_half) / max(1, len(first_half))
        avg_second = sum(second_half) / max(1, len(second_half))

        diff = avg_second - avg_first
        if diff > 5:
            direction = "improving"
        elif diff < -5:
            direction = "declining"
        else:
            direction = "stable"

        return {
            "trend": "analyzed",
            "direction": direction,
            "avg_score": round(avg, 1),
            "recent_avg": round(avg_second, 1),
            "improvement": round(diff, 1),
            "total_runs": len(self._traces),
            "window": window,
        }

    def complexity_performance(self) -> dict:
        """Analyze performance by goal complexity."""
        by_complexity = defaultdict(list)
        for trace in self._traces:
            c = trace.get('complexity', 'moderate')
            by_complexity[c].append(trace.get('avg_score', 0))

        result = {}
        for complexity, scores in by_complexity.items():
            result[complexity] = {
                "avg_score": round(sum(scores) / len(scores), 1),
                "runs": len(scores),
                "best": max(scores) if scores else 0,
                "worst": min(scores) if scores else 0,
            }
        return result

    def token_efficiency(self, window: int = 10) -> dict:
        """Track token usage efficiency over time."""
        recent = self.recent(window)
        if not recent:
            return {"status": "no_data"}

        tokens_per_task = []
        for t in recent:
            tasks = t.get('task_count', 1)
            tokens = t.get('total_tokens', 0)
            if tasks > 0:
                tokens_per_task.append(tokens / tasks)

        return {
            "avg_tokens_per_task": round(sum(tokens_per_task) / max(1, len(tokens_per_task))),
            "avg_elapsed_seconds": round(
                sum(t.get('elapsed_seconds', 0) for t in recent) / len(recent), 1
            ),
            "total_tokens_all_time": sum(t.get('total_tokens', 0) for t in self._traces),
        }

    def full_report(self) -> dict:
        """Generate a complete analytics report."""
        return {
            "total_runs": self.total_runs,
            "score_trend": self.score_trend(),
            "complexity_performance": self.complexity_performance(),
            "token_efficiency": self.token_efficiency(),
        }


# ═══════════════════════════════════════════════════════════
# STRATEGY ADAPTATION
# ═══════════════════════════════════════════════════════════

class StrategyAdapter:
    """
    Learns which planning strategies work best for different
    complexity levels and goal types. Adapts the pipeline's
    approach based on historical performance.
    """

    def __init__(self):
        self._strategies: dict = {}
        self.load()

    def load(self):
        """Load learned strategies from storage."""
        if STRATEGIES_FILE.exists():
            try:
                self._strategies = json.loads(STRATEGIES_FILE.read_text(encoding='utf-8'))
            except (json.JSONDecodeError, ValueError):
                self._strategies = {}

    def save(self):
        """Persist strategies."""
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        STRATEGIES_FILE.write_text(
            json.dumps(self._strategies, indent=2, default=str),
            encoding='utf-8'
        )

    def record_outcome(self, complexity: str, task_count: int, avg_score: float,
                       elapsed: float, detail_level: str = "standard"):
        """Record the outcome of a strategy choice."""
        key = complexity.lower()
        if key not in self._strategies:
            self._strategies[key] = {
                "outcomes": [],
                "best_task_count": None,
                "best_detail_level": "standard",
                "avg_score": 0,
            }

        self._strategies[key]["outcomes"].append({
            "task_count": task_count,
            "avg_score": avg_score,
            "elapsed": round(elapsed, 1),
            "detail_level": detail_level,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })

        # Keep last 20 outcomes per complexity
        self._strategies[key]["outcomes"] = self._strategies[key]["outcomes"][-20:]

        # Recalculate best strategy
        outcomes = self._strategies[key]["outcomes"]
        if outcomes:
            # Find the task count that produces highest avg scores
            by_count = defaultdict(list)
            for o in outcomes:
                by_count[o["task_count"]].append(o["avg_score"])

            best_count = max(by_count.keys(), key=lambda k: sum(by_count[k]) / len(by_count[k]))
            self._strategies[key]["best_task_count"] = best_count
            self._strategies[key]["avg_score"] = round(
                sum(o["avg_score"] for o in outcomes) / len(outcomes), 1
            )

        self.save()

    def suggest(self, complexity: str) -> dict:
        """Suggest a strategy for the given complexity level."""
        key = complexity.lower()
        strat = self._strategies.get(key, {})

        defaults = {
            "simple": {"suggested_tasks": 1, "detail_level": "brief"},
            "moderate": {"suggested_tasks": 2, "detail_level": "standard"},
            "complex": {"suggested_tasks": 3, "detail_level": "detailed"},
            "expert": {"suggested_tasks": 4, "detail_level": "comprehensive"},
        }

        base = defaults.get(key, defaults["moderate"])

        if strat and strat.get("best_task_count"):
            base["suggested_tasks"] = strat["best_task_count"]
            base["based_on"] = f"{len(strat.get('outcomes', []))} past runs"
            base["historical_avg"] = strat.get("avg_score", 0)

        return base


# ═══════════════════════════════════════════════════════════
# KNOWLEDGE GRAPH MANAGER
# ═══════════════════════════════════════════════════════════

class KnowledgeGraphManager:
    """
    Manages the knowledge graph with:
    - Deduplication (fuzzy matching on node labels)
    - Scoring (frequently referenced nodes get higher scores)
    - Pruning (remove low-value nodes when graph exceeds max size)
    """

    def __init__(self):
        self._nodes: list[dict] = []
        self.load()

    def load(self):
        """Load knowledge nodes."""
        if KNOWLEDGE_FILE.exists():
            try:
                self._nodes = json.loads(KNOWLEDGE_FILE.read_text(encoding='utf-8'))
            except (json.JSONDecodeError, ValueError):
                self._nodes = []
        # Ensure all nodes have required fields
        for node in self._nodes:
            node.setdefault('score', 1.0)
            node.setdefault('references', 1)
            node.setdefault('created_at', time.strftime("%Y-%m-%dT%H:%M:%S"))

    def save(self):
        """Persist knowledge graph."""
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        KNOWLEDGE_FILE.write_text(
            json.dumps(self._nodes, indent=2, default=str),
            encoding='utf-8'
        )

    def add_nodes(self, new_nodes: list[dict]) -> int:
        """Add nodes with deduplication. Returns count added."""
        existing_labels = {n.get('label', '').lower().strip() for n in self._nodes}
        added = 0
        for node in new_nodes:
            label = node.get('label', '').lower().strip()
            if not label:
                continue
            if label in existing_labels:
                # Increment reference count for existing node
                for existing in self._nodes:
                    if existing.get('label', '').lower().strip() == label:
                        existing['references'] = existing.get('references', 1) + 1
                        existing['score'] = existing.get('score', 1.0) + 0.5
                        break
            else:
                node['score'] = 1.0
                node['references'] = 1
                node['created_at'] = time.strftime("%Y-%m-%dT%H:%M:%S")
                self._nodes.append(node)
                existing_labels.add(label)
                added += 1

        # Prune if over max
        if len(self._nodes) > KNOWLEDGE_MAX_NODES:
            self._prune()

        self.save()
        return added

    def _prune(self):
        """Remove lowest-scored nodes to stay under the limit."""
        self._nodes.sort(key=lambda n: n.get('score', 0), reverse=True)
        removed = len(self._nodes) - KNOWLEDGE_MAX_NODES
        self._nodes = self._nodes[:KNOWLEDGE_MAX_NODES]
        logger.info(f"Pruned {removed} low-score knowledge nodes")

    def search(self, query: str, limit: int = 10) -> list[dict]:
        """Simple keyword search over knowledge nodes."""
        query_lower = query.lower()
        scored = []
        for node in self._nodes:
            label = node.get('label', '').lower()
            if query_lower in label:
                scored.append((node, node.get('score', 0) + 10))
            elif any(query_lower in str(v).lower() for v in node.values()):
                scored.append((node, node.get('score', 0)))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [n for n, _ in scored[:limit]]

    def stats(self) -> dict:
        """Return knowledge graph statistics."""
        return {
            "total_nodes": len(self._nodes),
            "max_nodes": KNOWLEDGE_MAX_NODES,
            "avg_score": round(
                sum(n.get('score', 0) for n in self._nodes) / max(1, len(self._nodes)), 2
            ),
            "top_nodes": sorted(self._nodes, key=lambda n: n.get('score', 0), reverse=True)[:5],
        }


# ═══════════════════════════════════════════════════════════
# EVOLUTION LOG
# ═══════════════════════════════════════════════════════════

def log_evolution_event(event_type: str, data: dict):
    """Append an evolution event to the log for full provenance."""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "event": event_type,
        **data,
    }
    with open(EVOLUTION_LOG, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, default=str) + '\n')


# ═══════════════════════════════════════════════════════════
# EVOLUTION ENGINE (Facade)
# ═══════════════════════════════════════════════════════════

class EvolutionEngine:
    """
    Unified facade for the self-evolution system.
    Use this from the pipeline instead of individual components.
    """

    def __init__(self):
        self.rules = RuleEngine()
        self.analytics = RunAnalytics()
        self.strategy = StrategyAdapter()
        self.knowledge = KnowledgeGraphManager()
        self._run_number = self.analytics.total_runs + 1

    def begin_run(self):
        """Call at the start of each pipeline run."""
        self.rules.reset_run()
        self.rules.load()
        self.analytics.load()
        self._run_number = self.analytics.total_runs + 1

    def get_planning_context(self, complexity: str = "moderate") -> dict:
        """
        Get all evolution-informed context for the PLAN phase.
        Returns rules to inject into prompts and strategy suggestions.
        """
        planning_rules = self.rules.inject_rules(category="planning", max_rules=3)
        execution_rules = self.rules.inject_rules(category="execution", max_rules=3)
        meta_rules = self.rules.inject_rules(category="meta", max_rules=2)

        strategy = self.strategy.suggest(complexity)
        trend = self.analytics.score_trend()

        return {
            "planning_rules": planning_rules,
            "execution_rules": execution_rules,
            "meta_rules": meta_rules,
            "strategy": strategy,
            "trend": trend,
            "run_number": self._run_number,
        }

    def record_verification(self, avg_score: float, tasks_passed: int, total_tasks: int):
        """Call after VERIFY phase to feed back into rule engine."""
        self.rules.record_application(self._run_number)
        self.rules.record_feedback(avg_score, tasks_passed, total_tasks)
        log_evolution_event("verification_feedback", {
            "run": self._run_number,
            "avg_score": avg_score,
            "passed": tasks_passed,
            "total": total_tasks,
        })

    def record_evolution(self, new_rules: list, knowledge_nodes: list,
                         complexity: str, task_count: int, avg_score: float,
                         elapsed: float):
        """Call after EVOLVE phase to complete the learning loop."""
        # Add new rules
        added_rules = self.rules.add_rules(new_rules, self._run_number)

        # Retire bad rules
        retired = self.rules.retire_ineffective(self._run_number)

        # Add knowledge
        added_nodes = self.knowledge.add_nodes(knowledge_nodes)

        # Record strategy outcome
        self.strategy.record_outcome(complexity, task_count, avg_score, elapsed)

        log_evolution_event("evolution_complete", {
            "run": self._run_number,
            "rules_added": added_rules,
            "rules_retired": len(retired),
            "knowledge_added": added_nodes,
            "complexity": complexity,
            "avg_score": avg_score,
        })

        return {
            "rules_added": added_rules,
            "rules_retired": len(retired),
            "knowledge_added": added_nodes,
            "rule_stats": self.rules.stats(),
            "knowledge_stats": self.knowledge.stats(),
        }

    def full_status(self) -> dict:
        """Get complete evolution system status."""
        return {
            "run_number": self._run_number,
            "rules": self.rules.stats(),
            "analytics": self.analytics.full_report(),
            "knowledge": self.knowledge.stats(),
        }


# ── Singleton ────────────────────────────────────────────
_engine_instance: Optional[EvolutionEngine] = None


def get_evolution_engine() -> EvolutionEngine:
    """Get or create the singleton evolution engine."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = EvolutionEngine()
    return _engine_instance
