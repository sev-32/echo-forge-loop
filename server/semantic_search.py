from __future__ import annotations
"""
Semantic Search — Embedding-based Code Search
==============================================

Provides natural language → code mapping:
  - Indexes codebase files with TF-IDF-based similarity (no external API needed)
  - Supports natural language queries against code
  - Token-aware context packing with budget management

For true embedding-based search, an embedding model can be plugged in later.
This implementation uses TF-IDF with BM25-style scoring for zero-cost operation.

Usage:
  search = SemanticSearch("/path/to/project")
  search.index_project()
  results = search.search("authentication middleware")
  context = search.get_relevant_context("add user login", max_tokens=4000)
"""

import logging
import math
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger("echo_forge.search")

# File extensions to index
INDEXABLE = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss",
    ".html", ".json", ".yaml", ".yml", ".toml", ".md",
    ".sql", ".sh", ".env", ".cfg",
}

SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".next", "dist", "build",
    ".venv", "venv", "env", ".tox", "coverage", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", "target", ".svelte-kit",
}


# ═══════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════

@dataclass
class SearchHit:
    """A search result with relevance scoring."""
    filepath: str
    score: float
    matched_chunks: list[str] = field(default_factory=list)
    line_numbers: list[int] = field(default_factory=list)
    preview: str = ""

    def to_dict(self) -> dict:
        return {
            "filepath": self.filepath,
            "score": round(self.score, 4),
            "matched_chunks": self.matched_chunks[:5],
            "line_numbers": self.line_numbers[:10],
            "preview": self.preview[:300],
        }


@dataclass
class IndexedFile:
    """An indexed file with term frequencies."""
    filepath: str
    content: str
    chunks: list[str]  # split by logical blocks
    term_freq: Counter
    total_terms: int
    line_count: int


# ═══════════════════════════════════════════════════════
# SEMANTIC SEARCH ENGINE
# ═══════════════════════════════════════════════════════

class SemanticSearch:
    """
    TF-IDF / BM25-style semantic search across a codebase.
    
    Uses term frequency and inverse document frequency for relevance scoring.
    Splits code into chunks (functions, classes, blocks) for granular matching.
    """

    # BM25 parameters
    K1 = 1.5
    B = 0.75

    def __init__(self, project_path: str = ""):
        self.root = Path(project_path) if project_path else Path.cwd()
        self._index: dict[str, IndexedFile] = {}
        self._idf: dict[str, float] = {}
        self._avg_doc_len = 0.0
        self._is_indexed = False

    def _tokenize(self, text: str) -> list[str]:
        """Tokenize text into searchable terms."""
        # Split camelCase and snake_case
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        text = text.replace("_", " ").replace("-", " ")
        # Extract words
        tokens = re.findall(r'[a-zA-Z]{2,}', text.lower())
        return tokens

    def _chunk_content(self, content: str, filepath: str) -> list[str]:
        """Split file content into logical chunks."""
        ext = Path(filepath).suffix.lower()
        chunks = []

        if ext == ".py":
            # Split on class/function definitions
            pattern = r'(?:^|\n)(?:class |def |async def )'
            parts = re.split(pattern, content)
            for part in parts:
                if part.strip():
                    chunks.append(part.strip()[:2000])
        elif ext in (".ts", ".tsx", ".js", ".jsx"):
            # Split on function/class/export
            pattern = r'(?:^|\n)(?:export |function |class |const |interface |type )'
            parts = re.split(pattern, content)
            for part in parts:
                if part.strip():
                    chunks.append(part.strip()[:2000])
        else:
            # Split by paragraph/sections
            sections = content.split("\n\n")
            for section in sections:
                if section.strip():
                    chunks.append(section.strip()[:2000])

        # Ensure at least one chunk
        if not chunks:
            chunks = [content[:3000]]

        return chunks

    def index_project(self, max_files: int = 300) -> int:
        """Index all files in the project."""
        self._index.clear()
        count = 0

        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext not in INDEXABLE:
                    continue

                abs_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(abs_path, self.root).replace("\\", "/")

                try:
                    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                except (OSError, IOError):
                    continue

                # Skip very large files
                if len(content) > 200_000:
                    continue

                chunks = self._chunk_content(content, rel_path)
                tokens = self._tokenize(content)
                tf = Counter(tokens)

                self._index[rel_path] = IndexedFile(
                    filepath=rel_path,
                    content=content,
                    chunks=chunks,
                    term_freq=tf,
                    total_terms=len(tokens),
                    line_count=content.count("\n") + 1,
                )

                count += 1
                if count >= max_files:
                    break
            if count >= max_files:
                break

        # Compute IDF
        self._compute_idf()
        self._is_indexed = True
        logger.info(f"Indexed {count} files, {len(self._idf)} unique terms")
        return count

    def _compute_idf(self):
        """Compute inverse document frequency for all terms."""
        n = len(self._index)
        if n == 0:
            return

        doc_freq: Counter = Counter()
        total_len = 0

        for indexed in self._index.values():
            total_len += indexed.total_terms
            for term in set(indexed.term_freq.keys()):
                doc_freq[term] += 1

        self._avg_doc_len = total_len / n if n > 0 else 1.0

        for term, df in doc_freq.items():
            self._idf[term] = math.log((n - df + 0.5) / (df + 0.5) + 1)

    def _bm25_score(self, query_terms: list[str], doc: IndexedFile) -> float:
        """Compute BM25 relevance score."""
        score = 0.0
        dl = doc.total_terms
        avgdl = self._avg_doc_len

        for term in query_terms:
            if term not in self._idf:
                continue
            tf = doc.term_freq.get(term, 0)
            idf = self._idf[term]
            numerator = tf * (self.K1 + 1)
            denominator = tf + self.K1 * (1 - self.B + self.B * dl / avgdl)
            score += idf * numerator / denominator

        # Bonus for filename match
        filename_tokens = self._tokenize(doc.filepath)
        for term in query_terms:
            if term in filename_tokens:
                score += 2.0

        return score

    def search(self, query: str, max_results: int = 20) -> list[SearchHit]:
        """Search the indexed codebase."""
        if not self._is_indexed:
            return []  # Must call index_project() first

        query_terms = self._tokenize(query)
        if not query_terms:
            return []

        results: list[tuple[float, str]] = []
        for path, doc in self._index.items():
            score = self._bm25_score(query_terms, doc)
            if score > 0:
                results.append((score, path))

        results.sort(reverse=True)

        hits = []
        for score, path in results[:max_results]:
            doc = self._index[path]

            # Find matching lines
            matched_lines = []
            line_nums = []
            for i, line in enumerate(doc.content.split("\n"), 1):
                line_lower = line.lower()
                if any(term in line_lower for term in query_terms):
                    matched_lines.append(line.strip()[:200])
                    line_nums.append(i)
                    if len(matched_lines) >= 5:
                        break

            preview = "\n".join(matched_lines[:3]) if matched_lines else doc.content[:200]

            hits.append(SearchHit(
                filepath=path,
                score=score,
                matched_chunks=matched_lines,
                line_numbers=line_nums,
                preview=preview,
            ))

        return hits

    def get_relevant_context(
        self,
        query: str,
        max_tokens: int = 4000,
        max_files: int = 10,
    ) -> dict:
        """
        Build a token-budgeted context pack from search results.
        
        Returns a dict with:
          - files: {path: content} of most relevant files
          - total_tokens: estimated token count
          - budget_used: percentage of budget used
        """
        if not self._is_indexed:
            return {"files": {}, "file_count": 0, "total_tokens": 0, "budget_used": 0, "query": query, "need_index": True}

        hits = self.search(query, max_results=max_files * 2)

        files: dict[str, str] = {}
        total_tokens = 0

        for hit in hits:
            doc = self._index.get(hit.filepath)
            if not doc:
                continue

            # Rough token estimate: 1 token ~ 4 chars
            file_tokens = len(doc.content) // 4

            if total_tokens + file_tokens > max_tokens:
                # Try to fit a truncated version
                remaining = max_tokens - total_tokens
                if remaining > 200:
                    truncated = doc.content[:remaining * 4]
                    files[hit.filepath] = truncated + "\n# ... truncated"
                    total_tokens += remaining
                break

            files[hit.filepath] = doc.content
            total_tokens += file_tokens

            if len(files) >= max_files:
                break

        return {
            "files": files,
            "file_count": len(files),
            "total_tokens": total_tokens,
            "budget_used": round(total_tokens / max_tokens * 100, 1) if max_tokens > 0 else 0,
            "query": query,
        }

    def status(self) -> dict:
        return {
            "indexed": self._is_indexed,
            "file_count": len(self._index),
            "unique_terms": len(self._idf),
            "avg_doc_length": round(self._avg_doc_len, 1),
            "root": str(self.root),
        }


# ── Singleton ────────────────────────────────────────

_search: Optional[SemanticSearch] = None


def get_semantic_search(project_path: str = "") -> SemanticSearch:
    global _search
    if _search is None or (project_path and str(_search.root) != project_path):
        _search = SemanticSearch(project_path)
    return _search
