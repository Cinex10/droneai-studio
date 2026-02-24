# DroneAI Studio — Product Design Document

## 1. Overview

DroneAI Studio is a desktop application that enables users to design drone shows by conversing with an AI agent in natural language. The AI controls Blender programmatically via MCP (Model Context Protocol), using a forked Skybrush drone show engine for the underlying choreography logic. The user sees a unified interface with a chat panel and a live Blender 3D viewport side-by-side.

### Core Value Proposition

Users describe what they want — "100 drones form a heart, then explode into a spiral" — and AI generates a complete, safety-validated drone show with trajectories, LED light programs, and export-ready files. No Blender expertise required.

### Target Users

- Drone show operators needing faster show design
- Event planners exploring drone show possibilities
- Hobbyists and creators without technical 3D skills

## 2. Architecture

### Two-Layer Split

The product is split into two legally and technically separate layers communicating via MCP.

```
PROPRIETARY LAYER (your IP)
├── Desktop app shell (Electron or Tauri)
├── Chat UI (React-based)
├── AI orchestration (Claude API integration)
├── Drone show system prompt and domain knowledge
├── Licensing and payment system
├── User project management
└── Show file format specification

    │
    │  MCP (inter-process communication, local socket)
    │
    ▼

OPEN-SOURCE LAYER (GPL v3)
├── Blender (bundled, launched as subprocess)
├── Drone show plugin (forked from Skybrush Studio)
│   ├── Formation generation
│   ├── Trajectory computation
│   ├── LED light programming
│   ├── Safety validation (spacing, speed, acceleration)
│   └── Show file export pipeline
└── MCP server (exposes Blender + drone ops to AI)
```

MCP as the bridge keeps GPL from infecting the proprietary layer. These are separate programs communicating over a protocol, not linked code.

### Why Blender

- Full 3D engine with viewport, rendering, animation — no need to build one
- Python API allows complete programmatic control
- Already proven for drone shows via Skybrush
- Claude can already control Blender via MCP (proven in current setup)
- Free, open-source, cross-platform
- Bundled with the app so users don't install it separately

### Why Forked Skybrush

- Battle-tested drone show logic (formations, trajectories, safety)
- Saves months of reimplementation
- GPL v3 allows forking, modification, and commercial use
- Only the Blender plugin is GPL — the AI layer stays proprietary

## 3. User Interface

### Layout: Side-by-Side

```
┌──────────────────────────────────────────────────┐
│  DroneAI Studio                          ─ □ ✕   │
├──────────────┬───────────────────────────────────┤
│              │                                   │
│  Chat Panel  │      Blender 3D Viewport          │
│              │                                   │
│  ┌────────┐  │         ● ● ●                     │
│  │ AI:    │  │        ●     ●                    │
│  │ Here's │  │         ● ● ●                     │
│  │ your   │  │                                   │
│  │ heart  │  │                                   │
│  │ forma- │  │                                   │
│  │ tion!  │  │                                   │
│  └────────┘  │                                   │
│              ├───────────────────────────────────┤
│  ┌────────┐  │ ▶ ■ ◀◀ ▶▶  Timeline      00:30   │
│  │ Type.. │  │ ═══════●═══════════════           │
│  └────────┘  └───────────────────────────────────┤
└──────────────┴───────────────────────────────────┘
```

- Chat panel on the left: conversation with AI agent
- Blender viewport on the right: live 3D visualization
- Timeline bar at the bottom: playback controls
- Blender is embedded via window reparenting (OS-native APIs)
- Blender launches in stripped-down mode: only 3D viewport visible, all panels/menus/toolbars hidden

### Blender Window Embedding

The app launches Blender as a subprocess and reparents its window into the app frame:

- **macOS:** NSWindow APIs for window reparenting
- **Windows:** SetParent() Win32 API (future)
- **Linux:** X11 XReparentWindow (future)

Blender is launched with a startup Python script that:
- Hides all UI elements except the 3D viewport
- Starts the MCP server for AI communication
- Loads the drone show workspace
- Sets up the drone show plugin

**Fallback:** If embedding proves flaky on a platform, the app snaps the two windows side-by-side at the OS level.

## 4. AI Agent Design

### System Prompt Structure

The Claude AI agent receives a specialized system prompt covering:

**Drone show design expertise:**
- Show structure: takeoff grid, formations, transitions, landing
- Formation design: arranging N drones into 2D/3D shapes
- Transition choreography: collision-free pathfinding between formations
- LED programming: color sequences, fades, patterns synced to timeline
- Safety rules: minimum 2m spacing, max velocity/acceleration, geofencing

**Blender Python API knowledge:**
- Creating and positioning drone objects
- Keyframing trajectories over time
- Assigning materials/colors for LED simulation
- Camera setup and viewport control
- Scene and timeline management

**Conversational design patterns:**
- Interpreting vague requests ("make it more dramatic")
- Asking clarifying questions when needed
- Iterating on designs based on feedback
- Explaining tradeoffs (drone count vs. detail)

### MCP Tools Available to AI

The AI agent has access to these MCP tools for controlling Blender:

- `execute_blender_code` — run arbitrary Python in Blender
- `get_scene_info` — query current scene state
- `get_viewport_screenshot` — capture viewport for visual verification
- `get_object_info` — inspect specific objects
- Custom drone show tools (added to forked plugin):
  - `create_formation` — generate a drone formation from parameters
  - `create_transition` — compute collision-free transition between formations
  - `set_led_program` — assign light colors over time
  - `validate_safety` — check all safety constraints
  - `export_show` — export to show file format

### Model Selection

- **Claude Sonnet** for quick iterations (move, resize, recolor)
- **Claude Opus** for complex generation (full show from description, multi-formation sequences)
- Response streaming so the user sees progress in real-time

## 5. Drone Show Engine (Forked Skybrush)

### What to Fork

From the Skybrush Studio codebase:

- `sbstudio/model/` — trajectory, light program, color, point cloud, safety check models
- `sbstudio/math/` — nearest neighbors, color math, RNG utilities
- `sbstudio/plugin/operators/` — formation creation, takeoff, landing, transitions, export
- `sbstudio/plugin/model/` — storyboard, formations, light effects, safety check
- `sbstudio/plugin/utils/` — evaluator, sampling, transition computation

### What to Modify

- Rebrand all UI labels, panel names, operator names
- Strip Skybrush-specific API server integration
- Add MCP server endpoints for AI control
- Simplify UI to only what's needed (hide advanced panels)
- Add custom MCP tools for the AI agent (create_formation, validate_safety, etc.)

### What to Build Fresh (Not from Skybrush)

- MCP server integration layer
- AI-friendly API wrappers over Skybrush operators
- Your own show file format and exporter
- Safety validation feedback that AI can interpret and act on

### GPL v3 Compliance

- Maintain GPL v3 license on all forked code
- Provide source code of the drone show plugin to anyone who receives the app
- Keep clear separation between GPL plugin and proprietary app shell
- Include original copyright notices and attribution

## 6. Show File Format

Your own format, independent of .skyc but inspired by its structure:

```
show_file/
├── manifest.json          # metadata, drone count, duration, version
├── drones/
│   ├── drone_001/
│   │   ├── trajectory.json   # position (x,y,z) over time
│   │   └── lights.json       # color (r,g,b,a) over time
│   ├── drone_002/
│   │   ├── trajectory.json
│   │   └── lights.json
│   └── ...
├── safety_report.json     # validation results
└── preview.png            # thumbnail
```

Export support for common operator formats:
- CSV waypoints (universal)
- .skyc (Skybrush ecosystem compatibility)
- Additional formats based on market demand

## 7. Monetization

### Cost Structure

Primary cost is Claude API usage. No GPU servers (Blender runs locally).

| Resource | Estimated Cost |
|---|---|
| Claude API per design iteration | $0.10 - $0.50 |
| Server (auth, licensing, telemetry) | Minimal |
| Cost per active user/month | $5 - $20 |

### Pricing Tiers

**Free — $0/mo**
- 10 drones max
- 5 AI generations per day
- Preview only (no export)
- Purpose: viral demos, try-before-buy

**Pro — $49/mo**
- 500 drones
- Unlimited AI generations
- Full export (all formats)
- HD rendered preview videos
- Email support

**Business — $149/mo**
- 2000+ drones
- Priority API (faster Claude model)
- Team collaboration (shared projects)
- API access for automation
- Priority support

**Enterprise — Custom pricing**
- Unlimited drones
- Dedicated support
- Custom export formats
- On-prem deployment option
- Hardware fleet integration consulting

### Future Revenue Streams

- Show template marketplace (20% commission)
- Rendered video exports (per-render fee)
- Music-synced choreography (premium add-on)

## 8. Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| AI generates invalid trajectories (collisions, impossible speeds) | High | Post-generation safety validator rejects and re-prompts. Never commit to scene without validation pass. |
| Blender window embedding is flaky across OS | Medium | Start macOS only. Fallback: snapped side-by-side windows. |
| Claude API latency for iterative design | Medium | Sonnet for quick edits, Opus for complex work. Stream responses. Cache common patterns. |
| Blender Python API changes between versions | Low | Pin and bundle one Blender version (4.x) with the app. |
| GPL compliance mistakes | Medium | Clear code separation. Legal review before launch. Document all forked code origins. |
| Show format adoption by operators | Medium | Export to established formats (.skyc, CSV). Don't lock users in. |
| Skybrush community/company reaction | Low | Attribution, GPL compliance, differentiation via AI (not competing on the plugin itself). |

## 9. Build Phases

### Phase 0: Proof of Concept (1-2 weeks)

No new code infrastructure. Use the existing local setup (Claude + MCP + Blender) to validate the core question: can AI generate valid, compelling drone shows from natural language?

Deliverables:
- Drone show system prompt for Claude
- 5+ test conversations producing real drone formations
- Screen recording demonstrating the workflow
- Assessment: is the output quality good enough to sell?

**Gate: If AI output quality is poor, stop here and reassess before investing in the app.**

### Phase 1: Desktop App MVP (4-6 weeks)

Build the minimal product.

Deliverables:
- Electron/Tauri app with chat panel
- Blender window embedding (macOS)
- Claude API integration with drone show agent
- Forked Skybrush plugin with MCP server
- Basic show file export
- Safety validation

### Phase 2: Polish and Beta Launch (3-4 weeks)

Make it installable and usable by others.

Deliverables:
- Bundled Blender (user doesn't install separately)
- Onboarding flow
- 5-10 example prompts and starter templates
- Error handling and recovery
- Landing page and waitlist
- Beta distribution to 10-20 early users

### Phase 3: Monetize (2-3 weeks)

Turn it into a business.

Deliverables:
- Stripe subscription integration
- Usage metering (generations, drone count)
- Free tier limits enforced
- License key system
- First paying customers

## 10. Success Criteria

### Phase 0 (Proof of Concept)
- AI can generate a 50+ drone formation from a text description
- AI can iterate on a design based on feedback (3+ rounds)
- Generated shows pass safety validation (no collisions, valid speeds)
- Output looks visually compelling in the Blender viewport

### Phase 1 (MVP)
- End-to-end flow works: open app, chat, see drones, export file
- App installs and runs on macOS without manual Blender setup
- 90%+ of AI-generated shows pass safety validation on first attempt

### Phase 2 (Beta)
- 10+ beta users complete a show design independently
- Average time to first show: under 15 minutes
- Net Promoter Score > 40 from beta users

### Phase 3 (Monetize)
- 5+ paying customers within first month of launch
- Monthly recurring revenue covers Claude API costs
- Churn rate under 10%/month
