# AIM-OS Enhancement Master Plan

## Current State Assessment

### What Exists (✅ Implemented)
| System | Component | Status |
|--------|-----------|--------|
| **Shell** | CognitiveShell, TopBar, LeftRail, RightPanel, BottomDock | ✅ Functional, X2D themed |
| **Chat** | AIMChat with SSE streaming, task plans, verification, retry | ✅ Full pipeline |
| **Missions** | MissionPanel with CRUD, steps, approval flow | ✅ Cloud-persisted |
| **Swarm** | SwarmPanel — ensemble analyses (Archivist/Researcher/Synthesizer/Critic) | ✅ Realtime |
| **Memory** | MemoryPanel — CMC bitemporal atom browser + snapshots | ✅ Cloud-persisted |
| **Cognition** | CognitionPanel — CAS meta-cognitive monitor, drift detection | ✅ Cloud-persisted |
| **Knowledge** | KnowledgeGraphPanel — SEG force-layout graph + contradictions | ✅ Canvas rendering |
| **Trust** | TrustPanel — VIF witness envelopes, κ-gate, ECE tracking | ✅ Cloud-persisted |
| **Journal** | JournalPanel — self-journaling with knowledge graph | ✅ Cloud-persisted |
| **Run History** | RunHistoryPanel — run traces with scoring | ✅ Cloud-persisted |
| **Test/Audit** | TestAuditPanel — test harness results | ✅ Functional |
| **Icons** | 60+ custom SVG icons (Sharp Technical aesthetic) | ✅ Complete |
| **Design System** | Hasselblad X2D — 5 surface laws, amber accents, CNC depth | ✅ Full token system |
| **Backend** | 8 edge functions, 20+ database tables, APOE engine | ✅ Cloud |

### What's Missing or Weak (🔴 Gaps)

#### 1. Shell & Navigation
- 🔴 No keyboard shortcuts (1-9 mapped but not wired)
- 🔴 BottomDock still uses Lucide icons (not custom)
- 🔴 RightPanel still uses Lucide icons
- 🔴 No command palette (⌘K)
- 🔴 No breadcrumb/sub-page navigation
- 🔴 No notification system / toast queue in TopBar
- 🔴 No user presence / session indicator

#### 2. Chat Intelligence
- 🔴 No conversation history persistence (resets on refresh)
- 🔴 No conversation branching / forking
- 🔴 No inline artifact rendering (code blocks, diagrams)
- 🔴 No voice input
- 🔴 No file/image attachment
- 🔴 No suggested prompts / quick actions
- 🔴 Persona system exists in DB but not exposed in chat UI

#### 3. Mission Control
- 🔴 No visual mission timeline / Gantt view
- 🔴 No mission comparison / diff
- 🔴 No real-time step execution streaming
- 🔴 Approval flow is basic (no multi-reviewer)

#### 4. Swarm / Agent System
- 🔴 No agent topology visualization (who talks to whom)
- 🔴 No per-agent resource monitoring
- 🔴 No agent creation / configuration UI
- 🔴 No inter-agent message inspection

#### 5. Memory Fabric
- 🔴 No memory search with semantic similarity
- 🔴 No memory timeline / temporal browser
- 🔴 No manual memory creation / pinning
- 🔴 No memory graph visualization (atom → atom links)

#### 6. Cognition
- 🔴 No real-time cognitive load gauge (animated)
- 🔴 No historical drift trend chart
- 🔴 No failure mode breakdown chart

#### 7. Knowledge Graph
- 🔴 Force layout is CPU-bound (no WebGL/Canvas optimization)
- 🔴 No graph filtering by type/confidence
- 🔴 No node detail panel on click
- 🔴 No edge label rendering
- 🔴 No contradiction resolution UI

#### 8. Trust & Verification
- 🔴 No ECE calibration curve visualization
- 🔴 No confidence trend chart over time
- 🔴 No witness envelope diff comparison

#### 9. Evolution / Self-Improvement
- 🔴 EvolutionPanel exists but disconnected
- 🔴 No DORA metrics dashboard
- 🔴 No process rule management UI
- 🔴 No promotion gate UI

#### 10. Context Management
- 🔴 ContextPanel exists but not in nav
- 🔴 No context bank browser
- 🔴 No token budget visualization per context tier

---

## Enhancement Phases

### Phase 1: Shell Perfection (Priority: CRITICAL)
**Goal**: Every pixel matches the X2D canon. Zero Lucide icons remain.

| Task | Effort | Impact |
|------|--------|--------|
| Replace all remaining Lucide icons in BottomDock, RightPanel, all panels | M | High |
| Wire keyboard shortcuts (1-9 for nav, ⌘K command palette) | M | High |
| Add command palette (⌘K) with fuzzy search across all surfaces | L | High |
| Persist chat conversations to Cloud | M | Critical |
| Add notification bell + toast queue to TopBar | S | Medium |
| Add session/uptime indicator to BottomDock | S | Low |

### Phase 2: Chat Evolution (Priority: HIGH)
**Goal**: Chat becomes the primary cognitive interface, not just a text box.

| Task | Effort | Impact |
|------|--------|--------|
| Persist conversations to database (new `conversations` table) | M | Critical |
| Conversation list sidebar with search | M | High |
| Inline artifact rendering (code with copy, tables, mermaid) | L | High |
| Suggested prompts / quick actions based on context | M | Medium |
| Persona selector in chat header | S | Medium |
| File/image drag-drop attachment | L | Medium |

### Phase 3: Visual Intelligence (Priority: HIGH)
**Goal**: Every data panel becomes a precision instrument, not a data dump.

| Task | Effort | Impact |
|------|--------|--------|
| Animated cognitive load gauge (radial, CNC style) | M | High |
| ECE calibration curve (recharts, custom theme) | M | High |
| Confidence trend sparklines across all panels | M | High |
| DORA metrics dashboard with radar chart | L | Medium |
| Mission timeline / waterfall view | L | High |
| Memory temporal browser (scrub through time) | L | Medium |

### Phase 4: Knowledge & Graph (Priority: MEDIUM)
**Goal**: Knowledge graph becomes interactive and useful.

| Task | Effort | Impact |
|------|--------|--------|
| WebGL graph renderer (or optimized Canvas) | XL | High |
| Node detail panel (click to inspect) | M | High |
| Graph filtering (by type, confidence, time range) | M | Medium |
| Contradiction resolution workflow | L | Medium |
| Edge label rendering with hover details | M | Low |

### Phase 5: Autonomy & Evolution (Priority: MEDIUM)
**Goal**: Self-improvement loop becomes visible and controllable.

| Task | Effort | Impact |
|------|--------|--------|
| Process rule browser + editor | M | Medium |
| Promotion gate UI (propose → evaluate → promote) | L | High |
| DORA metrics over time (trend charts) | M | Medium |
| Regression detection alerts | M | Medium |
| A/B strategy comparison view | L | Low |

### Phase 6: Context Engine (Priority: LOW)
**Goal**: Context management becomes a first-class surface.

| Task | Effort | Impact |
|------|--------|--------|
| Context bank browser (pinned/working/long-term) | M | Medium |
| Token budget gauge per context tier | S | Medium |
| Manual context pinning from any panel | M | Medium |
| Context search with semantic similarity | L | High |

---

## Architecture Improvements

### Code Quality
- [ ] Break `AIMChat.tsx` (1491 lines) into sub-components
- [ ] Break `MissionPanel.tsx` (806 lines) into sub-components
- [ ] Extract shared panel patterns (header, loading, empty state) into `PanelShell`
- [ ] Create `useSupabaseQuery` hook to reduce boilerplate across panels
- [ ] Add error boundaries per panel

### Performance
- [ ] Virtualize long lists (atoms, witnesses, events) with `react-window`
- [ ] Memoize expensive renders (knowledge graph, charts)
- [ ] Lazy-load panels not in view
- [ ] Add service worker for offline capability

### Testing
- [ ] Component tests for each panel
- [ ] Integration tests for chat → edge function pipeline
- [ ] Visual regression tests for design system

---

## Design System Gaps

### Missing Tokens
- [ ] Add `--surface-glass` for frosted glass overlays
- [ ] Add `--gradient-amber` for consistent amber gradients
- [ ] Add animation timing tokens (ease curves, durations)
- [ ] Add spacing scale tokens (beyond Tailwind defaults)

### Missing Components
- [ ] `GaugeRadial` — circular progress with CNC bezel
- [ ] `Sparkline` — inline trend indicator
- [ ] `StatusBadge` — unified status display across all panels
- [ ] `PanelShell` — standard panel wrapper with header/loading/empty
- [ ] `CommandPalette` — ⌘K fuzzy search overlay
- [ ] `TimelineView` — vertical/horizontal timeline for missions and runs

---

## Immediate Next Actions (Start Here)

1. **Replace remaining Lucide icons** across BottomDock, RightPanel, and all panel files
2. **Wire keyboard shortcuts** for left rail navigation
3. **Add ⌘K command palette** 
4. **Persist chat conversations** to Cloud
5. **Break AIMChat.tsx** into focused sub-components

---

*Document Version: 1.0*  
*Last Updated: 2026-03-09*  
*Canon Reference: docs/ui-canon.txt, docs/aios-master-index-v2.md*
