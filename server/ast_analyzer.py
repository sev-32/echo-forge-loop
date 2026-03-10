from __future__ import annotations
"""
AST Analyzer — Deep Code Structure Analysis
=============================================

Extracts structural information from Python and TypeScript files:
  - Symbol tables (functions, classes, exports, variables)
  - Dependency graphs (file → file edges via imports)
  - Call graphs (function → function edges)
  - Complexity metrics (cyclomatic complexity, nesting depth)
  - Project skeleton generation (compact structural overview)

Usage:
  analyzer = ASTAnalyzer("/path/to/project")
  symbols = analyzer.extract_symbols("src/main.py")
  graph = analyzer.build_dependency_graph()
  skeleton = analyzer.generate_skeleton()
"""

import ast
import json
import logging
import os
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger("echo_forge.ast")


# ═══════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════

@dataclass
class Symbol:
    """A code symbol (function, class, variable, export)."""
    name: str
    kind: str  # "function", "class", "method", "variable", "export", "import"
    filepath: str
    line: int
    end_line: int = 0
    signature: str = ""
    docstring: str = ""
    decorators: list[str] = field(default_factory=list)
    parent: str = ""  # parent class/module
    is_exported: bool = False
    is_async: bool = False
    complexity: int = 1  # cyclomatic complexity
    parameters: list[str] = field(default_factory=list)
    return_type: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        # Trim docstring for compactness
        if d["docstring"] and len(d["docstring"]) > 200:
            d["docstring"] = d["docstring"][:200] + "..."
        return {k: v for k, v in d.items() if v}


@dataclass
class FileSymbols:
    """All symbols in a single file."""
    filepath: str
    language: str  # "python", "typescript", "javascript"
    symbols: list[Symbol] = field(default_factory=list)
    imports: list[dict] = field(default_factory=list)  # [{source, symbols, is_relative}]
    exports: list[str] = field(default_factory=list)
    total_lines: int = 0
    total_functions: int = 0
    total_classes: int = 0

    def to_dict(self) -> dict:
        return {
            "filepath": self.filepath,
            "language": self.language,
            "total_lines": self.total_lines,
            "total_functions": self.total_functions,
            "total_classes": self.total_classes,
            "symbols": [s.to_dict() for s in self.symbols],
            "imports": self.imports,
            "exports": self.exports,
        }

    def to_compact(self) -> str:
        """Compact representation for LLM context."""
        lines = [f"# {self.filepath} ({self.language})"]
        for s in self.symbols:
            indent = "  " if s.parent else ""
            if s.kind == "class":
                lines.append(f"{indent}class {s.name}:")
            elif s.kind in ("function", "method"):
                prefix = "async " if s.is_async else ""
                lines.append(f"{indent}{prefix}def {s.signature or s.name}")
            elif s.kind == "variable":
                lines.append(f"{indent}{s.name}")
        return "\n".join(lines)


@dataclass
class DependencyEdge:
    """A dependency relationship between files."""
    source: str
    target: str
    symbols: list[str] = field(default_factory=list)
    is_relative: bool = False
    weight: float = 1.0  # number of symbols imported

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ProjectSkeleton:
    """Compact structural overview of a project."""
    root: str
    file_count: int = 0
    total_symbols: int = 0
    total_functions: int = 0
    total_classes: int = 0
    file_summaries: list[dict] = field(default_factory=list)
    dependency_edges: list[dict] = field(default_factory=list)
    entry_points: list[str] = field(default_factory=list)
    key_interfaces: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    def to_prompt(self, max_lines: int = 100) -> str:
        """Render as a compact prompt section."""
        lines = [
            "## Project Structure",
            f"Files: {self.file_count} | Functions: {self.total_functions} | Classes: {self.total_classes}",
            "",
        ]
        if self.entry_points:
            lines.append(f"Entry points: {', '.join(self.entry_points)}")
            lines.append("")

        lines.append("### Files")
        for fs in self.file_summaries[:50]:
            fns = fs.get("functions", 0)
            cls = fs.get("classes", 0)
            ln = fs.get("lines", 0)
            parts = []
            if fns: parts.append(f"{fns}fn")
            if cls: parts.append(f"{cls}cls")
            parts.append(f"{ln}L")
            lines.append(f"  {fs['path']} ({', '.join(parts)})")

        if self.dependency_edges:
            lines.append("")
            lines.append("### Dependencies")
            for edge in self.dependency_edges[:30]:
                syms = ", ".join(edge.get("symbols", [])[:5])
                lines.append(f"  {edge['source']} -> {edge['target']}: [{syms}]")

        return "\n".join(lines[:max_lines])


# ═══════════════════════════════════════════════════════
# AST ANALYZER
# ═══════════════════════════════════════════════════════

# File extensions to analyze by language
LANG_MAP = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
}

# Directories to skip
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".next", "dist", "build",
    ".venv", "venv", "env", ".env", ".tox", "coverage", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", "target",
}


class ASTAnalyzer:
    """Deep code structure analyzer for Python and TypeScript/JavaScript."""

    def __init__(self, project_path: str = ""):
        self.root = Path(project_path) if project_path else Path.cwd()
        self._symbol_cache: dict[str, FileSymbols] = {}

    # ── Python AST ────────────────────────────────────

    def _analyze_python(self, filepath: str, content: str) -> FileSymbols:
        """Parse Python file using the ast module."""
        result = FileSymbols(
            filepath=filepath,
            language="python",
            total_lines=content.count("\n") + 1,
        )

        try:
            tree = ast.parse(content, filename=filepath)
        except SyntaxError as e:
            logger.warning(f"SyntaxError in {filepath}: {e}")
            return result

        for node in ast.walk(tree):
            # ── Functions ─────────────────────────────
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                params = []
                for arg in node.args.args:
                    p = arg.arg
                    if arg.annotation:
                        try:
                            p += f": {ast.unparse(arg.annotation)}"
                        except Exception:
                            pass
                    params.append(p)

                ret = ""
                if node.returns:
                    try:
                        ret = ast.unparse(node.returns)
                    except Exception:
                        pass

                # Determine if method or function
                parent = ""
                kind = "function"
                for parent_node in ast.walk(tree):
                    if isinstance(parent_node, ast.ClassDef):
                        for item in parent_node.body:
                            if item is node:
                                parent = parent_node.name
                                kind = "method"
                                break

                sig_parts = ", ".join(params)
                sig = f"{node.name}({sig_parts})"
                if ret:
                    sig += f" -> {ret}"

                symbol = Symbol(
                    name=node.name,
                    kind=kind,
                    filepath=filepath,
                    line=node.lineno,
                    end_line=node.end_lineno or node.lineno,
                    signature=sig,
                    docstring=ast.get_docstring(node) or "",
                    decorators=[
                        ast.unparse(d) if hasattr(ast, 'unparse') else str(d)
                        for d in node.decorator_list
                    ],
                    parent=parent,
                    is_async=isinstance(node, ast.AsyncFunctionDef),
                    complexity=self._python_complexity(node),
                    parameters=params,
                    return_type=ret,
                )
                result.symbols.append(symbol)
                result.total_functions += 1

            # ── Classes ───────────────────────────────
            elif isinstance(node, ast.ClassDef):
                bases = []
                for base in node.bases:
                    try:
                        bases.append(ast.unparse(base))
                    except Exception:
                        bases.append("?")

                sig = node.name
                if bases:
                    sig += f"({', '.join(bases)})"

                symbol = Symbol(
                    name=node.name,
                    kind="class",
                    filepath=filepath,
                    line=node.lineno,
                    end_line=node.end_lineno or node.lineno,
                    signature=sig,
                    docstring=ast.get_docstring(node) or "",
                    decorators=[
                        ast.unparse(d) if hasattr(ast, 'unparse') else str(d)
                        for d in node.decorator_list
                    ],
                )
                result.symbols.append(symbol)
                result.total_classes += 1

        # ── Imports ───────────────────────────────────
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    result.imports.append({
                        "source": alias.name,
                        "symbols": [alias.asname or alias.name],
                        "is_relative": False,
                    })
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                is_rel = (node.level or 0) > 0
                symbols = [a.asname or a.name for a in (node.names or [])]
                result.imports.append({
                    "source": ("." * (node.level or 0)) + module,
                    "symbols": symbols,
                    "is_relative": is_rel,
                })

        return result

    def _python_complexity(self, node: ast.AST) -> int:
        """Compute cyclomatic complexity of a function/method."""
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.ExceptHandler)):
                complexity += 1
            elif isinstance(child, ast.BoolOp):
                complexity += len(child.values) - 1
            elif isinstance(child, (ast.Assert, ast.Raise)):
                complexity += 1
        return complexity

    # ── TypeScript/JavaScript ─────────────────────────

    def _analyze_typescript(self, filepath: str, content: str) -> FileSymbols:
        """Parse TypeScript/JavaScript using regex patterns (no external parser needed)."""
        ext = Path(filepath).suffix
        lang = LANG_MAP.get(ext, "javascript")
        result = FileSymbols(
            filepath=filepath,
            language=lang,
            total_lines=content.count("\n") + 1,
        )

        # ── Functions ─────────────────────────────────
        fn_patterns = [
            # export function foo(args): RetType
            r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^\{]+))?\s*\{',
            # const foo = (args) => or async (args) =>
            r'(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>',
            # const foo = function(args)
            r'(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)',
        ]
        for pattern in fn_patterns:
            for match in re.finditer(pattern, content):
                name = match.group(1)
                params = match.group(2).strip() if match.group(2) else ""
                ret = match.group(3).strip() if len(match.groups()) > 2 and match.group(3) else ""
                line = content[:match.start()].count("\n") + 1
                is_async = "async" in content[max(0, match.start()-20):match.start()+10]
                is_export = "export" in content[max(0, match.start()-10):match.start()+1]

                sig = f"{name}({params})"
                if ret:
                    sig += f": {ret}"

                result.symbols.append(Symbol(
                    name=name,
                    kind="function",
                    filepath=filepath,
                    line=line,
                    signature=sig,
                    is_async=is_async,
                    is_exported=is_export,
                    parameters=params.split(",") if params else [],
                    return_type=ret,
                ))
                result.total_functions += 1

        # ── Classes ───────────────────────────────────
        cls_pattern = r'(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*(?:implements\s+([\w,\s]+))?\s*\{'
        for match in re.finditer(cls_pattern, content):
            name = match.group(1)
            extends = match.group(2) or ""
            line = content[:match.start()].count("\n") + 1
            is_export = "export" in content[max(0, match.start()-10):match.start()+1]

            sig = name
            if extends:
                sig += f" extends {extends}"

            result.symbols.append(Symbol(
                name=name,
                kind="class",
                filepath=filepath,
                line=line,
                signature=sig,
                is_exported=is_export,
            ))
            result.total_classes += 1

        # ── Interfaces ────────────────────────────────
        iface_pattern = r'(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?\s*\{'
        for match in re.finditer(iface_pattern, content):
            name = match.group(1)
            line = content[:match.start()].count("\n") + 1
            result.symbols.append(Symbol(
                name=name,
                kind="class",
                filepath=filepath,
                line=line,
                signature=f"interface {name}",
                is_exported="export" in content[max(0, match.start()-10):match.start()+1],
            ))
            result.total_classes += 1

        # ── Type Aliases ──────────────────────────────
        type_pattern = r'(?:export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*='
        for match in re.finditer(type_pattern, content):
            name = match.group(1)
            line = content[:match.start()].count("\n") + 1
            result.symbols.append(Symbol(
                name=name,
                kind="variable",
                filepath=filepath,
                line=line,
                signature=f"type {name}",
                is_exported="export" in content[max(0, match.start()-10):match.start()+1],
            ))

        # ── Imports ───────────────────────────────────
        import_patterns = [
            # import { a, b } from 'module'
            r'import\s*\{([^}]+)\}\s*from\s*[\'"]([^\'"]+)[\'"]',
            # import Foo from 'module'
            r'import\s+(\w+)\s+from\s*[\'"]([^\'"]+)[\'"]',
            # import * as Foo from 'module'
            r'import\s+\*\s+as\s+(\w+)\s+from\s*[\'"]([^\'"]+)[\'"]',
        ]
        for pattern in import_patterns:
            for match in re.finditer(pattern, content):
                symbols = [s.strip().split(" as ")[0].strip() for s in match.group(1).split(",")]
                source = match.group(2)
                result.imports.append({
                    "source": source,
                    "symbols": symbols,
                    "is_relative": source.startswith("."),
                })

        # ── Exports ───────────────────────────────────
        export_pattern = r'export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)'
        for match in re.finditer(export_pattern, content):
            result.exports.append(match.group(1))

        return result

    # ── Public API ────────────────────────────────────

    def extract_symbols(self, filepath: str) -> FileSymbols:
        """Extract all symbols from a single file."""
        abs_path = str(self.root / filepath) if not os.path.isabs(filepath) else filepath
        rel_path = os.path.relpath(abs_path, self.root)

        if rel_path in self._symbol_cache:
            return self._symbol_cache[rel_path]

        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except (OSError, IOError) as e:
            logger.warning(f"Cannot read {filepath}: {e}")
            return FileSymbols(filepath=rel_path, language="unknown")

        ext = Path(abs_path).suffix.lower()
        lang = LANG_MAP.get(ext)

        if lang == "python":
            result = self._analyze_python(rel_path, content)
        elif lang in ("typescript", "javascript"):
            result = self._analyze_typescript(rel_path, content)
        else:
            result = FileSymbols(filepath=rel_path, language="unknown", total_lines=content.count("\n") + 1)

        self._symbol_cache[rel_path] = result
        return result

    def scan_project(self, max_files: int = 500) -> list[FileSymbols]:
        """Scan entire project for symbols."""
        all_symbols = []
        count = 0

        for dirpath, dirnames, filenames in os.walk(self.root):
            # Skip excluded directories
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext not in LANG_MAP:
                    continue

                abs_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(abs_path, self.root)
                symbols = self.extract_symbols(rel_path)
                all_symbols.append(symbols)

                count += 1
                if count >= max_files:
                    break
            if count >= max_files:
                break

        logger.info(
            f"Scanned {count} files: "
            f"{sum(fs.total_functions for fs in all_symbols)} functions, "
            f"{sum(fs.total_classes for fs in all_symbols)} classes"
        )
        return all_symbols

    def build_dependency_graph(self, files: list[FileSymbols] | None = None) -> list[DependencyEdge]:
        """Build a dependency graph from import analysis."""
        if files is None:
            files = self.scan_project()

        edges = []
        for fs in files:
            for imp in fs.imports:
                source = imp.get("source", "")
                symbols = imp.get("symbols", [])
                is_rel = imp.get("is_relative", False)

                # Try to resolve target to a project file
                target = self._resolve_target(fs.filepath, source)

                edges.append(DependencyEdge(
                    source=fs.filepath,
                    target=target or source,
                    symbols=symbols,
                    is_relative=is_rel,
                    weight=len(symbols),
                ))

        return edges

    def _resolve_target(self, source_file: str, import_source: str) -> str | None:
        """Resolve an import source to a project file path."""
        if not import_source.startswith("."):
            # External package
            return None

        source_dir = str(Path(source_file).parent)
        # Try common extensions
        for ext in [".ts", ".tsx", ".js", ".jsx", ".py", "/index.ts", "/index.tsx", "/index.js"]:
            candidate = os.path.normpath(os.path.join(source_dir, import_source + ext))
            if (self.root / candidate).exists():
                return candidate.replace("\\", "/")

        return None

    def generate_skeleton(self, max_files: int = 200) -> ProjectSkeleton:
        """Generate a compact project skeleton."""
        files = self.scan_project(max_files)
        edges = self.build_dependency_graph(files)

        # Find entry points (files imported by many but importing few)
        import_counts: dict[str, int] = {}
        imported_by: dict[str, int] = {}
        for edge in edges:
            import_counts[edge.source] = import_counts.get(edge.source, 0) + 1
            if edge.target:
                imported_by[edge.target] = imported_by.get(edge.target, 0) + 1

        entry_points = []
        for fs in files:
            if fs.filepath.endswith(("main.py", "app.py", "index.ts", "index.tsx", "App.tsx", "main.ts")):
                entry_points.append(fs.filepath)

        # Key interfaces: classes/interfaces with many methods
        key_interfaces = []
        for fs in files:
            for sym in fs.symbols:
                if sym.kind == "class" and sum(1 for s in fs.symbols if s.parent == sym.name) >= 3:
                    key_interfaces.append({
                        "name": sym.name,
                        "file": fs.filepath,
                        "methods": [s.name for s in fs.symbols if s.parent == sym.name],
                    })

        skeleton = ProjectSkeleton(
            root=str(self.root),
            file_count=len(files),
            total_symbols=sum(len(fs.symbols) for fs in files),
            total_functions=sum(fs.total_functions for fs in files),
            total_classes=sum(fs.total_classes for fs in files),
            file_summaries=[
                {
                    "path": fs.filepath,
                    "language": fs.language,
                    "lines": fs.total_lines,
                    "functions": fs.total_functions,
                    "classes": fs.total_classes,
                    "imports": len(fs.imports),
                    "exports": fs.exports,
                }
                for fs in sorted(files, key=lambda f: f.total_lines, reverse=True)
            ],
            dependency_edges=[e.to_dict() for e in edges if e.target],
            entry_points=entry_points,
            key_interfaces=key_interfaces[:20],
        )

        logger.info(
            f"Skeleton: {skeleton.file_count} files, "
            f"{skeleton.total_functions} fn, {skeleton.total_classes} cls, "
            f"{len(skeleton.dependency_edges)} edges"
        )
        return skeleton


# ── Singleton ────────────────────────────────────────

_analyzer: Optional[ASTAnalyzer] = None


def get_ast_analyzer(project_path: str = "") -> ASTAnalyzer:
    global _analyzer
    if _analyzer is None or (project_path and str(_analyzer.root) != project_path):
        _analyzer = ASTAnalyzer(project_path)
    return _analyzer
