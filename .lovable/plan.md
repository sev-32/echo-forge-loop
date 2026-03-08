

# Redesign: Dual-Layer Architecture — User Chat + Backend Swarm Visualization

## Vision

Transform the app from a single "Mission Control" view into a **two-panel layout**: a clean, conversational chat on the left where the AI acts as a casual-but-genius assistant, and a collapsible backend visualization on the right showing the full swarm of agents, thinking, memory, knowledge graphs, and pipeline activity in real-time. The user interacts with a polished chat; the backend complexity is always there but only shown on demand.

## What Changes

### 1. New Layout: Split-Panel Architecture (`Dashboard.tsx`)

Replace the current tab-based navigation with a persistent two-panel layout:
- **Left panel (60-70%)**: Clean conversational chat interface — the "genius assistant"
- **Right panel (30-40%, collapsible)**: Live backend visualization with tabs for Swarm Activity, Pipeline, Memory, Knowledge, Cognition, etc.
- A toggle button to show/hide the backend panel (default: visible)
- The existing `SystemSidebar` merges into the backend panel

### 2. New Chat Component (`AssistantChat.tsx`)

A completely new chat component that replaces the current `AIMChat` for the user-facing experience:
- **Conversational UI**: Messages look like a modern chat app (think ChatGPT/Claude style), not a "Mission Control" dashboard
- **No Mission Control takeover**: While the backend runs, the chat just shows a subtle "thinking..." indicator with a small progress badge (e.g., "Planning 3 tasks..." / "Executing 2/3..." / "Synthesizing...")
- **Synthesized response only**: The assistant's final message is always the polished synthesis — never raw task outputs
- **Detail on demand**: Each assistant message has a small "View backend trace" button that highlights the relevant run in the right panel
- **Follow-up suggestions as clickable chips** below each response
- **Output format controls**: User can set preferences (brief/detailed/exhaustive, casual/technical) via a small settings popover, which gets sent as context to the backend
- **Conversation memory**: Full conversation history sent to backend (already working), but now displayed as a proper chat thread

### 3. Backend Swarm Panel (`SwarmPanel.tsx`)

A new right-panel component that shows the live backend activity:
- **Tabs**: Activity Feed | Pipeline | Agents | Memory | Knowledge | Cognition
- **Activity Feed** (default): Real-time stream of all system events — tasks starting, verifying, auditing, agent feedback, memory loads — in a compact log format. This is where the "swarm" is visualized
- **Pipeline**: The existing `PhasePipeline` + task cards from the current Mission Control, but as a panel view
- **Agents**: The existing `AgentPanel` content
- **Memory/Knowledge/Cognition**: Existing panels, now accessible from the backend view
- When a run is active, the panel auto-scrolls and highlights the current phase
- Small header showing: active run status, token count, agent count

### 4. Edge Function Update (`aim-chat/index.ts`)

Add support for **user preference context**:
- Accept `preferences: { detail_level, tone, format }` in the request body
- Pass these to the audit phase's style analysis (so it respects user choices instead of guessing)
- Pass to synthesis phase as explicit instructions
- No other pipeline changes needed — the 3-phase system already works

### 5. Chat Intelligence Layer

The chat should feel smart:
- The synthesis phase already produces the polished response — just display it properly
- Follow-up suggestions from synthesis become clickable chips
- If the user asks a simple question (detected by complexity="simple"), the response appears quickly with minimal backend noise
- If complex, the backend panel lights up with activity while the chat shows a calm progress indicator
- Past conversation context is always sent, making the assistant aware of everything discussed

## Files

1. **`src/pages/Dashboard.tsx`** — Rewrite to split-panel layout (chat left, swarm right)
2. **`src/components/AssistantChat.tsx`** — New clean chat UI component (extracts and simplifies from AIMChat)
3. **`src/components/SwarmPanel.tsx`** — New backend visualization panel with tabbed sub-views
4. **`src/components/AIMChat.tsx`** — Keep as the streaming engine (types, `streamAIMOS`, `useSystemEvents`), but remove the full UI. `AssistantChat` imports the streaming logic from here
5. **`supabase/functions/aim-chat/index.ts`** — Add `preferences` field support in request handling + pass to audit/synthesis prompts

## Implementation Order

1. Create `AssistantChat.tsx` — clean chat UI that uses `streamAIMOS` from AIMChat
2. Create `SwarmPanel.tsx` — tabbed backend visualization combining existing panels
3. Rewrite `Dashboard.tsx` — split-panel layout
4. Update edge function — add preferences support
5. Add user preference controls (detail level, tone selector)

