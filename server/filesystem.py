"""
Echo Forge Loop — File System API
==================================

Provides safe, sandboxed file system operations for the IDE.
All paths are resolved relative to the project root and validated
to prevent directory traversal attacks.
"""

import os
import json
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

# ── Configuration ─────────────────────────────────────────

# Default project root is the echo-forge-loop directory
_server_dir = Path(__file__).resolve().parent
DEFAULT_PROJECT_ROOT = _server_dir.parent

# Directories and patterns to exclude from file listings
EXCLUDE_PATTERNS = {
    'node_modules', '.git', '__pycache__', '.vite', 'dist',
    '.next', '.cache', '.DS_Store', 'Thumbs.db',
}

EXCLUDE_EXTENSIONS = {'.pyc', '.pyo', '.ico'}

# Language detection by extension
LANGUAGE_MAP = {
    '.py': 'python', '.js': 'javascript', '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript', '.json': 'json',
    '.md': 'markdown', '.css': 'css', '.scss': 'scss',
    '.html': 'html', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.ini': 'ini', '.cfg': 'ini',
    '.sh': 'shell', '.bash': 'shell', '.ps1': 'powershell',
    '.sql': 'sql', '.graphql': 'graphql',
    '.rs': 'rust', '.go': 'go', '.java': 'java',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
    '.kt': 'kotlin', '.dart': 'dart', '.lua': 'lua',
    '.r': 'r', '.R': 'r', '.txt': 'plaintext',
    '.env': 'plaintext', '.gitignore': 'plaintext',
    '.dockerfile': 'dockerfile', '.dockerignore': 'plaintext',
}


def get_language(filename: str) -> str:
    """Detect language from filename for Monaco editor."""
    name = Path(filename).name.lower()
    if name == 'dockerfile':
        return 'dockerfile'
    if name in ('.env', '.env.example', '.env.local'):
        return 'plaintext'
    ext = Path(filename).suffix.lower()
    return LANGUAGE_MAP.get(ext, 'plaintext')


class FileSystemManager:
    """
    Sandboxed file system manager.
    
    All operations are restricted to the project root.
    Path traversal is prevented by resolving and checking all paths.
    """

    def __init__(self, project_root: Optional[str] = None):
        self.root = Path(project_root or DEFAULT_PROJECT_ROOT).resolve()
        if not self.root.exists():
            raise ValueError(f"Project root does not exist: {self.root}")

    def _safe_path(self, relative_path: str) -> Path:
        """Resolve a relative path safely within the project root."""
        # Normalize and resolve
        resolved = (self.root / relative_path).resolve()
        # Security check: must be within project root
        if not str(resolved).startswith(str(self.root)):
            raise PermissionError(f"Path traversal blocked: {relative_path}")
        return resolved

    def _is_excluded(self, path: Path) -> bool:
        """Check if a path should be excluded from listings."""
        name = path.name
        if name in EXCLUDE_PATTERNS:
            return True
        if path.is_file() and path.suffix in EXCLUDE_EXTENSIONS:
            return True
        return False

    def get_tree(self, relative_path: str = '', max_depth: int = 5) -> Dict[str, Any]:
        """
        Get the file tree starting from relative_path.
        
        Returns a nested dict with:
        {
            "name": "filename",
            "path": "relative/path",
            "type": "file" | "directory",
            "language": "python",  (files only)
            "size": 1234,          (files only)
            "children": [...]      (directories only)
        }
        """
        target = self._safe_path(relative_path)
        if not target.exists():
            raise FileNotFoundError(f"Path not found: {relative_path}")
        return self._build_tree(target, depth=0, max_depth=max_depth)

    def _build_tree(self, path: Path, depth: int, max_depth: int) -> Dict[str, Any]:
        """Recursively build the file tree."""
        rel_path = str(path.relative_to(self.root)).replace('\\', '/')
        if rel_path == '.':
            rel_path = ''

        node: Dict[str, Any] = {
            'name': path.name or self.root.name,
            'path': rel_path,
        }

        if path.is_file():
            node['type'] = 'file'
            node['language'] = get_language(path.name)
            try:
                node['size'] = path.stat().st_size
            except OSError:
                node['size'] = 0
        elif path.is_dir():
            node['type'] = 'directory'
            if depth < max_depth:
                children = []
                try:
                    entries = sorted(
                        path.iterdir(),
                        key=lambda p: (not p.is_dir(), p.name.lower())
                    )
                    for entry in entries:
                        if not self._is_excluded(entry):
                            children.append(
                                self._build_tree(entry, depth + 1, max_depth)
                            )
                except PermissionError:
                    pass
                node['children'] = children
            else:
                node['children'] = []
        return node

    def read_file(self, relative_path: str) -> Dict[str, Any]:
        """Read a file and return its content with metadata."""
        path = self._safe_path(relative_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {relative_path}")
        if not path.is_file():
            raise ValueError(f"Not a file: {relative_path}")

        # Check if binary
        try:
            content = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            return {
                'path': relative_path,
                'language': get_language(path.name),
                'content': '[Binary file — cannot display]',
                'binary': True,
                'size': path.stat().st_size,
            }

        return {
            'path': relative_path,
            'language': get_language(path.name),
            'content': content,
            'binary': False,
            'size': len(content),
            'lines': content.count('\n') + 1,
        }

    def write_file(self, relative_path: str, content: str) -> Dict[str, Any]:
        """Write content to a file (create or overwrite)."""
        path = self._safe_path(relative_path)
        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')

        return {
            'path': relative_path,
            'size': len(content),
            'lines': content.count('\n') + 1,
            'created': not path.exists(),
        }

    def create_file(self, relative_path: str, content: str = '') -> Dict[str, Any]:
        """Create a new file. Fails if it already exists."""
        path = self._safe_path(relative_path)
        if path.exists():
            raise FileExistsError(f"File already exists: {relative_path}")
        return self.write_file(relative_path, content)

    def delete_file(self, relative_path: str) -> Dict[str, Any]:
        """Delete a file or empty directory."""
        path = self._safe_path(relative_path)
        if not path.exists():
            raise FileNotFoundError(f"Not found: {relative_path}")

        if path.is_file():
            path.unlink()
            return {'path': relative_path, 'deleted': True, 'type': 'file'}
        elif path.is_dir():
            # Only delete empty directories for safety
            if any(path.iterdir()):
                raise ValueError(f"Directory not empty: {relative_path}")
            path.rmdir()
            return {'path': relative_path, 'deleted': True, 'type': 'directory'}
        return {'path': relative_path, 'deleted': False}

    def rename(self, old_path: str, new_path: str) -> Dict[str, Any]:
        """Rename/move a file or directory."""
        src = self._safe_path(old_path)
        dst = self._safe_path(new_path)
        if not src.exists():
            raise FileNotFoundError(f"Not found: {old_path}")
        if dst.exists():
            raise FileExistsError(f"Already exists: {new_path}")
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
        return {'old_path': old_path, 'new_path': new_path, 'renamed': True}

    def create_directory(self, relative_path: str) -> Dict[str, Any]:
        """Create a directory (including parents)."""
        path = self._safe_path(relative_path)
        path.mkdir(parents=True, exist_ok=True)
        return {'path': relative_path, 'created': True}

    def search_files(self, query: str, max_results: int = 50) -> List[Dict[str, Any]]:
        """Search for files by name pattern."""
        results = []
        query_lower = query.lower()
        for path in self.root.rglob('*'):
            if self._is_excluded(path) or any(
                p in EXCLUDE_PATTERNS for p in path.parts
            ):
                continue
            if query_lower in path.name.lower():
                rel = str(path.relative_to(self.root)).replace('\\', '/')
                results.append({
                    'name': path.name,
                    'path': rel,
                    'type': 'file' if path.is_file() else 'directory',
                    'language': get_language(path.name) if path.is_file() else None,
                })
                if len(results) >= max_results:
                    break
        return results


# ── Singleton ─────────────────────────────────────────────
_fs_instance: Optional[FileSystemManager] = None


def get_filesystem(project_root: Optional[str] = None) -> FileSystemManager:
    """Get or create the singleton FileSystemManager."""
    global _fs_instance
    if _fs_instance is None:
        _fs_instance = FileSystemManager(project_root)
    return _fs_instance
