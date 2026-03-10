"""
Echo Forge Loop — Terminal WebSocket Bridge
=============================================

Provides a PTY-backed terminal via WebSocket for the IDE.
Uses subprocess on Windows (no native PTY) with async streaming.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, Optional
from dataclasses import dataclass, field

logger = logging.getLogger('echo_forge.terminal')


@dataclass
class TerminalSession:
    """Represents an active terminal session."""
    session_id: str
    process: Optional[asyncio.subprocess.Process] = None
    cwd: str = ''
    shell: str = ''
    active: bool = True
    created_at: float = 0.0


class TerminalManager:
    """
    Manages terminal sessions with async subprocess I/O.
    
    On Windows, uses cmd.exe or PowerShell via subprocess.
    On Unix, uses bash/zsh via subprocess.
    """

    def __init__(self, working_directory: Optional[str] = None):
        self.working_dir = working_directory or str(
            Path(__file__).resolve().parent.parent
        )
        self.sessions: Dict[str, TerminalSession] = {}
        self._session_counter = 0
        
        # Detect shell
        if sys.platform == 'win32':
            self.default_shell = 'powershell.exe'
            self.shell_args = ['-NoLogo', '-NoProfile', '-Command', '-']
        else:
            self.default_shell = os.environ.get('SHELL', '/bin/bash')
            self.shell_args = []

    async def create_session(self, cwd: Optional[str] = None) -> TerminalSession:
        """Create a new terminal session."""
        import time
        self._session_counter += 1
        session_id = f"term-{self._session_counter}"
        
        work_dir = cwd or self.working_dir
        
        session = TerminalSession(
            session_id=session_id,
            cwd=work_dir,
            shell=self.default_shell,
            created_at=time.time(),
        )
        
        self.sessions[session_id] = session
        logger.info(f"Terminal session created: {session_id} in {work_dir}")
        return session

    async def execute_command(
        self, 
        session_id: str, 
        command: str,
        timeout: int = 30
    ) -> Dict:
        """
        Execute a command in the terminal session.
        
        Returns dict with stdout, stderr, exit_code.
        """
        session = self.sessions.get(session_id)
        if not session:
            return {'error': f'Session not found: {session_id}'}
        
        try:
            if sys.platform == 'win32':
                # PowerShell execution
                process = await asyncio.create_subprocess_exec(
                    'powershell.exe', '-NoLogo', '-NoProfile',
                    '-Command', command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=session.cwd,
                )
            else:
                process = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=session.cwd,
                )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
            
            return {
                'session_id': session_id,
                'command': command,
                'stdout': stdout.decode('utf-8', errors='replace'),
                'stderr': stderr.decode('utf-8', errors='replace'),
                'exit_code': process.returncode,
            }
            
        except asyncio.TimeoutError:
            return {
                'session_id': session_id,
                'command': command,
                'error': f'Command timed out after {timeout}s',
                'exit_code': -1,
            }
        except Exception as e:
            return {
                'session_id': session_id,
                'command': command,
                'error': str(e),
                'exit_code': -1,
            }

    async def stream_command(self, session_id: str, command: str, timeout: int = 60):
        """
        Stream command output line by line as an async generator.
        Yields dicts: {"type": "stdout"|"stderr"|"exit", "data": "..."}
        """
        session = self.sessions.get(session_id)
        if not session:
            yield {'type': 'error', 'data': f'Session not found: {session_id}'}
            return

        try:
            if sys.platform == 'win32':
                process = await asyncio.create_subprocess_exec(
                    'powershell.exe', '-NoLogo', '-NoProfile',
                    '-Command', command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=session.cwd,
                )
            else:
                process = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=session.cwd,
                )

            session.process = process

            async def read_stream(stream, stream_type):
                async for line in stream:
                    yield {
                        'type': stream_type,
                        'data': line.decode('utf-8', errors='replace').rstrip('\n\r'),
                    }

            # Read stdout and stderr concurrently
            stdout_lines = []
            stderr_lines = []

            async for chunk in read_stream(process.stdout, 'stdout'):
                yield chunk

            # After stdout is done, flush stderr
            if process.stderr:
                async for chunk in read_stream(process.stderr, 'stderr'):
                    yield chunk

            await asyncio.wait_for(process.wait(), timeout=10)
            yield {'type': 'exit', 'data': str(process.returncode)}

        except asyncio.TimeoutError:
            yield {'type': 'error', 'data': f'Timed out after {timeout}s'}
        except Exception as e:
            yield {'type': 'error', 'data': str(e)}
        finally:
            session.process = None

    def close_session(self, session_id: str) -> bool:
        """Close a terminal session."""
        session = self.sessions.pop(session_id, None)
        if session:
            if session.process and session.process.returncode is None:
                try:
                    session.process.terminate()
                except Exception:
                    pass
            session.active = False
            logger.info(f"Terminal session closed: {session_id}")
            return True
        return False

    def list_sessions(self) -> list:
        """List all active terminal sessions."""
        return [
            {
                'session_id': s.session_id,
                'cwd': s.cwd,
                'shell': s.shell,
                'active': s.active,
            }
            for s in self.sessions.values()
        ]


# ── Singleton ─────────────────────────────────────────────
_terminal_instance: Optional[TerminalManager] = None


def get_terminal_manager() -> TerminalManager:
    """Get or create the singleton TerminalManager."""
    global _terminal_instance
    if _terminal_instance is None:
        _terminal_instance = TerminalManager()
    return _terminal_instance
