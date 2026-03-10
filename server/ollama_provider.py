from __future__ import annotations
"""
Ollama Provider — Local LLM Access via Network
================================================

Connects to Ollama instance on AIM-OS dedicated machine.
Provides: chat completion, code generation, embedding generation.

Ghost Machine: 192.168.2.25:11434
Models Available:
  - qwen2.5-coder:3b    (fast code generation)
  - starcoder2:3b        (code completion)
  - deepseek-coder:1.3b  (ultra-fast code)
  - deepseek-coder:6.7b  (high-quality code)
  - nomic-embed-text     (vector embeddings for semantic search)
  - phi4-mini            (efficient reasoning)
  - gemma3:4b            (balanced general)
  - qwen3:4b             (general reasoning)
  - mistral:latest       (general 7B)

Usage:
  provider = OllamaProvider()
  response = await provider.generate("Write a Python function...")
  embeddings = await provider.embed("function that sorts a list")
  models = await provider.list_models()
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("echo_forge.ollama")

# ═══════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "192.168.2.25")
OLLAMA_PORT = int(os.environ.get("OLLAMA_PORT", "11434"))
OLLAMA_BASE = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}"

# Model routing — best model for each task
MODEL_ROUTES = {
    "code_fast":     "qwen2.5-coder:3b",
    "code_quality":  "deepseek-coder:6.7b",
    "code_complete": "starcoder2:3b",
    "code_tiny":     "deepseek-coder:1.3b",
    "embed":         "nomic-embed-text:latest",
    "reason":        "qwen3:4b",
    "general":       "mistral:latest",
    "balanced":      "gemma3:4b",
    "efficient":     "phi4-mini:latest",
}

DEFAULT_CODE_MODEL = MODEL_ROUTES["code_fast"]
DEFAULT_CHAT_MODEL = MODEL_ROUTES["general"]
DEFAULT_EMBED_MODEL = MODEL_ROUTES["embed"]


# ═══════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════

@dataclass
class OllamaResponse:
    """Response from Ollama API."""
    model: str
    content: str
    done: bool = True
    total_duration_ms: float = 0
    eval_count: int = 0
    tokens_per_second: float = 0

    def to_dict(self) -> dict:
        return {
            "model": self.model,
            "content": self.content,
            "done": self.done,
            "performance": {
                "total_ms": round(self.total_duration_ms, 1),
                "tokens": self.eval_count,
                "tokens_per_second": round(self.tokens_per_second, 1),
            },
        }


@dataclass
class EmbeddingResult:
    """Embedding vector result."""
    model: str
    embedding: list[float] = field(default_factory=list)
    dimensions: int = 0

    def to_dict(self) -> dict:
        return {
            "model": self.model,
            "dimensions": self.dimensions,
            "embedding_preview": self.embedding[:8] if self.embedding else [],
        }


# ═══════════════════════════════════════════════════════
# OLLAMA PROVIDER
# ═══════════════════════════════════════════════════════

class OllamaProvider:
    """Local LLM provider via Ollama on the AIM-OS dedicated machine."""

    def __init__(self, host: str = "", port: int = 0):
        self.host = host or OLLAMA_HOST
        self.port = port or OLLAMA_PORT
        self.base_url = f"http://{self.host}:{self.port}"
        self._available_models: list[dict] = []
        self._last_model_check = 0

    # ── HTTP helpers ──────────────────────────────────

    def _request(self, path: str, data: Optional[dict] = None,
                 method: str = "GET", timeout: int = 60) -> dict:
        """Make HTTP request to Ollama API."""
        url = f"{self.base_url}{path}"
        if data:
            body = json.dumps(data).encode("utf-8")
            req = urllib.request.Request(url, data=body, method=method)
            req.add_header("Content-Type", "application/json")
        else:
            req = urllib.request.Request(url, method=method)

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            logger.error(f"Ollama request failed: {url} — {e}")
            raise ConnectionError(f"Cannot reach Ollama at {self.base_url}: {e}")
        except json.JSONDecodeError:
            return {}

    # ── Public API ────────────────────────────────────

    def is_available(self) -> bool:
        """Check if Ollama is reachable."""
        try:
            self._request("/", timeout=3)
            return True
        except (ConnectionError, Exception):
            return False

    def list_models(self) -> list[dict]:
        """List available models."""
        now = time.time()
        if self._available_models and now - self._last_model_check < 60:
            return self._available_models

        try:
            resp = self._request("/api/tags", timeout=5)
            self._available_models = resp.get("models", [])
            self._last_model_check = now
            return self._available_models
        except Exception:
            return self._available_models

    def generate(self, prompt: str, model: str = "",
                 system: str = "", temperature: float = 0.7,
                 max_tokens: int = 2048) -> OllamaResponse:
        """Generate text completion."""
        model = model or DEFAULT_CODE_MODEL

        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        if system:
            payload["system"] = system

        try:
            resp = self._request("/api/generate", data=payload, method="POST",
                                 timeout=120)
        except ConnectionError as e:
            return OllamaResponse(model=model, content=f"Error: {e}", done=False)

        total_ns = resp.get("total_duration", 0)
        eval_count = resp.get("eval_count", 0)
        total_ms = total_ns / 1_000_000
        tps = (eval_count / (total_ms / 1000)) if total_ms > 0 else 0

        return OllamaResponse(
            model=model,
            content=resp.get("response", ""),
            done=resp.get("done", True),
            total_duration_ms=total_ms,
            eval_count=eval_count,
            tokens_per_second=tps,
        )

    def chat(self, messages: list[dict], model: str = "",
             temperature: float = 0.7, max_tokens: int = 2048) -> OllamaResponse:
        """Chat completion (multi-turn)."""
        model = model or DEFAULT_CHAT_MODEL

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        try:
            resp = self._request("/api/chat", data=payload, method="POST",
                                 timeout=120)
        except ConnectionError as e:
            return OllamaResponse(model=model, content=f"Error: {e}", done=False)

        msg = resp.get("message", {})
        total_ns = resp.get("total_duration", 0)
        eval_count = resp.get("eval_count", 0)
        total_ms = total_ns / 1_000_000
        tps = (eval_count / (total_ms / 1000)) if total_ms > 0 else 0

        return OllamaResponse(
            model=model,
            content=msg.get("content", ""),
            done=resp.get("done", True),
            total_duration_ms=total_ms,
            eval_count=eval_count,
            tokens_per_second=tps,
        )

    def embed(self, text: str, model: str = "") -> EmbeddingResult:
        """Generate embeddings for text."""
        model = model or DEFAULT_EMBED_MODEL

        payload = {
            "model": model,
            "input": text,
        }

        try:
            resp = self._request("/api/embed", data=payload, method="POST",
                                 timeout=30)
        except ConnectionError as e:
            logger.error(f"Embedding failed: {e}")
            return EmbeddingResult(model=model)

        embeddings = resp.get("embeddings", [[]])
        vec = embeddings[0] if embeddings else []

        return EmbeddingResult(
            model=model,
            embedding=vec,
            dimensions=len(vec),
        )

    def embed_batch(self, texts: list[str], model: str = "") -> list[EmbeddingResult]:
        """Generate embeddings for multiple texts."""
        model = model or DEFAULT_EMBED_MODEL

        payload = {
            "model": model,
            "input": texts,
        }

        try:
            resp = self._request("/api/embed", data=payload, method="POST",
                                 timeout=60)
        except ConnectionError as e:
            logger.error(f"Batch embedding failed: {e}")
            return [EmbeddingResult(model=model) for _ in texts]

        embeddings = resp.get("embeddings", [])
        results = []
        for vec in embeddings:
            results.append(EmbeddingResult(
                model=model,
                embedding=vec,
                dimensions=len(vec),
            ))
        return results

    def code_generate(self, instruction: str, context: str = "",
                      language: str = "python", model: str = "") -> OllamaResponse:
        """Generate code with specialized prompt."""
        model = model or DEFAULT_CODE_MODEL

        system = f"""You are an expert {language} developer. Generate clean, production-ready code.
Follow best practices. Include type hints and docstrings where appropriate.
Return ONLY the code, no explanations unless asked."""

        prompt = instruction
        if context:
            prompt = f"Context:\n```{language}\n{context}\n```\n\nTask: {instruction}"

        return self.generate(prompt, model=model, system=system, temperature=0.3)

    def status(self) -> dict:
        """Get provider status."""
        available = self.is_available()
        models = self.list_models() if available else []
        return {
            "available": available,
            "host": self.host,
            "port": self.port,
            "base_url": self.base_url,
            "model_count": len(models),
            "models": [
                {
                    "name": m.get("name", ""),
                    "size_gb": round(m.get("size", 0) / 1_073_741_824, 2),
                    "family": m.get("details", {}).get("family", ""),
                    "parameter_size": m.get("details", {}).get("parameter_size", ""),
                }
                for m in models
            ],
            "routes": MODEL_ROUTES,
        }


# ── Singleton ────────────────────────────────────────

_provider: Optional[OllamaProvider] = None


def get_ollama_provider() -> OllamaProvider:
    global _provider
    if _provider is None:
        _provider = OllamaProvider()
    return _provider
