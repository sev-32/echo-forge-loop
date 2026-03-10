# Echo Forge Loop — Application Documentation

**Version:** 1.0  
**Last updated:** 2026-03-09  
**Application:** AIM-OS cognitive orchestration and chat (Echo Forge Loop)

---

## 1. Overview and Purpose

Echo Forge Loop is an AIM-OS orchestration app (chat + dashboard). Built in one day on [Lovable](https://lovable.dev); repo [sev-32/echo-forge-loop](https://github.com/sev-32/echo-forge-loop), now under `apps/echo-forge-loop/`.

This repo contains both: backend source in `supabase/functions/`, and the browser app (generated with [Lovable](https://lovable.dev), from [sev-32/echo-forge-loop](https://github.com/sev-32/echo-forge-loop)) in `src/`, under `apps/echo-forge-loop/` in the AIM-OS monorepo.

### 1.1 What the app does

- **Primary role:** User types a goal → front-end POSTs to `aim-chat` → backend runs the orchestration and streams events back → UI displays plan, tasks, thoughts, verification, reflection.
- **Secondary role:** Tabs (Memory, Runs, Journal, etc.) let the user inspect what the backend has produced (atoms, runs, journal entries, knowledge graph).
- **Integration:** Backend lives in this repo (`supabase/functions/`). Persistence (events, tasks, snapshots, atoms, etc.) is in Supabase; the UI is a Vite + React SPA that calls the Edge Functions and renders the results.

### 1.2 Key User Flows

1. **Chat flow:** User types a goal → app calls `aim-chat` with conversation history → streamed events drive plan, task list, thought stream, reflection, and final answer. Conversations can be saved and switched via a sidebar.
2. **Dashboard flow:** User switches tabs (Intelligence, Deep Research, Missions, Swarm, Run History, Memory, Journal, Cognition, Evidence Graph, Trust & Audit, Persona, Evolution, Context) to inspect runs, memory atoms, journal entries, live metrics, and system events.
3. **Run control:** When a run is active, the UI shows mission control (phases, tasks, thoughts). Runs are driven by the `aim-chat` Edge Function; the UI consumes the streamed events (see §13 for details).

---

## 2. Technology Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Browser (ES modules) |
| **Build** | Vite 5.x |
| **Language** | TypeScript 5.x |
| **UI framework** | React 18 |
| **Routing** | React Router v6 |
| **Server state / cache** | TanStack Query (React Query) |
| **Styling** | Tailwind CSS 3.x, CSS variables (HSL), Tailwind Animate |
| **Component library** | shadcn/ui (Radix primitives, custom theme) |
| **Markdown** | react-markdown, remark-gfm |
| **Icons** | Lucide React, custom AIM-OS icons (`@/components/icons`) |
| **Toasts** | sonner + Radix Toast (Toaster) |
| **Backend / persistence** | Supabase (Postgres, Auth, Edge Functions) |
| **Chat API** | Supabase Edge Function `aim-chat` (streaming HTTP) |

### 2.1 Development and Tooling

- **Package manager:** npm (package-lock.json present; repo also has bun.lock/deno.lock from Lovable).
- **Linting:** ESLint 9 (flat config).
- **Testing:** Vitest 3, jsdom, Testing Library.
- **Codegen:** Lovable tagger (`lovable-tagger`) in development for component tagging; Supabase types in `src/integrations/supabase/types.ts`.

---

## 3. Application Architecture

### 3.1 Entry and Routing

- **Entry:** `index.html` mounts the app at `#root`; `src/main.tsx` renders `<App />` and imports `src/index.css`.
- **App.tsx:** Wraps the app in `QueryClientProvider`, `TooltipProvider`, `Toaster`, `Sonner`, and `BrowserRouter`. Defines routes:
  - `/` → `Index` (which renders `Dashboard`)
  - `*` → `NotFound`
- **Single main view:** The only real “page” is the Dashboard; all functionality is tab-based inside the Cognitive Shell.

### 3.2 Shell Layout (Cognitive Shell)

The entire dashboard is one full-screen layout implemented in `CognitiveShell`:

| Zone | Component | Purpose |
|------|-----------|---------|
| **Top** | `TopBar` | World identity, system status, run id |
| **Left** | `LeftRail` | Tab navigation (Intelligence, Deep Research, Missions, Swarm, Run History, Memory, Journal, Cognition, Evidence Graph, Trust & Audit, Persona, Evolution, Context), plus Settings at bottom |
| **Center** | Main content | One of the panel components per `activeTab` |
| **Right** | `RightPanel` | “Live feed”: system events stream, live metrics (Runs, Atoms, Nodes), gauges |
| **Bottom** | `BottomDock` | Process summary: runs count, atoms, rules, checkpoint, status ticker |

Global behavior:

- **Command palette:** `CommandPalette` is rendered at the top level; supports navigation to tabs.
- **Keyboard shortcuts:** Keys `1`–`9` and `0` map to tabs (e.g. 1 → chat, 2 → missions) when focus is not in an input/textarea. Shortcuts are documented in `LeftRail` tooltips.

### 3.3 Tab-to-Panel Mapping

| Tab id | Panel component | Description |
|--------|-----------------|-------------|
| `chat` | `AIMChat` | Main chat UI: conversation list, message list, goal input, run dashboard (phases, tasks, thoughts), reflection viewer |
| `research` | `DeepResearchPanel` | Deep research workflow UI |
| `runs` | `RunHistoryPanel` | Run history and list |
| `memory` | `MemoryPanel` | Memory fabric (CMC) view |
| `missions` | `MissionPanel` | Missions view |
| `swarm` | `SwarmPanel` | Swarm / multi-agent view |
| `journal` | `JournalPanel` | Journal entries |
| `cognition` | `CognitionPanel` | Cognition metrics / view |
| `knowledge` | `KnowledgeGraphPanel` | Evidence / knowledge graph |
| `trust` | `TrustPanel` + `TestAuditPanel` | Trust and test audit (two panels in one tab) |
| `persona` | `PersonaControlPanel` | Persona configuration |
| `evolution` | `EvolutionPanel` | Evolution view |
| `context` | `ContextPanel` | Context management view |

Every panel is wrapped in `PanelErrorBoundary` so a failure in one tab does not crash the whole shell.

---

## 4. AIM-OS Subsystems (Library Layer)

The app implements or integrates with several AIM-OS concepts in `src/lib/`. These are the core “brain” behind runs, memory, and verification.

### 4.1 Orchestration and Execution

- **`orchestration-kernel.ts`** — `OrchestrationKernel`: Main execution loop. Responsibilities:
  - Start/stop runs, create checkpoints.
  - Pull next task from `taskQueue`, enforce budgets via `autonomy-governor`, run verification via `verifier`, manage context via `context-manager`.
  - Append events to `eventStore` (hash-chained, append-only).
  - Supports manual / supervised / autonomous modes.

- **`ai-kernel.ts`** — `AIOrchestrationKernel`: AI-powered variant. Can call `ai-service` for plan/execute/verify/journal. Tracks activities (plan, execute, verify, reflect, discover, error, checkpoint, task_created, budget). Optionally persists to cloud via `persistence` (Supabase).

- **`task-queue.ts`** — In-memory task queue: create/update tasks, dependencies, status (queued, active, blocked, done, failed, canceled), get next runnable task.

- **`autonomy-governor.ts`** — Budget and autonomy: wall time, tokens, tool calls, iterations, risk budget; modes (manual, supervised, autonomous); stop request handling.

- **`verifier.ts`** — Runs acceptance criteria (schema, lint, test, contains, etc.) and returns verification results.

- **`context-manager.ts`** — Pinned/working/long-term context; artifact refs; token estimates.

### 4.2 Event Sourcing and Snapshots

- **`event-store.ts`** — Append-only event log with hash chaining (`hash_prev`, `hash_self`). Events: RUN_STARTED, RUN_STOPPED, PLAN_CREATED, ACTION_EXECUTED, TOOL_CALLED, VERIFICATION_*, CHECKPOINT_CREATED, BUDGET_*, ERROR_RAISED, etc. Supports snapshots (queue state, DAG edges, context, artifacts, budgets). Integrity check via `verifyIntegrity()`.

### 4.3 Memory and Provenance (CMC, VIF, SEG, SDF-CVF)

- **`cmc.ts`** — Core Memory Controller. Bitemporal memory: immutable “atoms” with `transaction_time`, `valid_time_start`/`valid_time_end`, provenance. Atom types: text, code, decision, reflection, plan, verification, discovery, constraint, artifact. Integrates with Supabase for storage; snapshot support.

- **`vif.ts`** — Verification and Integrity Framework (witnesses, verification).

- **`seg.ts`** — SEG (knowledge synthesis / evidence graph).

- **`sdf-cvf.ts`** — SDF-CVF (design/verification).

- **`journal.ts`** — Journal entries (structure and persistence).

### 4.4 AI and Support Services

- **`ai-service.ts`** — Calls external AI for plan, execute, verify, journal (used by AI kernel).

- **`ai-agents.ts`** — Agent definitions/config.

- **`deep-research.ts`** — Deep research workflow logic.

- **`cas.ts`** — Cognitive Audit System.

- **`apoe.ts`** — APOE (execution plans).

- **`persistence.ts`** — Supabase persistence: events, snapshots, tasks, journal entries, and related tables. Used when “persist to cloud” is enabled on the AI kernel.

### 4.5 Test and Audit

- **`test-harness.ts`** — Test harness for orchestration (test specs, runs, scoring).
- **`test-result-store.ts`** — Store for test results.
- **`verifier.ts`** — Already mentioned; used for acceptance checks.

Types for all of the above live in **`src/types/orchestration.ts`**: tasks, events, snapshots, context, budgets, risk policy, run metadata, verification results, audit entries, test specs, kernel state, execution plans, etc.

---

## 5. Data Flow and Supabase

### 5.1 Supabase Client

- **Client:** `src/integrations/supabase/client.ts`. Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Auth: localStorage, persist session, auto-refresh token.
- **Types:** `src/integrations/supabase/types.ts` — generated; defines `Database` (e.g. `public.Tables.atoms`, `cognitive_snapshots`, `events`, `tasks`, `snapshots`, and many more).

### 5.2 Chat Streaming

- **Endpoint:** Chat URL is configurable. If `VITE_CHAT_URL` is set, it is used; otherwise `CHAT_URL = ${VITE_SUPABASE_URL}/functions/v1/aim-chat`. This allows the app to use either the Supabase Edge Function or a **local chat server** (see §5.4).
- **Flow:** `AIMChat` builds `conversationHistory` (role + content), calls `streamAIMOS()` in `src/components/chat/stream.ts`. `streamAIMOS` does `fetch(CHAT_URL, { method: 'POST', body: JSON.stringify({ messages }) })`. When using Supabase, `Authorization: Bearer VITE_SUPABASE_PUBLISHABLE_KEY` is sent; for a local backend this header is omitted. The response body is read as a stream and parsed as SSE-like `data: {...}` lines.
- **Event types (examples):** `thinking`, `memory_detail`, `open_questions`, `plan`, task lifecycle (`task_start`, `task_delta`, `task_verify_start`, `task_verified`, `task_complete`, `task_error`), `reflection`, `knowledge_update`, `run_complete`, `error`, retry/diagnosis, process evaluation, rules generated, audit, synthesis.

### 5.3 Persistence (Optional)

When the AI kernel is configured with `persistToCloud: true`, `persistence.ts` is used to:

- Persist events to `events`.
- Persist snapshots to `snapshots`.
- Persist/update tasks in `tasks`.
- Persist journal entries.
- Other tables as needed (atoms, knowledge graph, etc. are used by CMC and other libs).

The UI hooks (e.g. `useConversations`, `useJournal`, `useAgents`, `useLiveMetrics`) read from Supabase or from in-memory stores that may sync with Supabase.

### 5.4 Local backend (Gemini CLI)

You can run the chat backend **fully on your machine** using a local Python server that speaks the same streaming protocol as the Supabase `aim-chat` Edge Function and uses **Gemini CLI** (AIM-OS `scripts/ai_engine/providers/gemini_cli_provider.py`) instead of the Lovable AI gateway.

**When to use**

- Development or demos without Supabase/Lovable.
- Privacy or cost: no data sent to Lovable; Gemini CLI uses your Ultra subscription.

**How to run**

1. **Install Gemini CLI** (if not already): `npm install -g @google/gemini-cli`.
2. **Install server dependencies:** From the app root, `cd server` then `pip install -r requirements.txt` (or use a venv).
3. **Start the local server:** From `apps/echo-forge-loop/server/`, run:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 5002
   ```
   Or: `python -m uvicorn main:app --host 0.0.0.0 --port 5002`. The server exposes:
   - `POST /chat` and `POST /functions/v1/aim-chat` — same request/response contract as Supabase aim-chat.
   - `GET /health` — health check.
4. **Point the app at the local backend:** In the app root, set in `.env`:
   ```env
   VITE_CHAT_URL=http://localhost:5002/chat
   ```
   (Or `http://localhost:5002/functions/v1/aim-chat` if you prefer the same path as Supabase.)
5. **Run the front end:** `npm run dev` (or use the app launcher). Chat requests will go to the local server; no Supabase chat URL or key is required for chat. Persistence (conversations, metrics, etc.) still uses Supabase unless you enable the optional local persistence adapter (see §5.3 and persistence adapter docs).

**Local vs Supabase**

| Mode              | Chat backend              | Persistence (default) |
|-------------------|---------------------------|------------------------|
| Supabase (default)| Supabase Edge `aim-chat`  | Supabase               |
| Local             | Local server (port 5002)  | Supabase (or local adapter if configured) |

The local server does not remove or replace the Supabase path; it is selected only when `VITE_CHAT_URL` is set. To switch back to Supabase, unset `VITE_CHAT_URL` or set it to `${VITE_SUPABASE_URL}/functions/v1/aim-chat`.

**Optional local persistence (browser only)**

Set `VITE_USE_LOCAL_PERSISTENCE=true` in `.env` to use the **local persistence adapter**. Data is stored in the browser’s IndexedDB (no Supabase or server required for persistence). Use this for fully offline or privacy-local use. The same entities are supported (conversations, events, tasks, journal, knowledge graph, etc.). To switch back to Supabase persistence, set `VITE_USE_LOCAL_PERSISTENCE=false` or remove the variable.

---

## 6. UI and Design System

### 6.1 Design Language

- **Theme:** “Hasselblad X2D” — deep matte aluminum, amber accents, skeuomorphic “CNC-machined” surfaces. Defined in `src/index.css` and `tailwind.config.ts`.
- **Colors:** HSL CSS variables. Key groups:
  - **Surfaces:** `--surface-0` … `--surface-3`, `--surface-raised` (depth hierarchy).
  - **Labels:** `--label-primary`, `--label-secondary`, `--label-muted`, `--label-engraved`.
  - **Status:** `--status-success`, `--status-warning`, `--status-error`, `--status-info`, `--status-pending`, `--status-active`, `--status-blocked`.
  - **Nodes (DAG):** `--node-queued`, `--node-active`, `--node-done`, `--node-failed`, `--node-blocked`.
  - **Budget:** `--budget-safe`, `--budget-warning`, `--budget-critical`.
  - **Terminal/code:** terminal and code color sets.
- **Typography:** Inter (sans), JetBrains Mono / Fira Code (mono). Loaded via Google Fonts in `index.css`.

### 6.2 Tailwind

- **Config:** `tailwind.config.ts` — content from `./src/**/*.{ts,tsx}` and related paths; `tailwindcss-animate` plugin; extended theme for fonts, colors, border radius, keyframes (accordion, fade-in, slide-in-right, pulse-ring, glow-pulse), animations.
- **Prefix:** none. Base color from shadcn is `slate`; `components.json` points to this config and `src/index.css`.

### 6.3 Components

- **shadcn/ui:** 40+ components under `src/components/ui/` (button, card, dialog, dropdown, table, tabs, sidebar, chart, etc.).
- **Shell:** `CognitiveShell`, `TopBar`, `LeftRail`, `RightPanel`, `BottomDock`, `CommandPalette`, `ErrorBoundary` in `src/components/shell/`.
- **Chat:** `AIMChat`, `SendButton`, `ConversationSidebar`, `RunDashboard`, `TaskExplorer`, `ReflectionViewer`, `stream`, `system-events`, `md-components`, types in `src/components/chat/`.
- **Icons:** `src/components/icons/` — custom AIM-OS icons (e.g. AimOSLogo, PipelineStepIcons) and re-exports.
- **Panels:** One component per tab (see table in §3.3); e.g. `MemoryPanel`, `JournalPanel`, `TrustPanel`, `TestAuditPanel`, etc.

---

## 7. Key Components in Depth

### 7.1 AIMChat

- **State:** Messages list, input value, `isRunning`, `showSidebar`; uses `useConversations()` for conversation list and active conversation.
- **Execution:** On submit, appends user message and a placeholder assistant message with `runData` (goal, approach, tasks, thoughts, status, phases). Calls `streamAIMOS()` with callbacks that update that assistant message (plan, task deltas, verification, reflection, knowledge update, run complete, errors).
- **UI:** Conversation sidebar (list + new conversation), message list with markdown and run-specific blocks (MissionControl, PhasePipeline, ThoughtStream, TaskCard, DeepReflectionPanel). Send button and system event toasts.

### 7.2 CognitiveShell

- **Props:** `children`, `activeTab`, `onTabChange`, `systemStatus`, optional `runId`, `iteration`, `checkpoint`.
- **Behavior:** Renders TopBar, LeftRail, main content, RightPanel, BottomDock; registers keyboard shortcuts; CommandPalette overlay.

### 7.3 RightPanel and BottomDock

- **RightPanel:** Uses `useSystemEvents()` and `useLiveMetrics(4000)`. Shows “LIVE FEED” event log and gauges (Runs, Atoms, Nodes) from live metrics.
- **BottomDock:** Uses `useLiveMetrics(6000)`; shows runs count, atoms, rules, optional checkpoint, status ticker.

### 7.4 Hooks

- **useConversations** — Load/create/update/delete conversations; sync with storage/Supabase.
- **useOrchestration** — System events for the right panel.
- **useLiveMetrics** — Polling or subscription for totalRuns, atoms, knowledgeNodes, activeRules, etc. (interval configurable).
- **useAgents, useAIKernel, useJournal, useTestResults, useRealtimeRefresh** — Used by panels for data and wiring.

---

## 8. Configuration

### 8.1 Vite

- **Config:** `vite.config.ts`. React plugin (SWC), `componentTagger` in development only. Alias `@` → `./src`. Server: `host: "::"`, `port: 8080`, HMR overlay disabled.
- **Note:** The app is launched in AIM-OS via `LAUNCH.bat` / `LAUNCH.ps1`, which run `npm run dev`; Vite’s default port may be overridden to 8080 in config, so the app is typically at **http://localhost:8080** when run from the launcher. If you run `npm run dev` directly without this config, check the terminal for the actual port (e.g. 5173).

### 8.2 Environment Variables

Required for full functionality (Supabase mode):

- **`VITE_SUPABASE_URL`** — Supabase project URL.
- **`VITE_SUPABASE_PUBLISHABLE_KEY`** — Supabase anon/public key.

Used by `src/integrations/supabase/client.ts` and by `stream.ts` for the default `aim-chat` endpoint. Without these, the app may load but chat and persistence will fail unless you use the local backend.

Optional (local backend):

- **`VITE_CHAT_URL`** — Overrides the chat endpoint. If set (e.g. `http://localhost:5002/chat`), the app sends chat requests to this URL instead of `${VITE_SUPABASE_URL}/functions/v1/aim-chat`. No Bearer token is sent when using a local URL. See §5.4 for how to run the local server.

Optional (local persistence, browser only):

- **`VITE_USE_LOCAL_PERSISTENCE`** — Set to `true` to store data in the browser’s IndexedDB instead of Supabase (conversations, events, tasks, journal, etc.). See §5.4 “Optional local persistence”.

Create `.env` from `.env.example` if present, or add these to `.env` in the app root.

### 8.3 HTML Meta

- **index.html:** Title “AIM-OS”, description “Ai - Operating system”, Lovable/og/twitter meta. No critical logic in the HTML beyond the root div and script tag.

---

## 9. Running, Building, and Testing

### 9.1 Install

```bash
cd apps/echo-forge-loop
npm install
```

### 9.2 Run (development)

- **From repo:** `npm run dev` (Vite dev server; port 8080 per vite.config).
- **From AIM-OS launcher:** Double-click `apps/echo-forge-loop/LAUNCH.bat`. The launcher runs `LAUNCH.ps1`, which prints stop instructions, checks for `node_modules` (runs `npm install` if missing), then runs `npm run dev` in the foreground.

**Stopping:** Press **Ctrl+C** in the launcher window, then close the window. Closing the window with X only can leave the Node process running. If the PC is slow later, run `apps\KILL_ORPHAN_DEV_APPS.bat` from the AIM-OS repo root.

### 9.3 Build

```bash
npm run build
```

Output is written to the Vite default (typically `dist/`). For production deployment, serve the `dist` folder with a static host or integrate into a larger deployment pipeline.

### 9.4 Preview (production build locally)

```bash
npm run preview
```

### 9.5 Tests

```bash
npm run test        # one-off run
npm run test:watch  # watch mode
```

Tests live under `src/test/` (e.g. `example.test.ts`, `setup.ts`). The app also has a Test Harness panel and TestAuditPanel for orchestration/acceptance tests.

---

## 10. Launcher and Cleanup (AIM-OS Canon)

- **LAUNCH.bat:** Changes to the script directory, invokes `LAUNCH.ps1` via PowerShell, then `pause`.
- **LAUNCH.ps1:** Prints canonical “To stop this app: press Ctrl+C in this window…” and mentions `apps\KILL_ORPHAN_DEV_APPS.bat`; ensures `node_modules` (runs `npm install` if needed); runs `npm run dev` in the foreground.
- **Cleanup:** From the AIM-OS root, run `apps\KILL_ORPHAN_DEV_APPS.bat` (or the corresponding `.ps1`) to kill orphan dev processes (e.g. Node, Vite) when the PC is slow or after closing windows without Ctrl+C.

---

## 11. File and Folder Reference

```
apps/echo-forge-loop/
├── docs/
│   └── ECHO_FORGE_LOOP_APP_DOCUMENTATION.md   # this file
├── public/                     # static assets
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css               # design tokens, Tailwind, shell styles
│   ├── vite-env.d.ts
│   ├── pages/
│   │   ├── Index.tsx           # renders Dashboard
│   │   ├── Dashboard.tsx       # CognitiveShell + tab/panel mapping
│   │   └── NotFound.tsx
│   ├── components/
│   │   ├── shell/              # CognitiveShell, TopBar, LeftRail, RightPanel, BottomDock, CommandPalette, ErrorBoundary
│   │   ├── chat/               # AIMChat deps: stream, types, SendButton, ConversationSidebar, RunDashboard, TaskExplorer, ReflectionViewer, md-components, system-events
│   │   ├── ui/                 # shadcn components
│   │   ├── icons/
│   │   └── *.tsx               # Panel components (AgentPanel, MemoryPanel, JournalPanel, etc.)
│   ├── hooks/                  # useConversations, useOrchestration, useLiveMetrics, useAgents, useAIKernel, useJournal, useTestResults, etc.
│   ├── lib/                    # orchestration-kernel, ai-kernel, task-queue, event-store, autonomy-governor, verifier, context-manager, cmc, vif, seg, sdf-cvf, journal, persistence, ai-service, ai-agents, deep-research, cas, apoe, test-harness, test-result-store, utils
│   ├── types/
│   │   └── orchestration.ts    # Task, Event, Snapshot, Context, Budget, KernelState, etc.
│   ├── integrations/
│   │   └── supabase/            # client.ts, types.ts
│   └── test/                   # Vitest setup and example test
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── components.json             # shadcn config
├── LAUNCH.bat
├── LAUNCH.ps1
├── README.md                   # Lovable project readme
└── supabase/
    ├── config.toml             # function config (verify_jwt, etc.)
    └── functions/              # backend for chat and AI flows (in this repo)
        ├── aim-chat/           # main streaming chat engine (~1,825 lines)
        ├── aim-chat/index.test.ts
        ├── deep-research/
        ├── ai-step/            # used by ai-kernel when wired
        ├── ai-verify/
        ├── ai-journal/
        ├── ai-audit/
        ├── ai-test-gen/
        └── polycaste-transform/
```

---

## 13. Architecture clarification and known gaps

**Backend is in this repo.** The chat and AI backend source code lives under `supabase/functions/`. The main streaming chat engine is `supabase/functions/aim-chat/index.ts` (~1,825 lines). It is the **live product runtime** for the main chat experience.

**Main product path is server-driven.** `AIMChat` does not run the orchestration itself. It POSTs conversation history to `/functions/v1/aim-chat` and consumes streamed events (plan, task_start, task_delta, task_verified, reflection, audit, synthesis_complete, run_complete, etc.). The browser is a **stateful orchestration viewer**; the real intelligence loop is in the Edge Function.

**Local kernels are not the main runtime.**  
- `src/lib/orchestration-kernel.ts` — sandbox/testbed kernel; planning is a fixed sequence; execution and tool runs are simulated; verification has stubbed lint/test/custom. Not used by AIMChat.  
- `src/lib/ai-kernel.ts` — calls Edge Functions (ai-step, ai-verify, ai-journal) and persists to Supabase, but **is not mounted in the main Dashboard path**. Dashboard mounts `AIMChat`, not `useAIKernel`. So the live chat path does not use either local kernel.

**Two event buses.** The RightPanel “live feed” uses `useSystemEvents` from `use-orchestration.ts`, which reads from the local `eventStore`. AIMChat uses `src/components/chat/system-events.ts`. They are not the same bus, so the right-panel live feed is **not** wired to the main AIMChat streaming path.

**Known issues (for hardening):**  
- **Conversation persistence:** Conversation is created/updated optimistically at run start; final message list is persisted only on `run_complete`. Mid-stream failure or refresh can leave DB and UI out of sync; partial runs are not durably represented.  
- **Security:** In `supabase/config.toml`, `verify_jwt = false` for aim-chat and other functions; frontend sends publishable key; functions use service role and permissive CORS. For anything beyond a prototype, auth and JWT verification should be tightened.  
- **Verification fallback:** In `aim-chat`, if tool parsing fails, verification can fall back to a soft pass (e.g. `passed: true`, `score: 75`). Worth tightening for integrity.  
- **Hardcoded options:** e.g. `enablePolycaste = true` and placeholder knowledge_graph in polycaste; can be made configurable later.

Backend lives in this repo (`supabase/functions/`). Main chat path is aim-chat. Local kernels in `src/lib/` are not wired to AIMChat. Event bus and persistence details in the paragraphs above.

---

## 12. Summary

Echo Forge Loop: orchestration chat + dashboard. Server code in `supabase/functions/` (aim-chat, deep-research, ai-step, etc.); browser app in `src/`; Supabase for DB. Run: `npm run dev` or `LAUNCH.bat`. Stop: Ctrl+C in that window. File tree §11; architecture notes §13.



