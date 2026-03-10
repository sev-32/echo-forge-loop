"""
Echo Forge Loop — Multi-Provider Wrapper
==========================================

Provides a unified LLM interface that supports:
  1. GeminiCLIProvider (primary, $0 cost via Ultra subscription)
  2. APIProvider (fallback, supports OpenAI/Gemini/Anthropic/DeepSeek)

Both providers are auto-detected and the healthiest available is selected.
The wrapper normalizes streaming to async for the pipeline.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger('echo_forge.provider')

# ── Provider Import ──────────────────────────────────────
_server_dir = Path(__file__).resolve().parent
_repo_root = _server_dir.parent.parent  # echo-forge-loop -> AIM-OS
_providers_dir = _repo_root / "scripts" / "ai_engine" / "providers"
if _providers_dir.exists() and str(_providers_dir) not in sys.path:
    sys.path.insert(0, str(_providers_dir))

# Try importing providers
try:
    from gemini_cli_provider import GeminiCLIProvider, OutputFormat, StreamChunk, ProviderResponse
    HAS_GEMINI_CLI = True
except ImportError:
    HAS_GEMINI_CLI = False
    # Minimal stubs
    class StreamChunk:
        def __init__(self, text='', done=False, error=''):
            self.text = text
            self.done = done
            self.error = error

    class ProviderResponse:
        def __init__(self, success=False, content='', error='', tokens_in=0, tokens_out=0, **kw):
            self.success = success
            self.content = content
            self.error = error
            self.tokens_in = tokens_in
            self.tokens_out = tokens_out

    class OutputFormat:
        TEXT = 'text'
        JSON = 'json'

try:
    from api_provider import APIProvider, VaultKeyManager
    HAS_API = True
except ImportError:
    HAS_API = False


# ── Provider Mode ────────────────────────────────────────
PROVIDER_MODE = os.environ.get("EFL_PROVIDER", "auto").lower()
# "auto" — try GeminiCLI first, fall back to API
# "cli"  — force GeminiCLI only
# "api"  — force API only

API_PROVIDER_NAME = os.environ.get("EFL_API_PROVIDER", "gemini")  # openai, gemini, anthropic, deepseek
API_MODEL = os.environ.get("EFL_API_MODEL", "")  # model override for API


class UnifiedProvider:
    """
    Unified LLM provider for Echo Forge Loop.

    Normalizes both GeminiCLI (async) and APIProvider (sync) into
    a consistent async interface for the pipeline.
    """

    def __init__(self):
        self._cli_provider = None
        self._api_provider = None
        self._active_provider = None
        self._provider_name = "none"

        # Initialize GeminiCLI
        if HAS_GEMINI_CLI and PROVIDER_MODE in ("auto", "cli"):
            try:
                self._cli_provider = GeminiCLIProvider(allowed_mcp_servers=["none"])
                if self._cli_provider.is_available:
                    self._active_provider = "cli"
                    self._provider_name = "gemini-cli"
                    logger.info("GeminiCLI provider initialized successfully")
                else:
                    logger.warning("GeminiCLI binary not found on PATH")
            except Exception as e:
                logger.warning(f"GeminiCLI init failed: {e}")

        # Initialize API provider
        if HAS_API and PROVIDER_MODE in ("auto", "api"):
            try:
                vault = VaultKeyManager()
                self._api_provider = APIProvider(vault=vault)
                if not self._active_provider:
                    self._active_provider = "api"
                    self._provider_name = f"api:{API_PROVIDER_NAME}"
                    logger.info(f"API provider initialized ({API_PROVIDER_NAME})")
            except Exception as e:
                logger.warning(f"API provider init failed: {e}")

        if not self._active_provider:
            logger.error("No LLM provider available!")

    @property
    def is_available(self) -> bool:
        return self._active_provider is not None

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def status(self) -> dict:
        """Return provider status for health endpoint."""
        return {
            "active_provider": self._active_provider,
            "provider_name": self._provider_name,
            "cli_available": bool(self._cli_provider and self._cli_provider.is_available),
            "api_available": bool(self._api_provider),
            "mode": PROVIDER_MODE,
        }

    async def complete(
        self,
        prompt: str,
        system: str = '',
        model: str = '',
        timeout: int = 120,
    ) -> ProviderResponse:
        """Complete a prompt and return a ProviderResponse."""

        # Try CLI first
        if self._active_provider == "cli" or (self._active_provider == "api" and not self._cli_provider):
            pass  # fall through to provider selection

        if self._cli_provider and self._cli_provider.is_available and self._active_provider in ("cli", None):
            try:
                resp = await asyncio.to_thread(
                    self._cli_provider.complete,
                    prompt, system=system, model=model,
                    timeout=timeout, output_format=OutputFormat.TEXT,
                )
                if resp.success:
                    return resp
                else:
                    logger.warning(f"CLI complete failed: {resp.error}, trying API fallback")
            except Exception as e:
                logger.warning(f"CLI complete error: {e}, trying API fallback")

        # API fallback
        if self._api_provider:
            try:
                api_model = API_MODEL or model or ""
                resp = await asyncio.to_thread(
                    self._api_provider.complete,
                    prompt, system=system, model=api_model,
                    provider_name=API_PROVIDER_NAME, timeout=timeout,
                )
                return resp
            except Exception as e:
                return ProviderResponse(success=False, error=f"API provider failed: {e}")

        return ProviderResponse(success=False, error="No LLM provider available")

    async def complete_json(
        self,
        prompt: str,
        system: str = '',
        model: str = '',
        timeout: int = 120,
    ) -> ProviderResponse:
        """Complete with JSON-optimized system prompt."""
        json_system = "Output only valid JSON. " + system
        return await self.complete(prompt, system=json_system, model=model, timeout=timeout)

    async def stream(
        self,
        prompt: str,
        system: str = '',
        model: str = '',
        timeout: int = 180,
    ) -> AsyncIterator[StreamChunk]:
        """Stream response as async iterator of StreamChunks."""

        # GeminiCLI streaming (already async)
        if self._cli_provider and self._cli_provider.is_available and self._active_provider in ("cli", None):
            try:
                async for chunk in self._cli_provider.stream(
                    prompt, system=system, model=model, timeout=timeout,
                ):
                    yield chunk
                return
            except Exception as e:
                logger.warning(f"CLI stream error: {e}, trying API fallback")
                yield StreamChunk(error=f"CLI stream failed: {e}")

        # API streaming (sync → async wrapper)
        if self._api_provider:
            try:
                api_model = API_MODEL or model or ""

                def _sync_stream():
                    return list(self._api_provider.stream(
                        prompt, system=system, model=api_model,
                        provider_name=API_PROVIDER_NAME,
                    ))

                chunks = await asyncio.to_thread(_sync_stream)
                for chunk in chunks:
                    yield StreamChunk(text=chunk.text, done=chunk.done, error=chunk.error if hasattr(chunk, 'error') else '')
                return
            except Exception as e:
                yield StreamChunk(error=f"API stream failed: {e}", done=True)
                return

        # No provider available — fall back to complete()
        logger.warning("No streaming provider. Falling back to complete()")
        resp = await self.complete(prompt, system=system, model=model, timeout=timeout)
        if resp.success:
            # Simulate streaming by yielding content in chunks
            content = resp.content
            chunk_size = 100
            for i in range(0, len(content), chunk_size):
                yield StreamChunk(text=content[i:i+chunk_size])
                await asyncio.sleep(0.01)
            yield StreamChunk(done=True)
        else:
            yield StreamChunk(error=resp.error, done=True)


# ── Singleton ────────────────────────────────────────────
_provider_instance: Optional[UnifiedProvider] = None


def get_provider() -> UnifiedProvider:
    """Get or create the singleton provider instance."""
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = UnifiedProvider()
    return _provider_instance
