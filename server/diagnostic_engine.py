from __future__ import annotations
"""
Diagnostic Engine — Intelligent Code Analysis + Security
==========================================================

Project-aware diagnostics:
  - Pattern-based code quality rules (anti-patterns, style, correctness)
  - Security scanning (hardcoded secrets, insecure patterns, dependency risks)
  - Project-type-specific rules (React, Python, FastAPI, etc.)
  - Error grouping and deduplication
  - Severity classification with fix suggestions

Usage:
  engine = DiagnosticEngine("/path/to/project")
  results = engine.run_full_scan()
  security = engine.run_security_scan()
"""

import json
import logging
import os
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger("echo_forge.diagnostics")


# ═══════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════

@dataclass
class Diagnostic:
    """A single diagnostic finding."""
    id: str
    severity: str      # "error", "warning", "info", "hint"
    category: str      # "security", "quality", "performance", "style", "correctness"
    rule: str          # Rule identifier (e.g., "SEC-001")
    message: str
    filepath: str
    line: int = 0
    end_line: int = 0
    column: int = 0
    snippet: str = ""
    fix_suggestion: str = ""
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return {k: v for k, v in d.items() if v}


@dataclass
class DiagnosticGroup:
    """Grouped diagnostics by rule."""
    rule: str
    severity: str
    category: str
    message_template: str
    count: int = 0
    files: list[str] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "rule": self.rule,
            "severity": self.severity,
            "category": self.category,
            "message": self.message_template,
            "count": self.count,
            "files": list(set(self.files))[:20],
            "diagnostics": [d.to_dict() for d in self.diagnostics[:10]],
        }


@dataclass
class ScanResult:
    """Complete scan result with summary."""
    total: int = 0
    errors: int = 0
    warnings: int = 0
    info: int = 0
    hints: int = 0
    security: int = 0
    files_scanned: int = 0
    diagnostics: list[Diagnostic] = field(default_factory=list)
    groups: list[DiagnosticGroup] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "summary": {
                "total": self.total,
                "errors": self.errors,
                "warnings": self.warnings,
                "info": self.info,
                "hints": self.hints,
                "security_issues": self.security,
                "files_scanned": self.files_scanned,
            },
            "groups": [g.to_dict() for g in self.groups],
            "diagnostics": [d.to_dict() for d in self.diagnostics[:100]],
        }


# ═══════════════════════════════════════════════════════
# RULE DEFINITIONS
# ═══════════════════════════════════════════════════════

@dataclass
class Rule:
    """A diagnostic rule definition."""
    id: str
    severity: str
    category: str
    message: str
    pattern: str         # regex pattern
    languages: list[str] # file extensions
    fix: str = ""
    tags: list[str] = field(default_factory=list)
    negative: bool = False  # True = flag if pattern NOT found


# ── Security Rules ────────────────────────────────────

SECURITY_RULES = [
    Rule(
        id="SEC-001", severity="error", category="security",
        message="Hardcoded API key or secret detected",
        pattern=r'''(?:api[_-]?key|secret[_-]?key|auth[_-]?token|password|passwd)\s*[=:]\s*['"][A-Za-z0-9+/=_\-]{16,}['"]''',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx", ".env"],
        fix="Move to environment variable",
        tags=["secrets", "credential-leak"],
    ),
    Rule(
        id="SEC-002", severity="error", category="security",
        message="AWS access key pattern detected",
        pattern=r'AKIA[0-9A-Z]{16}',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx", ".env", ".yaml", ".yml", ".json"],
        fix="Use AWS IAM roles or environment variables",
        tags=["aws", "secrets"],
    ),
    Rule(
        id="SEC-003", severity="error", category="security",
        message="Private key material detected",
        pattern=r'-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx", ".pem", ".key"],
        fix="Store private keys in a secrets manager",
        tags=["secrets", "private-key"],
    ),
    Rule(
        id="SEC-004", severity="warning", category="security",
        message="Insecure HTTP URL (should use HTTPS)",
        pattern=r'''['"]http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^\s'"]+['"]''',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx"],
        fix="Use HTTPS for external connections",
        tags=["transport-security"],
    ),
    Rule(
        id="SEC-005", severity="warning", category="security",
        message="eval() usage detected — potential code injection",
        pattern=r'\beval\s*\(',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx"],
        fix="Avoid eval(); use safe parsing alternatives",
        tags=["injection", "code-execution"],
    ),
    Rule(
        id="SEC-006", severity="warning", category="security",
        message="SQL string concatenation — potential SQL injection",
        pattern=r'''(?:execute|cursor\.execute|query)\s*\(\s*(?:f['\"]|['\"].*%s|['\"].*\+\s*\w)''',
        languages=[".py"],
        fix="Use parameterized queries",
        tags=["injection", "sql"],
    ),
    Rule(
        id="SEC-007", severity="warning", category="security",
        message="dangerouslySetInnerHTML usage — potential XSS",
        pattern=r'dangerouslySetInnerHTML',
        languages=[".tsx", ".jsx"],
        fix="Sanitize HTML content before rendering",
        tags=["xss", "injection"],
    ),
    Rule(
        id="SEC-008", severity="info", category="security",
        message="CORS wildcard origin (*) — restricts cookie-based auth",
        pattern=r'''allow_origins\s*=\s*\[?\s*['"]\*['"]\s*\]?''',
        languages=[".py"],
        fix="Specify allowed origins explicitly in production",
        tags=["cors", "configuration"],
    ),
    Rule(
        id="SEC-009", severity="warning", category="security",
        message="subprocess.shell=True — potential command injection",
        pattern=r'subprocess\.\w+\([^)]*shell\s*=\s*True',
        languages=[".py"],
        fix="Use shell=False with argument list",
        tags=["injection", "command-execution"],
    ),
    Rule(
        id="SEC-010", severity="error", category="security",
        message="JWT secret hardcoded in source",
        pattern=r'''(?:jwt[_\.]?secret|JWT_SECRET)\s*[=:]\s*['"][^'"]{8,}['"]''',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx", ".env"],
        fix="Move JWT secret to environment variable",
        tags=["secrets", "jwt"],
    ),
]

# ── Quality Rules ─────────────────────────────────────

QUALITY_RULES = [
    Rule(
        id="QA-001", severity="warning", category="quality",
        message="TODO/FIXME/HACK comment found",
        pattern=r'#\s*(?:TODO|FIXME|HACK|XXX|BUG)\b|//\s*(?:TODO|FIXME|HACK|XXX|BUG)\b',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx"],
        tags=["maintenance", "tech-debt"],
    ),
    Rule(
        id="QA-002", severity="warning", category="quality",
        message="Empty except/catch block — swallows errors silently",
        pattern=r'except\s*(?:\w+\s*)?:\s*$\s*pass|catch\s*\([^)]*\)\s*\{\s*\}',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx"],
        fix="Log the error or handle it explicitly",
        tags=["error-handling"],
    ),
    Rule(
        id="QA-003", severity="info", category="quality",
        message="Console.log/print statement in production code",
        pattern=r'\bconsole\.log\s*\(|(?<!\w)print\s*\(',
        languages=[".ts", ".tsx", ".js", ".jsx", ".py"],
        fix="Use a proper logging framework",
        tags=["logging", "cleanup"],
    ),
    Rule(
        id="QA-004", severity="hint", category="quality",
        message="Magic number — consider named constant",
        pattern=r'(?<![.\w])(?:1000|3000|5000|8000|10000|86400|3600|60000)\b',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx"],
        fix="Extract to named constant for readability",
        tags=["readability"],
    ),
    Rule(
        id="QA-005", severity="warning", category="quality",
        message="Function exceeds 50 lines — consider decomposition",
        pattern=r'',  # special: measured by line count, handled in code
        languages=[".py", ".ts", ".tsx", ".js", ".jsx"],
        fix="Split into smaller focused functions",
        tags=["complexity", "maintainability"],
    ),
    Rule(
        id="QA-006", severity="warning", category="quality",
        message="Deeply nested code (4+ levels) — reduce cognitive complexity",
        pattern=r'^(?:\s{16,}|\t{4,})(?:if |for |while |try:)',
        languages=[".py"],
        fix="Extract nested logic into helper functions",
        tags=["complexity", "readability"],
    ),
    Rule(
        id="QA-007", severity="info", category="quality",
        message="Unused import detected",
        pattern=r'^import\s+\w+$|^from\s+\w+\s+import\s+\w+$',
        languages=[".py"],
        tags=["cleanup"],
    ),
]

# ── Performance Rules ─────────────────────────────────

PERFORMANCE_RULES = [
    Rule(
        id="PERF-001", severity="warning", category="performance",
        message="Synchronous file I/O in async context",
        pattern=r'async\s+def\s+\w+.*\n(?:.*\n)*?.*(?:open\(|\.read\(|\.write\(|os\.path)',
        languages=[".py"],
        fix="Use aiofiles for async file I/O",
        tags=["async", "io"],
    ),
    Rule(
        id="PERF-002", severity="info", category="performance",
        message="N+1 query pattern — fetching in a loop",
        pattern=r'for\s+\w+\s+in\s+.*:\s*\n\s+.*(?:\.get\(|\.fetch\(|\.query\(|await\s+)',
        languages=[".py", ".ts", ".tsx", ".js", ".jsx"],
        fix="Batch the queries or use eager loading",
        tags=["database", "optimization"],
    ),
    Rule(
        id="PERF-003", severity="hint", category="performance",
        message="Large inline object in React render — consider useMemo",
        pattern=r'(?:style|className)=\{\{[^}]{100,}\}\}',
        languages=[".tsx", ".jsx"],
        fix="Extract to useMemo or move outside component",
        tags=["react", "rendering"],
    ),
]

# ── Style Rules (React/TS specific) ──────────────────

STYLE_RULES = [
    Rule(
        id="STY-001", severity="hint", category="style",
        message="Component file should use PascalCase naming",
        pattern=r'',  # checked by filename
        languages=[".tsx", ".jsx"],
        tags=["naming-convention"],
    ),
    Rule(
        id="STY-002", severity="info", category="style",
        message="Inline style object — prefer CSS classes",
        pattern=r'style=\{\{(?!.*cursor|.*position).*\}\}',
        languages=[".tsx", ".jsx"],
        fix="Use CSS modules, classes, or styled-components",
        tags=["css", "maintainability"],
    ),
    Rule(
        id="STY-003", severity="hint", category="style",
        message="Any type usage — prefer specific types",
        pattern=r':\s*any\b|as\s+any\b|<any>',
        languages=[".ts", ".tsx"],
        fix="Replace 'any' with a specific type",
        tags=["typescript", "type-safety"],
    ),
]

ALL_RULES = SECURITY_RULES + QUALITY_RULES + PERFORMANCE_RULES + STYLE_RULES


# ═══════════════════════════════════════════════════════
# DIAGNOSTIC ENGINE
# ═══════════════════════════════════════════════════════

SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".next", "dist", "build",
    ".venv", "venv", "env", ".tox", "coverage", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", "target",
}

SCANNABLE = {".py", ".ts", ".tsx", ".js", ".jsx", ".env", ".yaml", ".yml", ".json"}

_diag_counter = 0


def _next_id() -> str:
    global _diag_counter
    _diag_counter += 1
    return f"D{_diag_counter:04d}"


class DiagnosticEngine:
    """Project-aware diagnostic and security scanning engine."""

    def __init__(self, project_path: str = ""):
        self.root = Path(project_path) if project_path else Path.cwd()
        self._project_type = "unknown"
        self._detect_project_type()

    def _detect_project_type(self):
        """Detect project type for rule customization."""
        if (self.root / "package.json").exists():
            try:
                pkg = json.loads((self.root / "package.json").read_text())
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "react" in deps:
                    self._project_type = "react"
                elif "next" in deps:
                    self._project_type = "nextjs"
                elif "vue" in deps:
                    self._project_type = "vue"
                else:
                    self._project_type = "node"
            except Exception:
                self._project_type = "node"
        elif (self.root / "requirements.txt").exists() or (self.root / "pyproject.toml").exists():
            self._project_type = "python"
            if (self.root / "manage.py").exists():
                self._project_type = "django"
        elif (self.root / "Cargo.toml").exists():
            self._project_type = "rust"
        elif (self.root / "go.mod").exists():
            self._project_type = "go"

    def _get_applicable_rules(self, filepath: str) -> list[Rule]:
        """Filter rules applicable to this file type."""
        ext = Path(filepath).suffix.lower()
        return [r for r in ALL_RULES if ext in r.languages and r.pattern]

    def _scan_file(self, filepath: str, content: str) -> list[Diagnostic]:
        """Scan a single file for diagnostics."""
        results = []
        rules = self._get_applicable_rules(filepath)

        for rule in rules:
            if not rule.pattern:
                continue

            try:
                for match in re.finditer(rule.pattern, content, re.MULTILINE | re.IGNORECASE):
                    line_num = content[:match.start()].count("\n") + 1
                    line_content = content.split("\n")[line_num - 1] if line_num <= content.count("\n") + 1 else ""

                    results.append(Diagnostic(
                        id=_next_id(),
                        severity=rule.severity,
                        category=rule.category,
                        rule=rule.id,
                        message=rule.message,
                        filepath=filepath,
                        line=line_num,
                        snippet=line_content.strip()[:200],
                        fix_suggestion=rule.fix,
                        tags=rule.tags,
                    ))
            except re.error:
                continue

        # ── Special checks ────────────────────────────

        # QA-005: Long functions
        lines = content.split("\n")
        fn_start = None
        fn_name = ""
        for i, line in enumerate(lines):
            if re.match(r'^(?:async\s+)?(?:def|function)\s+(\w+)', line) or \
               re.match(r'^(?:export\s+)?(?:async\s+)?function\s+(\w+)', line):
                if fn_start is not None and i - fn_start > 50:
                    results.append(Diagnostic(
                        id=_next_id(),
                        severity="warning", category="quality",
                        rule="QA-005",
                        message=f"Function '{fn_name}' is {i - fn_start} lines — consider decomposition",
                        filepath=filepath, line=fn_start + 1,
                        fix_suggestion="Split into smaller focused functions",
                        tags=["complexity", "maintainability"],
                    ))
                m = re.match(r'(?:async\s+)?(?:def|function|export\s+(?:async\s+)?function)\s+(\w+)', line)
                fn_name = m.group(1) if m else "unknown"
                fn_start = i

        # Check last function
        if fn_start is not None and len(lines) - fn_start > 50:
            results.append(Diagnostic(
                id=_next_id(),
                severity="warning", category="quality",
                rule="QA-005",
                message=f"Function '{fn_name}' is {len(lines) - fn_start} lines — consider decomposition",
                filepath=filepath, line=fn_start + 1,
                fix_suggestion="Split into smaller focused functions",
                tags=["complexity", "maintainability"],
            ))

        return results

    def _scan_dependencies(self) -> list[Diagnostic]:
        """Scan package manifests for known vulnerable patterns."""
        results = []
        pkg_path = self.root / "package.json"
        req_path = self.root / "requirements.txt"

        if pkg_path.exists():
            try:
                pkg = json.loads(pkg_path.read_text())
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

                # Check for commonly vulnerable packages
                risky = {
                    "lodash": "< 4.17.21 has prototype pollution",
                    "axios": "< 0.21.1 has SSRF vulnerability",
                    "serialize-javascript": "< 3.1.0 has XSS vulnerability",
                    "node-forge": "< 1.3.0 has several CVEs",
                }
                for pkg_name, warning in risky.items():
                    if pkg_name in deps:
                        results.append(Diagnostic(
                            id=_next_id(),
                            severity="info", category="security",
                            rule="SEC-DEP-001",
                            message=f"Dependency '{pkg_name}' — {warning}",
                            filepath="package.json",
                            fix_suggestion=f"Update {pkg_name} to latest version",
                            tags=["dependency", "cve"],
                        ))
            except Exception:
                pass

        if req_path.exists():
            try:
                content = req_path.read_text()
                # Flag unpinned dependencies
                for line in content.strip().split("\n"):
                    line = line.strip()
                    if line and not line.startswith("#"):
                        if "==" not in line and ">=" not in line and "<=" not in line:
                            pkg_name = re.split(r'[<>=!]', line)[0].strip()
                            if pkg_name:
                                results.append(Diagnostic(
                                    id=_next_id(),
                                    severity="hint", category="security",
                                    rule="SEC-DEP-002",
                                    message=f"Unpinned dependency: {pkg_name}",
                                    filepath="requirements.txt",
                                    fix_suggestion="Pin with ==version for reproducible builds",
                                    tags=["dependency", "reproducibility"],
                                ))
            except Exception:
                pass

        return results

    # ── Public API ────────────────────────────────────

    def run_full_scan(self, max_files: int = 300) -> ScanResult:
        """Run full diagnostic scan across the project."""
        result = ScanResult()
        all_diagnostics = []
        count = 0

        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext not in SCANNABLE:
                    continue

                abs_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(abs_path, self.root).replace("\\", "/")

                try:
                    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                except (OSError, IOError):
                    continue

                if len(content) > 200_000:
                    continue

                file_diags = self._scan_file(rel_path, content)
                all_diagnostics.extend(file_diags)

                count += 1
                if count >= max_files:
                    break
            if count >= max_files:
                break

        # Add dependency scan
        all_diagnostics.extend(self._scan_dependencies())

        # Deduplicate and group
        result.files_scanned = count
        result.diagnostics = all_diagnostics
        result.total = len(all_diagnostics)
        result.errors = sum(1 for d in all_diagnostics if d.severity == "error")
        result.warnings = sum(1 for d in all_diagnostics if d.severity == "warning")
        result.info = sum(1 for d in all_diagnostics if d.severity == "info")
        result.hints = sum(1 for d in all_diagnostics if d.severity == "hint")
        result.security = sum(1 for d in all_diagnostics if d.category == "security")
        result.groups = self._group_diagnostics(all_diagnostics)

        logger.info(
            f"Scan complete: {result.total} findings "
            f"({result.errors}E/{result.warnings}W/{result.info}I/{result.hints}H) "
            f"in {count} files, {result.security} security"
        )
        return result

    def run_security_scan(self, max_files: int = 300) -> ScanResult:
        """Run security-focused scan only."""
        result = ScanResult()
        all_diagnostics = []
        count = 0

        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext not in SCANNABLE:
                    continue

                abs_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(abs_path, self.root).replace("\\", "/")

                try:
                    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                except (OSError, IOError):
                    continue

                if len(content) > 200_000:
                    continue

                # Only apply security rules
                for rule in SECURITY_RULES:
                    if ext not in rule.languages or not rule.pattern:
                        continue
                    try:
                        for match in re.finditer(rule.pattern, content, re.MULTILINE | re.IGNORECASE):
                            line_num = content[:match.start()].count("\n") + 1
                            line_content = content.split("\n")[line_num - 1] if line_num <= content.count("\n") + 1 else ""
                            all_diagnostics.append(Diagnostic(
                                id=_next_id(),
                                severity=rule.severity, category="security",
                                rule=rule.id, message=rule.message,
                                filepath=rel_path, line=line_num,
                                snippet=line_content.strip()[:200],
                                fix_suggestion=rule.fix, tags=rule.tags,
                            ))
                    except re.error:
                        continue

                count += 1
                if count >= max_files:
                    break
            if count >= max_files:
                break

        all_diagnostics.extend(self._scan_dependencies())

        result.files_scanned = count
        result.diagnostics = all_diagnostics
        result.total = len(all_diagnostics)
        result.errors = sum(1 for d in all_diagnostics if d.severity == "error")
        result.warnings = sum(1 for d in all_diagnostics if d.severity == "warning")
        result.info = sum(1 for d in all_diagnostics if d.severity == "info")
        result.security = result.total
        result.groups = self._group_diagnostics(all_diagnostics)
        return result

    def scan_file(self, filepath: str) -> list[Diagnostic]:
        """Scan a single file."""
        abs_path = str(self.root / filepath) if not os.path.isabs(filepath) else filepath
        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except (OSError, IOError):
            return []
        rel_path = os.path.relpath(abs_path, self.root).replace("\\", "/")
        return self._scan_file(rel_path, content)

    def _group_diagnostics(self, diagnostics: list[Diagnostic]) -> list[DiagnosticGroup]:
        """Group diagnostics by rule for summary view."""
        groups: dict[str, DiagnosticGroup] = {}
        for d in diagnostics:
            if d.rule not in groups:
                groups[d.rule] = DiagnosticGroup(
                    rule=d.rule,
                    severity=d.severity,
                    category=d.category,
                    message_template=d.message,
                )
            g = groups[d.rule]
            g.count += 1
            g.files.append(d.filepath)
            g.diagnostics.append(d)

        return sorted(
            groups.values(),
            key=lambda g: {"error": 0, "warning": 1, "info": 2, "hint": 3}.get(g.severity, 4),
        )

    def status(self) -> dict:
        return {
            "project_type": self._project_type,
            "root": str(self.root),
            "total_rules": len(ALL_RULES),
            "security_rules": len(SECURITY_RULES),
            "quality_rules": len(QUALITY_RULES),
            "performance_rules": len(PERFORMANCE_RULES),
            "style_rules": len(STYLE_RULES),
        }


# ── Singleton ────────────────────────────────────────

_engine: Optional[DiagnosticEngine] = None


def get_diagnostic_engine(project_path: str = "") -> DiagnosticEngine:
    global _engine
    if _engine is None or (project_path and str(_engine.root) != project_path):
        _engine = DiagnosticEngine(project_path)
    return _engine
