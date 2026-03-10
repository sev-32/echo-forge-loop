# Echo Forge Loop

**AIM-OS 9-Phase AI Cognition Pipeline**

> Watch AI think. Every phase of cognition — memory, planning, execution, verification, retry, auditing, synthesis, reflection, and evolution — visualized in real time.

Echo Forge Loop is a full-stack application that implements and visualizes the complete AIM-OS cognition pipeline. Give it any goal and watch as the AI loads memory from past runs, decomposes the goal into tasks, executes with streaming output, verifies against acceptance criteria, retries failures, performs holistic audits, synthesizes a polished response, reflects deeply on performance, and evolves process rules for future improvement.

**Built in 1 day with [Lovable](https://lovable.dev) + AIM-OS agent team.**

---

## The Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  MEMORY  │ →  │   PLAN   │ →  │ EXECUTE  │ →  │  VERIFY  │ →  │  RETRY   │
│ Load past│    │Decompose │    │ Stream   │    │ Check    │    │ Diagnose │
│ lessons  │    │ + scope  │    │ each task│    │ criteria │    │ + re-run │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                                      │
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  EVOLVE  │ ←  │ REFLECT  │ ←  │SYNTHESIZE│ ←  │  AUDIT   │ ←───────┘
│ Generate │    │ Deep     │    │ Polish + │    │ Holistic │
│ rules    │    │ introsp. │    │ combine  │    │ review   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

Each phase emits real-time events that the UI renders as an interactive mission control dashboard.

---

## Features

- **9-Phase Pipeline** — Memory → Plan → Execute → Verify → Retry → Audit → Synthesize → Reflect → Evolve
- **Persistent Memory** — Reflections, process rules, and knowledge nodes persist across runs
- **Streaming Execution** — Watch task output appear token by token
- **Acceptance Criteria Verification** — Each task is scored against explicit criteria
- **Automatic Retry** — Failed tasks are diagnosed and re-executed
- **Holistic Audit** — All outputs reviewed together; can trigger deepening loops
- **Response Synthesis** — Polished final response with follow-up suggestions
- **Process Evolution** — The system generates and applies rules from past runs
- **Run Traces** — Every run is archived as JSON for analysis
- **Mission Control UI** — Real-time pipeline visualization with thought stream
- **25+ Dashboard Panels** — Knowledge graph, cognition, swarm, trust, orchestration, and more
- **Conversation Persistence** — Chat history via Supabase or localStorage
- **Configurable Models** — Different models per pipeline phase via env vars

---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- [Gemini CLI](https://github.com/google/gemini-cli) installed globally

### 1. Frontend

```bash
cd echo-forge-loop
npm install
npm run dev
```

### 2. Backend

```bash
cd echo-forge-loop/server
pip install -r requirements.txt
python main.py
```

### 3. Configure

Copy `.env.example` to `.env` and point the frontend at your local server:
```
VITE_CHAT_URL=http://localhost:5002/chat
```

Or use the launcher:
```powershell
.\LAUNCH.ps1
```

---

## Architecture

```
echo-forge-loop/
├── src/                          # React frontend (Vite + shadcn/ui + Tailwind)
│   ├── components/
│   │   ├── AIMChat.tsx           # Main chat + mission control
│   │   ├── chat/
│   │   │   ├── stream.ts         # SSE event handler (20+ event types)
│   │   │   ├── types.ts          # Full type definitions for pipeline
│   │   │   ├── RunDashboard.tsx   # Mission control visualization
│   │   │   ├── TaskExplorer.tsx   # Task cards with verification
│   │   │   └── ReflectionViewer.tsx # Deep reflection panel
│   │   ├── MissionPanel.tsx      # Mission overview (30KB)
│   │   ├── KnowledgeGraphPanel.tsx # Knowledge visualization
│   │   ├── CognitionPanel.tsx    # Cognitive metrics
│   │   ├── SwarmPanel.tsx        # Multi-agent swarm view
│   │   └── ... (25 panels total)
│   └── hooks/                    # React hooks for state management
├── server/                       # Python backend
│   ├── aim_chat_loop.py          # 9-phase cognition pipeline (480+ lines)
│   ├── main.py                   # FastAPI SSE server
│   ├── requirements.txt          # Python dependencies
│   └── memory/                   # Persistent memory (auto-created)
│       ├── reflections.jsonl     # Run reflections log
│       ├── rules.json            # Learned process rules
│       ├── knowledge.json        # Knowledge graph nodes
│       └── traces/               # Archived run traces
└── supabase/                     # Supabase edge functions (cloud mode)
```

---

## SSE Event Protocol

The server streams events as `data: {json}\n\n`. The frontend handles 20+ event types:

| Phase | Events |
|-------|--------|
| **Memory** | `thinking(memory)`, `memory_detail` |
| **Plan** | `thinking(planning)`, `open_questions`, `plan` |
| **Execute** | `thinking(execute)`, `task_start`, `task_delta`, `task_error` |
| **Verify** | `thinking(verify)`, `task_verify_start`, `task_verified`, `task_complete` |
| **Retry** | `thinking(retry)`, `task_retry_start`, `task_retry_diagnosis` |
| **Audit** | `thinking(audit)`, `audit_start`, `audit_decision`, `audit_loop_start` |
| **Synthesize** | `thinking(synthesize)`, `synthesis_start`, `synthesis_complete` |
| **Reflect** | `thinking(reflect)`, `reflection_start`, `reflection`, `process_evaluation`, `knowledge_update` |
| **Evolve** | `thinking(evolve)`, `rules_generated` |
| **Complete** | `run_complete` |

---

## Configuration

All pipeline parameters are configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `EFL_PORT` | `5002` | Server port |
| `EFL_PLAN_MODEL` | `gemini-2.5-flash` | Model for planning phase |
| `EFL_EXEC_MODEL` | `gemini-2.5-flash` | Model for execution |
| `EFL_VERIFY_MODEL` | `gemini-2.5-flash` | Model for verification |
| `EFL_AUDIT_MODEL` | `gemini-2.5-flash` | Model for auditing |
| `EFL_SYNTH_MODEL` | `gemini-2.5-flash` | Model for synthesis |
| `EFL_REFLECT_MODEL` | `gemini-2.5-flash` | Model for reflection |
| `EFL_MAX_RETRIES` | `1` | Max retry attempts per task |
| `EFL_MAX_AUDIT_LOOPS` | `2` | Max audit deepening loops |
| `EFL_CORS_ORIGINS` | `*` | Allowed CORS origins |

---

## Memory System

Echo Forge Loop maintains persistent memory across runs:

- **Reflections** (`reflections.jsonl`) — JSONL log of every run's reflection. Used to build context for future planning.
- **Process Rules** (`rules.json`) — Evolved rules generated by the pipeline. High-confidence rules are incorporated into future planning prompts.
- **Knowledge** (`knowledge.json`) — Knowledge graph nodes extracted during reflection. Tracks concepts and relationships encountered.
- **Run Traces** (`traces/`) — Complete JSON traces of every run for analysis.

The memory system is designed to make the AI **get smarter with every run** — it learns what works, what fails, and adapts its planning accordingly.

---

## Part of AIM-OS

Echo Forge Loop is part of the [AIM-OS](https://github.com/sev-32/AIM-OS) ecosystem — the AI-Integrated Memory & Operations System. It uses the same `GeminiCLIProvider` from the AIM-OS AI Engine and demonstrates the core AIM-OS philosophy: **AI that remembers, verifies, and evolves.**

---

## Tech Stack

**Frontend:** React 18 · TypeScript · Vite · shadcn/ui · Tailwind CSS · Recharts
**Backend:** Python · FastAPI · Gemini CLI
**Persistence:** Supabase (cloud) or localStorage (local)

---

## License

Part of the AIM-OS project. See repository root for license.
