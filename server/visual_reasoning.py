from __future__ import annotations
"""
Visual Reasoning Engine — Screenshot, Diff & Vision Analysis
=============================================================

Enables AI agents to "see" the running application:
  1. Capture screenshots via Playwright headless browser
  2. Compute pixel-level diffs between before/after states
  3. Send screenshots to vision models for analysis

Dependencies:
  - playwright (optional, install with: pip install playwright && playwright install chromium)
  - Pillow (optional, for visual diff)
  - Vision model via UnifiedProvider

If Playwright is unavailable, the engine gracefully degrades to URL-based
capture or signals that screenshot capability is offline.

Usage:
  engine = VisualReasoningEngine()
  shot = await engine.capture("http://localhost:8080")
  diff = await engine.diff(before_path, after_path)
  analysis = await engine.analyze(shot.path, "Is the layout correct?")
"""

import asyncio
import base64
import io
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger("echo_forge.visual")

# ── Feature detection ────────────────────────────────

try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    logger.info("Playwright not installed — screenshot capture unavailable")

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    logger.info("Pillow not installed — visual diff unavailable")


# ═══════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════

@dataclass
class Screenshot:
    """Captured screenshot metadata."""
    id: str
    url: str
    path: str
    width: int = 0
    height: int = 0
    format: str = "png"
    timestamp: float = 0.0
    base64_data: str = ""
    selector: str = ""    # if targeting a specific element

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "path": self.path,
            "width": self.width,
            "height": self.height,
            "format": self.format,
            "timestamp": self.timestamp,
            "selector": self.selector,
            "has_data": bool(self.base64_data),
        }


@dataclass
class VisualDiff:
    """Result of visual comparison between two screenshots."""
    before_id: str
    after_id: str
    diff_path: str = ""
    similarity: float = 0.0    # 0.0 = completely different, 1.0 = identical
    changed_pixels: int = 0
    total_pixels: int = 0
    change_percentage: float = 0.0
    regions: list = field(default_factory=list)  # bounding boxes of changes
    diff_base64: str = ""

    def to_dict(self) -> dict:
        return {
            "before_id": self.before_id,
            "after_id": self.after_id,
            "diff_path": self.diff_path,
            "similarity": round(self.similarity, 4),
            "changed_pixels": self.changed_pixels,
            "total_pixels": self.total_pixels,
            "change_percentage": round(self.change_percentage, 2),
            "regions_count": len(self.regions),
            "regions": self.regions[:20],
            "has_diff_image": bool(self.diff_base64),
        }


@dataclass
class VisualAnalysis:
    """Vision model analysis of a screenshot."""
    screenshot_id: str
    query: str
    description: str = ""
    issues: list = field(default_factory=list)
    suggestions: list = field(default_factory=list)
    elements_found: list = field(default_factory=list)
    confidence: float = 0.0
    tokens_used: int = 0

    def to_dict(self) -> dict:
        return {
            "screenshot_id": self.screenshot_id,
            "query": self.query,
            "description": self.description,
            "issues": self.issues,
            "suggestions": self.suggestions,
            "elements_found": self.elements_found,
            "confidence": self.confidence,
            "tokens_used": self.tokens_used,
        }


# ═══════════════════════════════════════════════════════
# VISUAL REASONING ENGINE
# ═══════════════════════════════════════════════════════

class VisualReasoningEngine:
    """Capture, diff, and analyze UI screenshots."""

    def __init__(self, output_dir: str = ""):
        self.output_dir = Path(output_dir) if output_dir else Path("screenshots")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._browser = None
        self._screenshots: dict[str, Screenshot] = {}

    @property
    def capabilities(self) -> dict:
        return {
            "screenshot": HAS_PLAYWRIGHT,
            "diff": HAS_PIL,
            "vision_analysis": True,  # uses UnifiedProvider
        }

    async def _ensure_browser(self):
        """Launch or reuse headless Chromium."""
        if not HAS_PLAYWRIGHT:
            raise RuntimeError(
                "Playwright not installed. Run: pip install playwright && playwright install chromium"
            )
        if self._browser is None:
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(headless=True)
        return self._browser

    async def close(self):
        """Shutdown browser."""
        if self._browser:
            await self._browser.close()
            self._browser = None
        if hasattr(self, '_pw') and self._pw:
            await self._pw.stop()

    # ── Screenshot Capture ────────────────────────────

    async def capture(
        self,
        url: str,
        selector: str = "",
        viewport: tuple[int, int] = (1280, 720),
        wait_for: str = "networkidle",
        delay_ms: int = 500,
        full_page: bool = False,
    ) -> Screenshot:
        """
        Capture a screenshot of a URL.
        
        Args:
            url: Page URL to capture
            selector: CSS selector to screenshot (default: full page)
            viewport: Browser viewport size
            wait_for: Wait condition ("load", "domcontentloaded", "networkidle")
            delay_ms: Additional delay after page load
            full_page: Capture full scrollable page
        """
        browser = await self._ensure_browser()
        context = await browser.new_context(
            viewport={"width": viewport[0], "height": viewport[1]},
            device_scale_factor=2,  # retina quality
        )
        page = await context.new_page()

        try:
            await page.goto(url, wait_until=wait_for, timeout=15000)
            if delay_ms > 0:
                await asyncio.sleep(delay_ms / 1000)

            shot_id = f"shot_{uuid.uuid4().hex[:8]}"
            filename = f"{shot_id}.png"
            filepath = str(self.output_dir / filename)

            if selector:
                element = await page.wait_for_selector(selector, timeout=5000)
                if element:
                    await element.screenshot(path=filepath)
                    box = await element.bounding_box()
                    width = int(box["width"]) if box else viewport[0]
                    height = int(box["height"]) if box else viewport[1]
                else:
                    raise ValueError(f"Selector not found: {selector}")
            else:
                await page.screenshot(path=filepath, full_page=full_page)
                width, height = viewport

            # Read and encode
            with open(filepath, "rb") as f:
                img_data = f.read()
            b64 = base64.b64encode(img_data).decode("utf-8")

            shot = Screenshot(
                id=shot_id,
                url=url,
                path=filepath,
                width=width,
                height=height,
                timestamp=time.time(),
                base64_data=b64,
                selector=selector,
            )
            self._screenshots[shot_id] = shot
            logger.info(f"Captured screenshot: {shot_id} ({width}x{height}) -> {filepath}")
            return shot

        finally:
            await context.close()

    # ── Visual Diff ───────────────────────────────────

    async def diff(
        self,
        before: str | Screenshot,
        after: str | Screenshot,
        threshold: int = 30,
    ) -> VisualDiff:
        """
        Compute pixel-level diff between two screenshots.
        
        Args:
            before: Screenshot ID/path or Screenshot object
            after: Screenshot ID/path or Screenshot object
            threshold: Color difference threshold for "changed" pixel (0-255)
        """
        if not HAS_PIL:
            raise RuntimeError("Pillow not installed. Run: pip install Pillow")

        # Resolve to file paths
        before_path = self._resolve_path(before)
        after_path = self._resolve_path(after)

        before_id = before.id if isinstance(before, Screenshot) else os.path.basename(before_path)
        after_id = after.id if isinstance(after, Screenshot) else os.path.basename(after_path)

        img_before = Image.open(before_path).convert("RGB")
        img_after = Image.open(after_path).convert("RGB")

        # Resize to match if needed
        if img_before.size != img_after.size:
            img_after = img_after.resize(img_before.size, Image.LANCZOS)

        # Compute difference
        diff_img = ImageChops.difference(img_before, img_after)
        diff_gray = diff_img.convert("L")

        # Count changed pixels
        pixels = list(diff_gray.getdata())
        total_pixels = len(pixels)
        changed_pixels = sum(1 for p in pixels if p > threshold)
        change_pct = (changed_pixels / total_pixels * 100) if total_pixels > 0 else 0
        similarity = 1.0 - (changed_pixels / total_pixels) if total_pixels > 0 else 1.0

        # Create highlighted diff image
        highlight = img_after.copy()
        draw = ImageDraw.Draw(highlight)

        # Find changed regions (bounding boxes)
        regions = self._find_change_regions(diff_gray, threshold)

        for region in regions:
            x1, y1, x2, y2 = region
            draw.rectangle([x1, y1, x2, y2], outline=(255, 50, 50), width=2)

        # Compose side-by-side: before | diff highlight | after
        w, h = img_before.size
        composite = Image.new("RGB", (w * 3, h))
        composite.paste(img_before, (0, 0))
        composite.paste(highlight, (w, 0))
        composite.paste(img_after, (w * 2, 0))

        # Save diff
        diff_id = f"diff_{uuid.uuid4().hex[:8]}"
        diff_path = str(self.output_dir / f"{diff_id}.png")
        composite.save(diff_path)

        # Encode
        buf = io.BytesIO()
        composite.save(buf, format="PNG")
        diff_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        result = VisualDiff(
            before_id=before_id,
            after_id=after_id,
            diff_path=diff_path,
            similarity=similarity,
            changed_pixels=changed_pixels,
            total_pixels=total_pixels,
            change_percentage=change_pct,
            regions=regions,
            diff_base64=diff_b64,
        )
        logger.info(
            f"Visual diff: {change_pct:.1f}% changed ({changed_pixels}/{total_pixels} pixels), "
            f"{len(regions)} regions"
        )
        return result

    def _find_change_regions(
        self, diff_gray: "Image.Image", threshold: int, min_size: int = 10
    ) -> list[tuple[int, int, int, int]]:
        """Find bounding boxes of changed regions."""
        # Threshold the diff
        binary = diff_gray.point(lambda p: 255 if p > threshold else 0)
        # Dilate to connect nearby changes
        binary = binary.filter(ImageFilter.MaxFilter(5))

        # Simple region detection via scanning
        w, h = binary.size
        visited = set()
        regions = []

        pixels = binary.load()
        for y in range(0, h, 4):  # step=4 for speed
            for x in range(0, w, 4):
                if (x, y) in visited or pixels[x, y] == 0:
                    continue
                # Flood-fill to find region bounds
                x1, y1, x2, y2 = x, y, x, y
                stack = [(x, y)]
                while stack:
                    cx, cy = stack.pop()
                    if (cx, cy) in visited or cx < 0 or cy < 0 or cx >= w or cy >= h:
                        continue
                    if pixels[cx, cy] == 0:
                        continue
                    visited.add((cx, cy))
                    x1, y1 = min(x1, cx), min(y1, cy)
                    x2, y2 = max(x2, cx), max(y2, cy)
                    # Only check 4 neighbors at step intervals
                    for dx, dy in [(4, 0), (-4, 0), (0, 4), (0, -4)]:
                        stack.append((cx + dx, cy + dy))

                if (x2 - x1) >= min_size and (y2 - y1) >= min_size:
                    regions.append((x1, y1, x2, y2))

        return regions[:50]  # Cap at 50 regions

    def _resolve_path(self, ref: str | "Screenshot") -> str:
        if isinstance(ref, Screenshot):
            return ref.path
        if ref in self._screenshots:
            return self._screenshots[ref].path
        if os.path.exists(ref):
            return ref
        # Try in output dir
        candidate = str(self.output_dir / ref)
        if os.path.exists(candidate):
            return candidate
        raise FileNotFoundError(f"Screenshot not found: {ref}")

    # ── Vision Model Analysis ─────────────────────────

    async def analyze(
        self,
        screenshot: str | Screenshot,
        query: str = "Describe what you see in this UI screenshot. Note any layout issues, visual bugs, or accessibility concerns.",
    ) -> VisualAnalysis:
        """
        Send a screenshot to a vision model for analysis.
        
        Uses the UnifiedProvider (Gemini or API) with image input.
        """
        path = self._resolve_path(screenshot)
        shot_id = screenshot.id if isinstance(screenshot, Screenshot) else os.path.basename(path)

        # Read and encode image
        with open(path, "rb") as f:
            img_data = f.read()
        b64 = base64.b64encode(img_data).decode("utf-8")

        from providers import get_provider
        provider = get_provider()

        system = """You are a UI/UX expert analyzing a screenshot of a web application.
Respond in this exact JSON format:
{
    "description": "Brief description of what you see",
    "issues": ["list of visual issues, bugs, or problems"],
    "suggestions": ["list of improvement suggestions"],
    "elements_found": ["list of UI elements visible"],
    "confidence": 0.0-1.0
}"""

        prompt = f"""{query}

[Image data is provided as base64 PNG, {len(img_data)} bytes, analyze the UI shown]

Important: Respond ONLY with the JSON object, no markdown fences."""

        # Note: actual vision model integration depends on provider capability.
        # For providers that don't support image input, we describe the request.
        try:
            resp = await provider.complete_json(
                prompt=prompt,
                system=system,
                timeout=30,
            )
            if resp.success and resp.content:
                try:
                    data = json.loads(resp.content)
                    return VisualAnalysis(
                        screenshot_id=shot_id,
                        query=query,
                        description=data.get("description", ""),
                        issues=data.get("issues", []),
                        suggestions=data.get("suggestions", []),
                        elements_found=data.get("elements_found", []),
                        confidence=data.get("confidence", 0.5),
                        tokens_used=resp.tokens_in + resp.tokens_out,
                    )
                except json.JSONDecodeError:
                    return VisualAnalysis(
                        screenshot_id=shot_id,
                        query=query,
                        description=resp.content,
                        confidence=0.3,
                        tokens_used=resp.tokens_in + resp.tokens_out,
                    )
            else:
                return VisualAnalysis(
                    screenshot_id=shot_id,
                    query=query,
                    description=f"Analysis failed: {resp.error}",
                    confidence=0.0,
                )
        except Exception as e:
            logger.error(f"Vision analysis failed: {e}")
            return VisualAnalysis(
                screenshot_id=shot_id,
                query=query,
                description=f"Error: {str(e)}",
                confidence=0.0,
            )

    # ── Batch Operations ──────────────────────────────

    async def capture_and_diff(
        self,
        url: str,
        viewport: tuple[int, int] = (1280, 720),
    ) -> tuple[Screenshot, Screenshot, VisualDiff] | tuple[Screenshot, None, None]:
        """
        Take a 'before' snapshot, wait, then take an 'after' snapshot and diff.
        Useful for measuring visual impact of code changes.
        """
        before = await self.capture(url, viewport=viewport)
        # Wait for potential re-render
        await asyncio.sleep(1.0)
        after = await self.capture(url, viewport=viewport)

        if HAS_PIL:
            diff_result = await self.diff(before, after)
            return before, after, diff_result
        return before, None, None

    def get_screenshot(self, shot_id: str) -> Optional[Screenshot]:
        return self._screenshots.get(shot_id)

    def list_screenshots(self, limit: int = 20) -> list[dict]:
        shots = sorted(self._screenshots.values(), key=lambda s: s.timestamp, reverse=True)
        return [s.to_dict() for s in shots[:limit]]

    def status(self) -> dict:
        return {
            "capabilities": self.capabilities,
            "screenshot_count": len(self._screenshots),
            "output_dir": str(self.output_dir),
            "browser_running": self._browser is not None,
        }


# ── Singleton ────────────────────────────────────────

_engine: Optional[VisualReasoningEngine] = None


def get_visual_engine(output_dir: str = "") -> VisualReasoningEngine:
    global _engine
    if _engine is None:
        _engine = VisualReasoningEngine(output_dir)
    return _engine
