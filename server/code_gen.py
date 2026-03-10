"""
Code Generation Skill — Autonomous Code Builder
=================================================

Provides AI-powered code generation with structured diff output.
Uses the same LLM provider pattern as aim_chat_loop.py.

Features:
  - Generate new files from requirements
  - Modify existing files with targeted edits
  - Multi-file generation in a single pass
  - Auto-debug: parse errors → diagnose → fix
  - SSE streaming of generation progress

Usage:
  from code_gen import run_code_gen_stream, run_auto_debug_stream
"""

import os, json, asyncio, traceback
from pathlib import Path
from typing import AsyncIterator
from datetime import datetime

from providers import get_provider, UnifiedProvider
from filesystem import FileSystemManager

# ── Config ───────────────────────────────────────────

_server_dir = Path(__file__).resolve().parent
CODEGEN_MODEL = os.environ.get("EFL_CODEGEN_MODEL", "gemini-2.5-flash")

# ── LLM Helpers (same pattern as aim_chat_loop) ─────

def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)

def _extract_json_block(text: str) -> dict | None:
    """Parse JSON from LLM response (handles markdown fences)."""
    import re
    # Try raw JSON first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try fenced code block
    m = re.search(r'```(?:json)?\s*\n(.*?)```', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Try first { to last }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    return None

async def _llm_complete(provider: UnifiedProvider, prompt: str, system: str, model: str, timeout: int = 180) -> tuple[str, int]:
    resp = await provider.complete(prompt, system=system, model=model, timeout=timeout)
    if not resp.success:
        raise RuntimeError(resp.error or "LLM call failed")
    tokens = resp.tokens_out if resp.tokens_out else _estimate_tokens(resp.content)
    return resp.content, tokens

async def _llm_json(provider: UnifiedProvider, prompt: str, system: str, model: str, timeout: int = 180) -> tuple[dict, int]:
    content, tokens = await _llm_complete(provider, prompt, "Output only valid JSON. " + system, model, timeout)
    parsed = _extract_json_block(content)
    if not parsed:
        raise RuntimeError(f"Failed to parse JSON: {content[:300]}")
    return parsed, tokens


# ═══════════════════════════════════════════════════════
# SYSTEM PROMPTS
# ═══════════════════════════════════════════════════════

CODEGEN_SYSTEM = """You are an expert code generator for AIM-OS IDE. You produce clean, production-quality code.

When asked to generate or modify code, you respond with a JSON object containing file operations:

{
  "plan": "Brief description of what you're doing and why",
  "operations": [
    {
      "action": "create" | "modify" | "delete",
      "path": "relative/path/to/file.ext",
      "language": "typescript",
      "description": "What this change does",
      "content": "full file content for create, or null for modify/delete",
      "edits": [
        {
          "find": "exact lines to find in original file",
          "replace": "replacement lines"
        }
      ]
    }
  ],
  "dependencies": ["any new packages needed"],
  "next_steps": ["suggested follow-up actions"]
}

Rules:
- For 'create': provide full 'content', edits should be null
- For 'modify': provide 'edits' array with find/replace pairs, content should be null
- For 'delete': both content and edits should be null
- Always use relative paths from the project root
- Include all necessary imports
- Follow existing code style and conventions
- Produce complete, working code — no placeholders or TODOs
"""

DEBUG_SYSTEM = """You are an expert debugger for AIM-OS IDE. You analyze errors and produce fixes.

Given an error message and relevant source code, you:
1. Diagnose the root cause
2. Explain the issue clearly
3. Propose a targeted fix as file operations

Respond with:
{
  "diagnosis": "Clear explanation of what went wrong and why",
  "root_cause": "The specific code or config issue",
  "fix": {
    "plan": "What the fix does",
    "operations": [
      {
        "action": "modify",
        "path": "relative/path/to/file.ext",
        "language": "typescript",
        "description": "What this edit fixes",
        "edits": [
          {
            "find": "exact buggy code",
            "replace": "fixed code"
          }
        ]
      }
    ]
  },
  "prevention": "How to prevent this in the future"
}
"""


# ═══════════════════════════════════════════════════════
# CODE GENERATION PIPELINE
# ═══════════════════════════════════════════════════════

async def run_code_gen_stream(
    prompt: str,
    file_context: dict[str, str] | None = None,
    project_path: str = "",
    conversation: list[dict] | None = None,
) -> AsyncIterator[dict]:
    """
    Generate code based on a prompt and optional file context.
    
    Args:
        prompt: The user's code generation request
        file_context: Dict of {filepath: content} for reference
        project_path: Root path of the project
        conversation: Optional conversation history for context
    
    Yields SSE event dicts:
        {type: "codegen_start", prompt: str}
        {type: "codegen_context", files: int, tokens: int}
        {type: "codegen_thinking", content: str}
        {type: "codegen_plan", plan: str}
        {type: "codegen_operation", index: int, op: dict}
        {type: "codegen_complete", operations: int, tokens: int}
        {type: "codegen_error", error: str}
    """
    total_tokens = 0
    start_time = datetime.now()
    run_id = ""
    
    yield {"type": "codegen_start", "prompt": prompt, "timestamp": start_time.isoformat()}
    
    try:
        provider = get_provider()
        fs = FileSystemManager(project_path) if project_path else None
        
        # ── Phase 1: Build Context ─────────────────────
        context_parts = []
        
        # Add explicit file context
        if file_context:
            for fpath, content in file_context.items():
                lang = _detect_language(fpath)
                context_parts.append(f"### {fpath} ({lang})\n```{lang}\n{content}\n```")
            
            yield {
                "type": "codegen_context",
                "files": len(file_context),
                "tokens": _estimate_tokens("\n".join(context_parts)),
            }
        
        # Use Context Engine for deep project awareness
        project_context = ""
        try:
            from context_engine import get_context_engine
            ctx = get_context_engine(project_path)
            focus = list(file_context.keys()) if file_context else []
            pack = ctx.build_context_pack(
                focus_files=focus,
                search_query=prompt[:80],   # search for related code
                max_tokens=4000,
            )
            project_context = pack.to_prompt()
            yield {
                "type": "codegen_context",
                "files": len(pack.files),
                "tokens": pack.total_tokens,
                "imports": len(pack.imports),
                "search_hits": len(pack.search_results),
            }
        except Exception:
            # Fallback: basic config reading
            if fs:
                try:
                    pkg = fs.read_file("package.json")
                    if pkg:
                        project_context = f"\n### package.json\n```json\n{pkg[:2000]}\n```\n"
                except Exception:
                    pass
        
        # ── Phase 2: Generate Code ─────────────────────
        full_prompt = f"""## User Request
{prompt}

## Project Context
{project_context if project_context else "(No project config found)"}

## Reference Files
{chr(10).join(context_parts) if context_parts else "(No files provided — generate from scratch)"}

## Conversation Context
{json.dumps(conversation[-6:], indent=2) if conversation else "(Fresh request)"}

Generate the code as a JSON response with the operations needed."""

        # Inject learning context from past runs
        try:
            from run_history import get_run_store
            store = get_run_store()
            learning = store.build_learning_context(prompt)
            if learning:
                full_prompt += f"\n\n## Learning from Past Runs\n{learning}"
                yield {"type": "codegen_context", "learning": True, "learning_context_length": len(learning)}
        except Exception:
            pass

        yield {"type": "codegen_thinking", "content": "Analyzing requirements and generating code..."}
        
        result, tokens = await _llm_json(provider, full_prompt, CODEGEN_SYSTEM, CODEGEN_MODEL)
        total_tokens += tokens
        
        # ── Phase 3: Emit Results ──────────────────────
        plan = result.get("plan", "Code generation complete")
        yield {"type": "codegen_plan", "plan": plan}
        
        operations = result.get("operations", [])
        for i, op in enumerate(operations):
            yield {"type": "codegen_operation", "index": i, "op": op}
        
        # ── Phase 4: Summary + Record Run ───────────
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        try:
            from run_history import get_run_store
            store = get_run_store()
            files_list = [op.get("path", "") for op in operations]
            run_id = store.record_run(
                "codegen", prompt, plan,
                files_changed=files_list,
                tokens_used=total_tokens,
                duration_ms=duration_ms,
                model_used=CODEGEN_MODEL,
            )
        except Exception:
            pass

        yield {
            "type": "codegen_complete",
            "operations": len(operations),
            "tokens": total_tokens,
            "dependencies": result.get("dependencies", []),
            "next_steps": result.get("next_steps", []),
            "run_id": run_id,
            "duration_ms": duration_ms,
        }
        
    except Exception as e:
        # Record failed run
        try:
            from run_history import get_run_store
            store = get_run_store()
            run_id = store.record_run("codegen", prompt, "", tokens_used=total_tokens)
            store.score_run(run_id, "failure", error_text=str(e))
        except Exception:
            pass
        yield {"type": "codegen_error", "error": str(e), "trace": traceback.format_exc(), "run_id": run_id}


# ═══════════════════════════════════════════════════════
# AUTO-DEBUG PIPELINE
# ═══════════════════════════════════════════════════════

async def run_auto_debug_stream(
    error_text: str,
    file_context: dict[str, str] | None = None,
    project_path: str = "",
    terminal_output: str = "",
) -> AsyncIterator[dict]:
    """
    Auto-debug: analyze an error, diagnose, and propose a fix.
    
    Yields SSE event dicts:
        {type: "debug_start", error: str}
        {type: "debug_diagnosis", diagnosis: str, root_cause: str}
        {type: "debug_fix", fix: dict}
        {type: "debug_complete", prevention: str}
        {type: "debug_error", error: str}
    """
    
    yield {"type": "debug_start", "error": error_text[:500], "timestamp": datetime.now().isoformat()}
    
    try:
        provider = get_provider()
        
        context_parts = []
        if file_context:
            for fpath, content in file_context.items():
                lang = _detect_language(fpath)
                context_parts.append(f"### {fpath}\n```{lang}\n{content}\n```")
        
        debug_prompt = f"""## Error
```
{error_text}
```

## Terminal Output
```
{terminal_output[:3000] if terminal_output else "(not available)"}
```

## Relevant Source Files
{chr(10).join(context_parts) if context_parts else "(No source files provided)"}

Diagnose the error, explain the root cause, and propose a fix."""

        result, tokens = await _llm_json(provider, debug_prompt, DEBUG_SYSTEM, CODEGEN_MODEL)
        
        diagnosis = result.get("diagnosis", "Unknown error")
        root_cause = result.get("root_cause", "")
        
        yield {
            "type": "debug_diagnosis",
            "diagnosis": diagnosis,
            "root_cause": root_cause,
        }
        
        fix = result.get("fix", {})
        if fix:
            yield {"type": "debug_fix", "fix": fix}
        
        yield {
            "type": "debug_complete",
            "prevention": result.get("prevention", ""),
            "tokens": tokens,
        }
        
    except Exception as e:
        yield {"type": "debug_error", "error": str(e)}


# ═══════════════════════════════════════════════════════
# APPLY OPERATIONS — Write generated code to filesystem
# ═══════════════════════════════════════════════════════

async def apply_operations(
    operations: list[dict],
    project_path: str,
) -> list[dict]:
    """
    Apply code generation operations to the filesystem.
    
    Returns list of result dicts:
      {path: str, action: str, success: bool, error: str|None}
    """
    fs = FileSystemManager(project_path)
    results = []
    
    for op in operations:
        action = op.get("action", "create")
        path = op.get("path", "")
        
        try:
            if action == "create":
                content = op.get("content", "")
                # Ensure parent directories exist
                full_path = fs._safe_path(path)
                full_path.parent.mkdir(parents=True, exist_ok=True)
                fs.write_file(path, content)
                results.append({"path": path, "action": "create", "success": True})
                
            elif action == "modify":
                edits = op.get("edits", [])
                current = fs.read_file(path)
                if current is None:
                    results.append({"path": path, "action": "modify", "success": False, "error": "File not found"})
                    continue
                
                modified = current
                for edit in edits:
                    find = edit.get("find", "")
                    replace = edit.get("replace", "")
                    if find and find in modified:
                        modified = modified.replace(find, replace, 1)
                    else:
                        # Fuzzy match: try stripping whitespace
                        find_stripped = find.strip()
                        lines = modified.split("\n")
                        found = False
                        for i, line in enumerate(lines):
                            if find_stripped in line.strip():
                                lines[i] = replace
                                found = True
                                break
                        if found:
                            modified = "\n".join(lines)
                
                fs.write_file(path, modified)
                results.append({"path": path, "action": "modify", "success": True})
                
            elif action == "delete":
                fs.delete(path)
                results.append({"path": path, "action": "delete", "success": True})
                
        except Exception as e:
            results.append({"path": path, "action": action, "success": False, "error": str(e)})
    
    return results


# ── Utility ──────────────────────────────────────────

LANG_MAP = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.jsx': 'javascript', '.html': 'html', '.css': 'css', '.json': 'json',
    '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.sh': 'bash', '.sql': 'sql', '.rs': 'rust', '.go': 'go',
    '.java': 'java', '.cpp': 'cpp', '.c': 'c', '.h': 'c',
}

def _detect_language(filepath: str) -> str:
    ext = Path(filepath).suffix.lower()
    return LANG_MAP.get(ext, 'text')
