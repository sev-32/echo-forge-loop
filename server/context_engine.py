"""
Context Engine — Deep Project Awareness
=========================================

Provides intelligent project context for code generation:
  - Auto-detect project type (React, Python, Node, etc.)
  - Read and parse config files (package.json, tsconfig, etc.)
  - Build import/dependency maps
  - Semantic code search (grep + context windows)
  - Token-optimized context packing for LLM prompts

This is what prevents hallucinated imports and broken patterns.

Usage:
  from context_engine import ContextEngine
  ctx = ContextEngine("/path/to/project")
  pack = ctx.build_context_pack(["src/App.tsx"], max_tokens=4000)
"""

import os, json, re
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict

from filesystem import FileSystemManager


# ── Data Models ──────────────────────────────────────

@dataclass
class ProjectProfile:
    """Auto-detected project characteristics."""
    project_type: str = "unknown"          # react, python, node, vite, next, etc.
    language: str = "unknown"              # typescript, javascript, python, etc.
    framework: str = ""                    # react, fastapi, express, etc.
    package_manager: str = ""              # npm, yarn, pnpm, pip, poetry
    entry_points: list[str] = field(default_factory=list)
    config_files: dict[str, str] = field(default_factory=dict)  # path → content
    dependencies: dict[str, str] = field(default_factory=dict)  # name → version
    dev_dependencies: dict[str, str] = field(default_factory=dict)
    scripts: dict[str, str] = field(default_factory=dict)       # script name → command
    structure: dict = field(default_factory=dict)
    
    def to_dict(self):
        return asdict(self)


@dataclass
class ImportEdge:
    """An import relationship between files."""
    source: str          # file that imports
    target: str          # module being imported
    symbols: list[str]   # imported symbols
    is_relative: bool    # ./foo vs package


@dataclass
class SearchResult:
    """A semantic search hit."""
    filepath: str
    line_number: int
    line_content: str
    context_before: list[str]
    context_after: list[str]
    score: float = 1.0


@dataclass
class ContextPack:
    """Token-optimized context for LLM prompts."""
    profile: ProjectProfile
    files: dict[str, str]              # path → content (trimmed)
    imports: list[dict]                # import edges as dicts
    search_results: list[dict]         # search hits as dicts
    total_tokens: int = 0
    budget_used: float = 0.0           # 0.0 - 1.0

    def to_prompt(self) -> str:
        """Render as a structured prompt section."""
        parts = []
        
        # Project profile
        parts.append("## Project Profile")
        parts.append(f"- Type: {self.profile.project_type}")
        parts.append(f"- Language: {self.profile.language}")
        if self.profile.framework:
            parts.append(f"- Framework: {self.profile.framework}")
        
        # Key dependencies
        if self.profile.dependencies:
            top_deps = list(self.profile.dependencies.keys())[:15]
            parts.append(f"- Dependencies: {', '.join(top_deps)}")
        
        # Available scripts
        if self.profile.scripts:
            parts.append(f"- Scripts: {', '.join(self.profile.scripts.keys())}")
        
        # Files
        if self.files:
            parts.append("\n## Reference Files")
            for fpath, content in self.files.items():
                lang = _guess_lang(fpath)
                parts.append(f"\n### {fpath}")
                parts.append(f"```{lang}")
                parts.append(content)
                parts.append("```")
        
        # Search results
        if self.search_results:
            parts.append("\n## Relevant Code")
            for hit in self.search_results[:10]:
                parts.append(f"\n**{hit['filepath']}:{hit['line_number']}**")
                parts.append(f"```")
                for b in hit.get("context_before", []):
                    parts.append(f"  {b}")
                parts.append(f"> {hit['line_content']}")
                for a in hit.get("context_after", []):
                    parts.append(f"  {a}")
                parts.append(f"```")
        
        return "\n".join(parts)


# ── Context Engine ───────────────────────────────────

class ContextEngine:
    """Builds deep project context for AI code generation."""

    def __init__(self, project_path: str = ""):
        self.root = Path(project_path) if project_path else Path.cwd()
        self.fs = FileSystemManager(str(self.root))
        self._profile: Optional[ProjectProfile] = None

    # ── Project Detection ────────────────────────────

    def detect_project(self) -> ProjectProfile:
        """Auto-detect project type, language, framework, and dependencies."""
        if self._profile:
            return self._profile

        profile = ProjectProfile()

        # Check for config files
        config_checks = [
            ("package.json", self._parse_package_json),
            ("tsconfig.json", self._parse_tsconfig),
            ("vite.config.ts", self._detect_vite),
            ("vite.config.js", self._detect_vite),
            ("next.config.js", self._detect_next),
            ("next.config.mjs", self._detect_next),
            ("requirements.txt", self._parse_requirements),
            ("pyproject.toml", self._parse_pyproject),
            ("setup.py", self._detect_python_pkg),
            ("Cargo.toml", self._detect_rust),
            ("go.mod", self._detect_go),
            (".env", self._parse_env),
            (".env.local", self._parse_env),
        ]

        for config_file, parser in config_checks:
            try:
                content = self.fs.read_file(config_file)
                if content:
                    profile.config_files[config_file] = content[:3000]
                    parser(profile, content)
            except Exception:
                pass

        # Determine project structure
        try:
            tree = self.fs.get_tree(max_depth=2)
            profile.structure = tree
        except Exception:
            pass

        # Detect entry points
        for ep in ["src/main.tsx", "src/main.ts", "src/index.tsx", "src/index.ts",
                    "src/App.tsx", "src/App.ts", "app/page.tsx", "main.py", "app.py",
                    "server/main.py", "index.js", "index.ts"]:
            try:
                content = self.fs.read_file(ep)
                if content:
                    profile.entry_points.append(ep)
            except Exception:
                pass

        self._profile = profile
        return profile

    def _parse_package_json(self, profile: ProjectProfile, content: str):
        try:
            pkg = json.loads(content)
            profile.package_manager = "npm"  # default
            profile.dependencies = pkg.get("dependencies", {})
            profile.dev_dependencies = pkg.get("devDependencies", {})
            profile.scripts = pkg.get("scripts", {})

            all_deps = {**profile.dependencies, **profile.dev_dependencies}

            # Detect framework
            if "react" in all_deps:
                profile.framework = "react"
                profile.project_type = "react"
                profile.language = "typescript" if "typescript" in all_deps else "javascript"
            if "next" in all_deps:
                profile.framework = "next"
                profile.project_type = "next"
            if "vue" in all_deps:
                profile.framework = "vue"
                profile.project_type = "vue"
            if "vite" in all_deps:
                profile.project_type = "vite"
            if "@angular/core" in all_deps:
                profile.framework = "angular"
                profile.project_type = "angular"

            # Detect package manager
            if Path(self.root / "yarn.lock").exists():
                profile.package_manager = "yarn"
            elif Path(self.root / "pnpm-lock.yaml").exists():
                profile.package_manager = "pnpm"

        except json.JSONDecodeError:
            pass

    def _parse_tsconfig(self, profile: ProjectProfile, content: str):
        profile.language = "typescript"
        profile.config_files["tsconfig.json"] = content[:2000]

    def _detect_vite(self, profile: ProjectProfile, content: str):
        if profile.project_type == "unknown":
            profile.project_type = "vite"

    def _detect_next(self, profile: ProjectProfile, content: str):
        profile.project_type = "next"
        profile.framework = "next"

    def _parse_requirements(self, profile: ProjectProfile, content: str):
        profile.project_type = "python"
        profile.language = "python"
        profile.package_manager = "pip"
        for line in content.strip().split("\n"):
            line = line.strip()
            if line and not line.startswith("#"):
                parts = re.split(r'[><=!~]', line, 1)
                name = parts[0].strip()
                version = parts[1].strip() if len(parts) > 1 else "*"
                profile.dependencies[name] = version
        if "fastapi" in profile.dependencies:
            profile.framework = "fastapi"
        elif "flask" in profile.dependencies:
            profile.framework = "flask"
        elif "django" in profile.dependencies:
            profile.framework = "django"

    def _parse_pyproject(self, profile: ProjectProfile, content: str):
        profile.project_type = "python"
        profile.language = "python"
        profile.package_manager = "poetry" if "[tool.poetry]" in content else "pip"

    def _detect_python_pkg(self, profile: ProjectProfile, content: str):
        profile.project_type = "python"
        profile.language = "python"

    def _detect_rust(self, profile: ProjectProfile, content: str):
        profile.project_type = "rust"
        profile.language = "rust"
        profile.package_manager = "cargo"

    def _detect_go(self, profile: ProjectProfile, content: str):
        profile.project_type = "go"
        profile.language = "go"
        profile.package_manager = "go"

    def _parse_env(self, profile: ProjectProfile, content: str):
        # Don't store actual values for security, just key names
        keys = []
        for line in content.split("\n"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                keys.append(line.split("=")[0].strip())
        profile.config_files[".env_keys"] = json.dumps(keys)

    # ── Import Analysis ──────────────────────────────

    def analyze_imports(self, filepath: str) -> list[ImportEdge]:
        """Parse imports from a source file."""
        try:
            content = self.fs.read_file(filepath)
            if not content:
                return []
        except Exception:
            return []

        edges = []
        ext = Path(filepath).suffix.lower()

        if ext in ('.ts', '.tsx', '.js', '.jsx'):
            edges = self._parse_ts_imports(filepath, content)
        elif ext == '.py':
            edges = self._parse_py_imports(filepath, content)

        return edges

    def _parse_ts_imports(self, source: str, content: str) -> list[ImportEdge]:
        edges = []
        # import { Foo, Bar } from './module'
        pattern = r"import\s+(?:{([^}]+)}\s+from\s+|(\w+)\s+from\s+|)\s*['\"]([^'\"]+)['\"]"
        for m in re.finditer(pattern, content):
            symbols_str = m.group(1) or ""
            default = m.group(2) or ""
            target = m.group(3)
            symbols = [s.strip() for s in symbols_str.split(",") if s.strip()]
            if default:
                symbols.insert(0, default)
            edges.append(ImportEdge(
                source=source,
                target=target,
                symbols=symbols,
                is_relative=target.startswith(".") or target.startswith("@/"),
            ))
        return edges

    def _parse_py_imports(self, source: str, content: str) -> list[ImportEdge]:
        edges = []
        # from module import foo, bar
        for m in re.finditer(r"from\s+([\w.]+)\s+import\s+(.+)", content):
            target = m.group(1)
            symbols = [s.strip() for s in m.group(2).split(",")]
            edges.append(ImportEdge(
                source=source,
                target=target,
                symbols=symbols,
                is_relative=target.startswith("."),
            ))
        # import module
        for m in re.finditer(r"^import\s+([\w.]+)", content, re.MULTILINE):
            target = m.group(1)
            edges.append(ImportEdge(
                source=source,
                target=target,
                symbols=[],
                is_relative=False,
            ))
        return edges

    def build_dependency_map(self, entry_files: list[str] | None = None) -> dict:
        """Build a map of imports across the project."""
        if not entry_files:
            profile = self.detect_project()
            entry_files = profile.entry_points

        all_edges: list[ImportEdge] = []
        visited = set()

        def crawl(filepath: str, depth: int = 0):
            if filepath in visited or depth > 5:
                return
            visited.add(filepath)
            edges = self.analyze_imports(filepath)
            all_edges.extend(edges)
            for e in edges:
                if e.is_relative:
                    resolved = self._resolve_import(filepath, e.target)
                    if resolved:
                        crawl(resolved, depth + 1)

        for f in entry_files:
            crawl(f)

        return {
            "edges": [{"source": e.source, "target": e.target, "symbols": e.symbols, "relative": e.is_relative} for e in all_edges],
            "files_analyzed": len(visited),
            "total_imports": len(all_edges),
            "external_packages": list({e.target.split("/")[0] for e in all_edges if not e.is_relative}),
        }

    def _resolve_import(self, source: str, target: str) -> Optional[str]:
        """Resolve a relative import to an actual file path."""
        source_dir = str(Path(source).parent)
        if target.startswith("@/"):
            # Alias — assume src/
            candidate = target.replace("@/", "src/")
        elif target.startswith("."):
            candidate = str(Path(source_dir) / target)
        else:
            return None

        # Try extensions
        for ext in [".tsx", ".ts", ".jsx", ".js", ".py", "/index.tsx", "/index.ts", "/index.js"]:
            full = candidate + ext
            try:
                if self.fs.read_file(full) is not None:
                    return full
            except Exception:
                pass
        return None

    # ── Code Search ──────────────────────────────────

    def search(self, query: str, max_results: int = 20, context_lines: int = 3) -> list[SearchResult]:
        """Search across the project for a query string."""
        results = []
        
        # Get searchable files
        extensions = {'.ts', '.tsx', '.js', '.jsx', '.py', '.css', '.html', '.json', '.md'}
        ignore_dirs = {'node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.vite'}
        
        for root_dir, dirs, files in os.walk(str(self.root)):
            # Skip ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for fname in files:
                ext = Path(fname).suffix.lower()
                if ext not in extensions:
                    continue
                
                fpath = Path(root_dir) / fname
                rel_path = str(fpath.relative_to(self.root)).replace("\\", "/")
                
                try:
                    content = fpath.read_text(encoding="utf-8", errors="ignore")
                    lines = content.split("\n")
                    
                    for i, line in enumerate(lines):
                        if query.lower() in line.lower():
                            ctx_before = lines[max(0, i - context_lines):i]
                            ctx_after = lines[i + 1:i + 1 + context_lines]
                            
                            results.append(SearchResult(
                                filepath=rel_path,
                                line_number=i + 1,
                                line_content=line.strip(),
                                context_before=[l.strip() for l in ctx_before],
                                context_after=[l.strip() for l in ctx_after],
                            ))
                            
                            if len(results) >= max_results:
                                return results
                except Exception:
                    pass
        
        return results

    # ── Context Pack Builder ─────────────────────────

    def build_context_pack(
        self,
        focus_files: list[str] | None = None,
        search_query: str = "",
        max_tokens: int = 8000,
    ) -> ContextPack:
        """Build a token-optimized context pack for LLM prompts."""
        profile = self.detect_project()
        
        files_content: dict[str, str] = {}
        token_count = 0
        
        # Add focus files
        if focus_files:
            for fp in focus_files:
                try:
                    content = self.fs.read_file(fp)
                    if content:
                        tokens = len(content) // 4
                        if token_count + tokens < max_tokens * 0.6:
                            files_content[fp] = content
                            token_count += tokens
                except Exception:
                    pass
        
        # Add key config files (trimmed)
        for cfg_name, cfg_content in profile.config_files.items():
            if cfg_name.startswith(".env"):
                continue
            tokens = len(cfg_content) // 4
            if token_count + tokens < max_tokens * 0.8:
                files_content[cfg_name] = cfg_content[:1500]
                token_count += tokens
        
        # Search results
        search_results = []
        if search_query:
            hits = self.search(search_query, max_results=10)
            search_results = [
                {
                    "filepath": h.filepath,
                    "line_number": h.line_number,
                    "line_content": h.line_content,
                    "context_before": h.context_before,
                    "context_after": h.context_after,
                }
                for h in hits
            ]
        
        # Import map for focus files
        import_edges = []
        if focus_files:
            for fp in focus_files:
                edges = self.analyze_imports(fp)
                import_edges.extend([
                    {"source": e.source, "target": e.target, "symbols": e.symbols}
                    for e in edges
                ])
        
        return ContextPack(
            profile=profile,
            files=files_content,
            imports=import_edges,
            search_results=search_results,
            total_tokens=token_count,
            budget_used=token_count / max_tokens if max_tokens else 0,
        )


# ── Utility ──────────────────────────────────────────

LANG_MAP = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.jsx': 'javascript', '.html': 'html', '.css': 'css', '.json': 'json',
    '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
}

def _guess_lang(filepath: str) -> str:
    return LANG_MAP.get(Path(filepath).suffix.lower(), 'text')


# ── Singleton ────────────────────────────────────────

_engine: Optional[ContextEngine] = None

def get_context_engine(project_path: str = "") -> ContextEngine:
    global _engine
    if _engine is None or project_path:
        path = project_path or os.environ.get("EFL_PROJECT_PATH", "")
        _engine = ContextEngine(path)
    return _engine
