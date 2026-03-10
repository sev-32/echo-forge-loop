"""
Echo Forge Loop — Production Server
=====================================

FastAPI server exposing the AIM-OS 9-phase cognition pipeline as SSE,
plus IDE capabilities: file system, terminal, and skill endpoints.

Usage:
  cd server
  pip install -r requirements.txt
  python main.py

Or:
  uvicorn main:app --host 0.0.0.0 --port 5002
"""
import json
import os
import sys
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from aim_chat_loop import run_aim_chat_stream

# ── App Setup ────────────────────────────────────────
app = FastAPI(
    title="Echo Forge Loop",
    description="AIM-OS AI IDE — 9-Phase Cognition Pipeline + IDE",
    version="2.0.0",
)

# CORS — allow the Vite dev server and any other origin
ALLOWED_ORIGINS = os.environ.get("EFL_CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ──────────────────────────────────────────
def _last_user_message(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content")
            return content if isinstance(content, str) else ""
    return ""


# ══════════════════════════════════════════════════════
# CHAT PIPELINE
# ══════════════════════════════════════════════════════

@app.post("/chat")
@app.post("/functions/v1/aim-chat")
async def chat(request: Request):
    """Streaming chat endpoint — full 9-phase AIM-OS pipeline via SSE."""
    try:
        body = await request.json()
        messages = body.get("messages") or []
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    last_msg = _last_user_message(messages)
    if not last_msg.strip():
        return JSONResponse({"error": "No user message in messages"}, status_code=400)

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for chunk in run_aim_chat_stream(last_msg, messages):
                yield f"data: {json.dumps(chunk)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
def health():
    """Health check endpoint."""
    from providers import get_provider
    provider = get_provider()
    return {
        "status": "ok",
        "service": "echo-forge-ide",
        "version": "2.0.0",
        "pipeline": "9-phase (memory → plan → execute → verify → retry → audit → synthesize → reflect → evolve)",
        "provider": provider.status(),
        "skills": ["deep-research", "chat", "file-system", "terminal"],
        "ide": True,
    }


@app.get("/memory/stats")
def memory_stats():
    """Return current memory statistics."""
    from aim_chat_loop import load_memory
    mem = load_memory()
    return {
        "reflections": len(mem["reflections"]),
        "rules": len(mem["rules"]),
        "knowledge": len(mem["knowledge"]),
    }


# ══════════════════════════════════════════════════════
# DEEP RESEARCH SKILL
# ══════════════════════════════════════════════════════

@app.post("/research")
@app.post("/functions/v1/deep-research")
async def deep_research(request: Request):
    """Deep research endpoint — multi-phase research pipeline via SSE."""
    from skills.deep_research import run_deep_research

    try:
        body = await request.json()
        query = body.get("query", "")
        depth = body.get("depth", "standard")
        run_id = body.get("run_id")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if not query.strip():
        return JSONResponse({"error": "No research query provided"}, status_code=400)

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for chunk in run_deep_research(query, depth=depth, run_id=run_id):
                yield f"data: {json.dumps(chunk, default=str)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ══════════════════════════════════════════════════════
# EVOLUTION ENGINE
# ══════════════════════════════════════════════════════

@app.get("/evolution/status")
def evolution_status():
    """Full evolution engine status."""
    from evolution import get_evolution_engine
    return get_evolution_engine().full_status()


# ══════════════════════════════════════════════════════
# IDE — FILE SYSTEM API
# ══════════════════════════════════════════════════════

@app.get("/files/tree")
def file_tree(path: str = "", depth: int = 4):
    """Get the project file tree."""
    from filesystem import get_filesystem
    try:
        fs = get_filesystem()
        return fs.get_tree(path, max_depth=depth)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/files/read")
def file_read(path: str):
    """Read a file's content."""
    from filesystem import get_filesystem
    try:
        return get_filesystem().read_file(path)
    except FileNotFoundError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.post("/files/write")
async def file_write(request: Request):
    """Write content to a file."""
    from filesystem import get_filesystem
    try:
        body = await request.json()
        path = body.get("path", "")
        content = body.get("content", "")
        return get_filesystem().write_file(path, content)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.delete("/files/delete")
def file_delete(path: str):
    """Delete a file or empty directory."""
    from filesystem import get_filesystem
    try:
        return get_filesystem().delete_file(path)
    except FileNotFoundError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.post("/files/rename")
async def file_rename(request: Request):
    """Rename/move a file."""
    from filesystem import get_filesystem
    try:
        body = await request.json()
        return get_filesystem().rename(
            body.get("old_path", ""),
            body.get("new_path", ""),
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/files/search")
def file_search(q: str, limit: int = 50):
    """Search files by name."""
    from filesystem import get_filesystem
    return get_filesystem().search_files(q, max_results=limit)


@app.post("/files/mkdir")
async def file_mkdir(request: Request):
    """Create a directory."""
    from filesystem import get_filesystem
    try:
        body = await request.json()
        return get_filesystem().create_directory(body.get("path", ""))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# ══════════════════════════════════════════════════════
# IDE — TERMINAL API
# ══════════════════════════════════════════════════════

@app.post("/terminal/create")
async def terminal_create(request: Request):
    """Create a new terminal session."""
    from terminal import get_terminal_manager
    try:
        body = await request.json() if await request.body() else {}
        cwd = body.get("cwd")
        tm = get_terminal_manager()
        session = await tm.create_session(cwd=cwd)
        return {
            "session_id": session.session_id,
            "cwd": session.cwd,
            "shell": session.shell,
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.post("/terminal/execute")
async def terminal_execute(request: Request):
    """Execute a command in a terminal session."""
    from terminal import get_terminal_manager
    try:
        body = await request.json()
        session_id = body.get("session_id", "")
        command = body.get("command", "")
        timeout = body.get("timeout", 30)
        tm = get_terminal_manager()
        return await tm.execute_command(session_id, command, timeout=timeout)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.post("/terminal/stream")
async def terminal_stream(request: Request):
    """Stream a command's output via SSE."""
    from terminal import get_terminal_manager
    try:
        body = await request.json()
        session_id = body.get("session_id", "")
        command = body.get("command", "")
        tm = get_terminal_manager()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    async def event_stream():
        async for chunk in tm.stream_command(session_id, command):
            yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/terminal/sessions")
def terminal_sessions():
    """List all terminal sessions."""
    from terminal import get_terminal_manager
    return get_terminal_manager().list_sessions()


@app.delete("/terminal/{session_id}")
def terminal_close(session_id: str):
    """Close a terminal session."""
    from terminal import get_terminal_manager
    closed = get_terminal_manager().close_session(session_id)
    return {"session_id": session_id, "closed": closed}


# ══════════════════════════════════════════════════════
# IDE — CODE GENERATION & AUTO-DEBUG
# ══════════════════════════════════════════════════════

@app.post("/ide/generate")
async def ide_generate(request: Request):
    """Generate code from a prompt + optional file context. Streams SSE."""
    try:
        body = await request.json()
        prompt = body.get("prompt", "")
        file_context = body.get("file_context", {})
        project_path = body.get("project_path", "")
        conversation = body.get("conversation", [])
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if not prompt.strip():
        return JSONResponse({"error": "No prompt provided"}, status_code=400)

    from code_gen import run_code_gen_stream

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for chunk in run_code_gen_stream(prompt, file_context, project_path, conversation):
                yield f"data: {json.dumps(chunk)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'codegen_error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.post("/ide/debug")
async def ide_debug(request: Request):
    """Auto-debug: analyze error, diagnose, propose fix. Streams SSE."""
    try:
        body = await request.json()
        error_text = body.get("error", "")
        file_context = body.get("file_context", {})
        project_path = body.get("project_path", "")
        terminal_output = body.get("terminal_output", "")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if not error_text.strip():
        return JSONResponse({"error": "No error text provided"}, status_code=400)

    from code_gen import run_auto_debug_stream

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for chunk in run_auto_debug_stream(error_text, file_context, project_path, terminal_output):
                yield f"data: {json.dumps(chunk)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'debug_error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.post("/ide/apply")
async def ide_apply(request: Request):
    """Apply generated code operations to the filesystem."""
    try:
        body = await request.json()
        operations = body.get("operations", [])
        project_path = body.get("project_path", "")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if not operations:
        return JSONResponse({"error": "No operations provided"}, status_code=400)

    from code_gen import apply_operations
    results = await apply_operations(operations, project_path)
    applied = sum(1 for r in results if r.get("success"))

    # Auto-snapshot: create a git commit for provenance tracking
    snapshot_info = None
    if applied > 0:
        try:
            from git_ops import get_git_manager
            gm = get_git_manager(project_path)
            desc = body.get("description", f"{applied} file(s) generated")
            snapshot_info = gm.snapshot(
                f"codegen: {desc}",
                metadata={
                    "type": "codegen_apply",
                    "files_applied": applied,
                    "prompt": body.get("prompt", "")[:200],
                    "timestamp": __import__("datetime").datetime.now().isoformat(),
                },
            )
        except Exception:
            pass  # Git not available — continue without snapshot

    return {
        "results": results,
        "applied": applied,
        "snapshot": snapshot_info,
    }


# ══════════════════════════════════════════════════════
# IDE — GIT / CODE STATE SNAPSHOTS
# ══════════════════════════════════════════════════════

@app.get("/ide/git/status")
async def git_status(project_path: str = ""):
    """Get git status for the project."""
    from git_ops import get_git_manager
    gm = get_git_manager(project_path)
    return gm.status()


@app.get("/ide/git/log")
async def git_log(limit: int = 20, project_path: str = ""):
    """Get git commit history with AIM-OS metadata."""
    from git_ops import get_git_manager
    gm = get_git_manager(project_path)
    return {"commits": gm.log(limit=limit)}


@app.get("/ide/git/diff")
async def git_diff(from_ref: str = "HEAD~1", to_ref: str = "HEAD", project_path: str = ""):
    """Get diff between two refs."""
    from git_ops import get_git_manager
    gm = get_git_manager(project_path)
    return gm.diff(from_ref, to_ref)


@app.post("/ide/git/snapshot")
async def git_snapshot(request: Request):
    """Create a manual code state snapshot."""
    try:
        body = await request.json()
        message = body.get("message", "manual snapshot")
        metadata = body.get("metadata", {})
        tag = body.get("tag")
        project_path = body.get("project_path", "")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    from git_ops import get_git_manager
    gm = get_git_manager(project_path)
    return gm.snapshot(message, metadata=metadata, tag=tag)


@app.get("/ide/git/branches")
async def git_branches(project_path: str = ""):
    """List git branches."""
    from git_ops import get_git_manager
    gm = get_git_manager(project_path)
    return {"branches": gm.branches()}


@app.get("/ide/git/file-history")
async def git_file_history(filepath: str, limit: int = 10, project_path: str = ""):
    """Get commit history for a specific file."""
    from git_ops import get_git_manager
    gm = get_git_manager(project_path)
    return {"history": gm.file_history(filepath, limit=limit)}


# ══════════════════════════════════════════════════════
# IDE — CONTEXT ENGINE
# ══════════════════════════════════════════════════════

@app.get("/ide/context/profile")
async def context_profile(project_path: str = ""):
    """Get auto-detected project profile."""
    from context_engine import get_context_engine
    ctx = get_context_engine(project_path)
    profile = ctx.detect_project()
    return profile.to_dict()


@app.get("/ide/context/dependencies")
async def context_dependencies(project_path: str = ""):
    """Get import dependency map."""
    from context_engine import get_context_engine
    ctx = get_context_engine(project_path)
    return ctx.build_dependency_map()


@app.get("/ide/context/search")
async def context_search(query: str, max_results: int = 20, project_path: str = ""):
    """Semantic code search across workspace."""
    from context_engine import get_context_engine
    ctx = get_context_engine(project_path)
    hits = ctx.search(query, max_results=max_results)
    return {
        "query": query,
        "results": [
            {
                "filepath": h.filepath,
                "line": h.line_number,
                "content": h.line_content,
                "context_before": h.context_before,
                "context_after": h.context_after,
            }
            for h in hits
        ],
        "total": len(hits),
    }


@app.post("/ide/context/pack")
async def context_pack(request: Request):
    """Build a token-optimized context pack for LLM prompts."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    focus_files = body.get("focus_files", [])
    search_query = body.get("search_query", "")
    max_tokens = body.get("max_tokens", 8000)
    project_path = body.get("project_path", "")

    from context_engine import get_context_engine
    ctx = get_context_engine(project_path)
    pack = ctx.build_context_pack(focus_files, search_query, max_tokens)
    return {
        "prompt": pack.to_prompt(),
        "total_tokens": pack.total_tokens,
        "budget_used": round(pack.budget_used, 2),
        "files_included": list(pack.files.keys()),
        "imports_found": len(pack.imports),
        "search_hits": len(pack.search_results),
    }


# ══════════════════════════════════════════════════════
# IDE — DIAGNOSTICS (Built-in Console + Smart Analysis)
# ══════════════════════════════════════════════════════

import logging, collections

# In-memory log buffer for built-in diagnostics
_log_buffer: collections.deque = collections.deque(maxlen=500)
_diag_listeners: list = []

class IDELogHandler(logging.Handler):
    """Captures Python logs into the IDE diagnostics system."""
    def emit(self, record):
        entry = {
            "timestamp": self.format(record).split(" ")[0] if hasattr(record, 'created') else "",
            "level": record.levelname,
            "source": record.name,
            "message": record.getMessage(),
            "file": getattr(record, 'pathname', ''),
            "line": getattr(record, 'lineno', 0),
        }
        _log_buffer.append(entry)
        for listener in _diag_listeners[:]:
            try:
                listener(entry)
            except Exception:
                _diag_listeners.remove(listener)

# Install the handler
_ide_handler = IDELogHandler()
_ide_handler.setLevel(logging.DEBUG)
logging.getLogger().addHandler(_ide_handler)


@app.get("/ide/diagnostics")
async def get_diagnostics(
    limit: int = 100,
    level: str = "",
    source: str = "",
    project_path: str = "",
):
    """Get diagnostic logs with optional filtering."""
    logs = list(_log_buffer)

    if level:
        logs = [l for l in logs if l["level"].lower() == level.lower()]
    if source:
        logs = [l for l in logs if source.lower() in l["source"].lower()]

    logs = logs[-limit:]

    # Severity summary
    levels = collections.Counter(l["level"] for l in list(_log_buffer))

    # Project-specific diagnostics
    custom_diag = []
    if project_path:
        from context_engine import get_context_engine
        ctx = get_context_engine(project_path)
        profile = ctx.detect_project()
        if profile.framework == "react":
            custom_diag.append({
                "type": "react", "checks": [
                    "Component render errors", "Hook dependency warnings",
                    "PropType mismatches", "Key warnings in lists",
                ]
            })
        elif profile.framework == "fastapi":
            custom_diag.append({
                "type": "fastapi", "checks": [
                    "Endpoint response validation", "CORS configuration",
                    "Dependency injection errors", "Schema validation failures",
                ]
            })

    return {
        "logs": logs,
        "summary": dict(levels),
        "total": len(list(_log_buffer)),
        "custom_diagnostics": custom_diag,
    }


@app.get("/ide/diagnostics/stream")
async def diagnostics_stream():
    """Stream diagnostics in real-time via SSE."""
    import asyncio

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()

        def on_log(entry):
            try:
                queue.put_nowait(entry)
            except Exception:
                pass

        _diag_listeners.append(on_log)
        try:
            while True:
                try:
                    entry = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(entry)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        finally:
            if on_log in _diag_listeners:
                _diag_listeners.remove(on_log)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ══════════════════════════════════════════════════════
# IDE — RUN HISTORY + LEARNING
# ══════════════════════════════════════════════════════

@app.get("/ide/runs")
async def list_runs(
    limit: int = 50,
    type: str = "",
    outcome: str = "",
    since: str = "",
):
    """List run history with optional filtering."""
    from run_history import get_run_store
    store = get_run_store()
    runs = store.get_runs(limit=limit, run_type=type, outcome=outcome, since=since)
    return {"runs": runs, "total": len(runs)}


@app.get("/ide/runs/stats")
async def run_stats():
    """Get aggregate run statistics."""
    from run_history import get_run_store
    return get_run_store().get_stats()


@app.get("/ide/runs/{run_id}")
async def get_run(run_id: str):
    """Get a single run with its event timeline."""
    from run_history import get_run_store
    run = get_run_store().get_run(run_id)
    if not run:
        return {"error": "Run not found"}, 404
    return run


@app.post("/ide/runs/{run_id}/score")
async def score_run(run_id: str, request: Request):
    """Score a run's effectiveness."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    from run_history import get_run_store
    store = get_run_store()
    store.score_run(
        run_id,
        outcome=body.get("outcome", "success"),
        score=body.get("score", 0.0),
        user_feedback=body.get("feedback", ""),
        error_text=body.get("error", ""),
    )
    return {"ok": True, "run_id": run_id}


@app.get("/ide/runs/similar/{prompt}")
async def similar_runs(prompt: str, limit: int = 5):
    """Find runs with similar prompts."""
    from run_history import get_run_store
    runs = get_run_store().get_similar_runs(prompt, limit=limit)
    return {"runs": runs, "total": len(runs)}


@app.get("/ide/runs/learning-context")
async def learning_context(prompt: str = "", project_type: str = ""):
    """Get learning context for a new run."""
    from run_history import get_run_store
    ctx = get_run_store().build_learning_context(prompt, project_type)
    return {"context": ctx, "has_data": bool(ctx)}


# ══════════════════════════════════════════════════════
# IDE — AUTONOMOUS LOOP
# ══════════════════════════════════════════════════════

@app.post("/ide/autonomous/start")
async def autonomous_start(request: Request):
    """Start an autonomous build loop. Streams SSE events."""
    try:
        body = await request.json()
        prompt = body.get("prompt", "")
        file_context = body.get("file_context", {})
        project_path = body.get("project_path", "")
        max_retries = body.get("max_retries", 3)
        conversation = body.get("conversation", [])
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    if not prompt:
        return JSONResponse({"error": "No prompt provided"}, status_code=400)

    from autonomous_loop import get_loop_manager
    mgr = get_loop_manager()

    if mgr.is_running:
        return JSONResponse({"error": "A loop is already running"}, status_code=409)

    loop = mgr.start(project_path=project_path, max_retries=max_retries)

    async def event_stream():
        try:
            async for evt in loop.run(
                prompt=prompt,
                file_context=file_context,
                conversation=conversation,
            ):
                yield f"data: {json.dumps(evt)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'loop_error', 'error': str(e)})}\n\n"
        finally:
            mgr.finish()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/ide/autonomous/status")
async def autonomous_status():
    """Get current autonomous loop status."""
    from autonomous_loop import get_loop_manager
    return get_loop_manager().status()


@app.post("/ide/autonomous/cancel")
async def autonomous_cancel():
    """Cancel the running autonomous loop."""
    from autonomous_loop import get_loop_manager
    mgr = get_loop_manager()
    mgr.cancel()
    return {"ok": True, "cancelled": True}


@app.get("/ide/autonomous/history")
async def autonomous_history(limit: int = 10):
    """Get autonomous loop run history."""
    from autonomous_loop import get_loop_manager
    return {"history": get_loop_manager().history(limit=limit)}


# ══════════════════════════════════════════════════════
# IDE — VERIFICATION ENGINE
# ══════════════════════════════════════════════════════

@app.post("/ide/verify")
async def ide_verify(request: Request):
    """Run verification checks (typecheck, lint, build, test)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    project_path = body.get("project_path", "")
    steps = body.get("steps", None)

    from verification_engine import get_verification_engine
    engine = get_verification_engine(project_path)
    report = await engine.verify(steps=steps)
    return report.to_dict()


@app.get("/ide/verify/project-type")
async def verify_project_type(project_path: str = ""):
    """Detect project type and available verification steps."""
    from verification_engine import get_verification_engine
    engine = get_verification_engine(project_path)
    ptype = engine.detect_project_type()
    commands = engine.get_available_commands(ptype)
    return {
        "project_type": ptype,
        "commands": commands,
    }


@app.get("/ide/runs/patterns")
async def run_patterns(limit: int = 10):
    """Extract learned patterns from run history."""
    from run_history import get_run_store
    return get_run_store().learn_patterns(limit=limit)


# ══════════════════════════════════════════════════════
# IDE — VISUAL REASONING
# ══════════════════════════════════════════════════════

@app.post("/ide/visual/capture")
async def visual_capture(request: Request):
    """Capture a screenshot of a URL."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    url = body.get("url", "http://localhost:8080")
    selector = body.get("selector", "")
    viewport = body.get("viewport", [1280, 720])
    full_page = body.get("full_page", False)

    from visual_reasoning import get_visual_engine
    engine = get_visual_engine()

    if not engine.capabilities["screenshot"]:
        return JSONResponse({
            "error": "Playwright not installed. Run: pip install playwright && playwright install chromium",
            "capabilities": engine.capabilities,
        }, status_code=503)

    try:
        shot = await engine.capture(
            url=url,
            selector=selector,
            viewport=tuple(viewport),
            full_page=full_page,
        )
        return shot.to_dict()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/ide/visual/diff")
async def visual_diff(request: Request):
    """Compute visual diff between two screenshots."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid request"}, status_code=400)

    before = body.get("before", "")
    after = body.get("after", "")
    threshold = body.get("threshold", 30)

    if not before or not after:
        return JSONResponse({"error": "Both 'before' and 'after' required"}, status_code=400)

    from visual_reasoning import get_visual_engine
    engine = get_visual_engine()

    if not engine.capabilities["diff"]:
        return JSONResponse({
            "error": "Pillow not installed. Run: pip install Pillow",
        }, status_code=503)

    try:
        result = await engine.diff(before, after, threshold=threshold)
        return result.to_dict()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/ide/visual/analyze")
async def visual_analyze(request: Request):
    """Analyze a screenshot with vision model."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid request"}, status_code=400)

    screenshot = body.get("screenshot", "")
    query = body.get("query", "Describe this UI and identify any issues.")

    if not screenshot:
        return JSONResponse({"error": "Screenshot ID or path required"}, status_code=400)

    from visual_reasoning import get_visual_engine
    engine = get_visual_engine()

    try:
        analysis = await engine.analyze(screenshot, query)
        return analysis.to_dict()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/ide/visual/screenshots")
async def visual_list(limit: int = 20):
    """List captured screenshots."""
    from visual_reasoning import get_visual_engine
    return {"screenshots": get_visual_engine().list_screenshots(limit)}


@app.get("/ide/visual/screenshot/{shot_id}")
async def visual_get(shot_id: str):
    """Get screenshot by ID (includes base64 data)."""
    from visual_reasoning import get_visual_engine
    engine = get_visual_engine()
    shot = engine.get_screenshot(shot_id)
    if not shot:
        return JSONResponse({"error": "Screenshot not found"}, status_code=404)
    return {
        **shot.to_dict(),
        "base64": shot.base64_data,
    }


@app.get("/ide/visual/status")
async def visual_status():
    """Get visual reasoning engine capabilities."""
    from visual_reasoning import get_visual_engine
    return get_visual_engine().status()


# ══════════════════════════════════════════════════════
# IDE — AST ANALYSIS & SEMANTIC SEARCH
# ══════════════════════════════════════════════════════

@app.get("/ide/ast/symbols")
async def ast_symbols(file: str = ""):
    """Extract symbols from a specific file."""
    if not file:
        return JSONResponse({"error": "File path required"}, status_code=400)
    from ast_analyzer import get_ast_analyzer
    from filesystem import DEFAULT_PROJECT_ROOT
    analyzer = get_ast_analyzer(str(DEFAULT_PROJECT_ROOT))
    result = analyzer.extract_symbols(file)
    return result.to_dict()


@app.get("/ide/ast/scan")
async def ast_scan(max_files: int = 200):
    """Scan entire project for symbols."""
    from ast_analyzer import get_ast_analyzer
    from filesystem import DEFAULT_PROJECT_ROOT
    analyzer = get_ast_analyzer(str(DEFAULT_PROJECT_ROOT))
    files = analyzer.scan_project(max_files)
    return {
        "file_count": len(files),
        "total_functions": sum(f.total_functions for f in files),
        "total_classes": sum(f.total_classes for f in files),
        "total_symbols": sum(len(f.symbols) for f in files),
        "files": [
            {
                "path": f.filepath,
                "language": f.language,
                "functions": f.total_functions,
                "classes": f.total_classes,
                "lines": f.total_lines,
            }
            for f in sorted(files, key=lambda x: x.total_lines, reverse=True)
        ],
    }


@app.get("/ide/ast/dependencies")
async def ast_dependencies():
    """Build dependency graph for the project."""
    from ast_analyzer import get_ast_analyzer
    from filesystem import DEFAULT_PROJECT_ROOT
    analyzer = get_ast_analyzer(str(DEFAULT_PROJECT_ROOT))
    edges = analyzer.build_dependency_graph()
    return {
        "edge_count": len(edges),
        "edges": [e.to_dict() for e in edges],
    }


@app.get("/ide/ast/skeleton")
async def ast_skeleton():
    """Generate compact project skeleton."""
    from ast_analyzer import get_ast_analyzer
    from filesystem import DEFAULT_PROJECT_ROOT
    analyzer = get_ast_analyzer(str(DEFAULT_PROJECT_ROOT))
    skeleton = analyzer.generate_skeleton()
    return skeleton.to_dict()


@app.get("/ide/search")
async def semantic_search_endpoint(q: str = "", max_results: int = 20):
    """Search codebase with natural language query."""
    if not q:
        return JSONResponse({"error": "Query parameter 'q' required"}, status_code=400)
    from semantic_search import get_semantic_search
    from filesystem import DEFAULT_PROJECT_ROOT
    search = get_semantic_search(str(DEFAULT_PROJECT_ROOT))
    hits = search.search(q, max_results=max_results)
    return {
        "query": q,
        "result_count": len(hits),
        "results": [h.to_dict() for h in hits],
    }


@app.post("/ide/context/pack")
async def context_pack(request: Request):
    """Build a token-budgeted context pack for a query."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    query = body.get("query", "")
    max_tokens = body.get("max_tokens", 4000)

    if not query:
        return JSONResponse({"error": "Query required"}, status_code=400)

    from semantic_search import get_semantic_search
    from filesystem import DEFAULT_PROJECT_ROOT
    search = get_semantic_search(str(DEFAULT_PROJECT_ROOT))
    ctx = search.get_relevant_context(query, max_tokens=max_tokens)
    return ctx


@app.get("/ide/search/status")
async def search_status():
    """Get search index status."""
    from semantic_search import get_semantic_search
    from filesystem import DEFAULT_PROJECT_ROOT
    return get_semantic_search(str(DEFAULT_PROJECT_ROOT)).status()


@app.post("/ide/search/index")
async def search_reindex():
    """Re-index the project for search."""
    from semantic_search import get_semantic_search
    from filesystem import DEFAULT_PROJECT_ROOT
    search = get_semantic_search(str(DEFAULT_PROJECT_ROOT))
    count = search.index_project()
    return {"indexed": count, "status": search.status()}


# ══════════════════════════════════════════════════════
# IDE — DIAGNOSTICS & SECURITY
# ══════════════════════════════════════════════════════

@app.get("/ide/diagnostics/scan")
async def diagnostics_scan(max_files: int = 200):
    """Run full diagnostic scan across the project."""
    from diagnostic_engine import get_diagnostic_engine
    from filesystem import DEFAULT_PROJECT_ROOT
    engine = get_diagnostic_engine(str(DEFAULT_PROJECT_ROOT))
    result = engine.run_full_scan(max_files=max_files)
    return result.to_dict()


@app.get("/ide/diagnostics/security")
async def diagnostics_security(max_files: int = 200):
    """Run security-focused scan."""
    from diagnostic_engine import get_diagnostic_engine
    from filesystem import DEFAULT_PROJECT_ROOT
    engine = get_diagnostic_engine(str(DEFAULT_PROJECT_ROOT))
    result = engine.run_security_scan(max_files=max_files)
    return result.to_dict()


@app.get("/ide/diagnostics/file")
async def diagnostics_file(file: str = ""):
    """Scan a single file for diagnostics."""
    if not file:
        return JSONResponse({"error": "File path required"}, status_code=400)
    from diagnostic_engine import get_diagnostic_engine
    from filesystem import DEFAULT_PROJECT_ROOT
    engine = get_diagnostic_engine(str(DEFAULT_PROJECT_ROOT))
    diags = engine.scan_file(file)
    return {
        "file": file,
        "count": len(diags),
        "diagnostics": [d.to_dict() for d in diags],
    }


@app.get("/ide/diagnostics/status")
async def diagnostics_status():
    """Get diagnostic engine status."""
    from diagnostic_engine import get_diagnostic_engine
    from filesystem import DEFAULT_PROJECT_ROOT
    return get_diagnostic_engine(str(DEFAULT_PROJECT_ROOT)).status()


# ══════════════════════════════════════════════════════
# IDE — LOCAL LLM (OLLAMA @ 192.168.2.25)
# ══════════════════════════════════════════════════════

@app.get("/ide/ollama/models")
async def ollama_models():
    """List available local models on the ghost machine."""
    from ollama_provider import get_ollama_provider
    return get_ollama_provider().status()


@app.get("/ide/ollama/status")
async def ollama_status():
    """Quick health check for Ollama connectivity."""
    from ollama_provider import get_ollama_provider
    p = get_ollama_provider()
    return {"available": p.is_available(), "host": p.host, "port": p.port}


@app.post("/ide/ollama/generate")
async def ollama_generate(request: Request):
    """Generate text/code using local models."""
    from ollama_provider import get_ollama_provider
    body = await request.json()
    prompt = body.get("prompt", "")
    model = body.get("model", "")
    system = body.get("system", "")
    temperature = body.get("temperature", 0.7)
    max_tokens = body.get("max_tokens", 2048)

    if not prompt:
        return JSONResponse({"error": "Prompt required"}, status_code=400)

    result = get_ollama_provider().generate(
        prompt, model=model, system=system,
        temperature=temperature, max_tokens=max_tokens,
    )
    return result.to_dict()


@app.post("/ide/ollama/code")
async def ollama_code(request: Request):
    """Generate code with specialized routing."""
    from ollama_provider import get_ollama_provider
    body = await request.json()
    instruction = body.get("instruction", "")
    context = body.get("context", "")
    language = body.get("language", "python")
    model = body.get("model", "")

    if not instruction:
        return JSONResponse({"error": "Instruction required"}, status_code=400)

    result = get_ollama_provider().code_generate(
        instruction, context=context, language=language, model=model,
    )
    return result.to_dict()


@app.post("/ide/ollama/chat")
async def ollama_chat(request: Request):
    """Multi-turn chat with local models."""
    from ollama_provider import get_ollama_provider
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model", "")
    temperature = body.get("temperature", 0.7)

    if not messages:
        return JSONResponse({"error": "Messages required"}, status_code=400)

    result = get_ollama_provider().chat(
        messages, model=model, temperature=temperature,
    )
    return result.to_dict()


@app.post("/ide/ollama/embed")
async def ollama_embed(request: Request):
    """Generate embeddings for text using nomic-embed-text."""
    from ollama_provider import get_ollama_provider
    body = await request.json()
    text = body.get("text", "")
    texts = body.get("texts", [])
    model = body.get("model", "")

    if texts:
        results = get_ollama_provider().embed_batch(texts, model=model)
        return {"embeddings": [r.to_dict() for r in results]}
    elif text:
        result = get_ollama_provider().embed(text, model=model)
        return result.to_dict()
    else:
        return JSONResponse({"error": "Text or texts required"}, status_code=400)


# ══════════════════════════════════════════════════════
# STARTUP
# ══════════════════════════════════════════════════════



if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("EFL_PORT", "5002"))
    print(f"\n{'='*50}")
    print(f"  Echo Forge IDE — AI Development Environment")
    print(f"  9-Phase AIM-OS Cognition Pipeline")
    print(f"  http://localhost:{port}")
    print(f"{'='*50}\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
