# Phase 1: Desktop App MVP — Design Document

## 1. Overview

Build a standalone macOS desktop app where users design drone shows through a chat interface. The app embeds Blender's 3D viewport for live visualization and uses Claude Code (Max subscription) as the AI backend. The Phase 0 Python engine (`droneai/`) is extended with abstract base classes for flexibility and improved transition planning.

### What This Delivers

- Desktop app: chat panel + embedded Blender 3D viewport
- User describes a show in natural language, AI builds it in real-time
- Safety-validated, exportable drone show files
- No API key needed — runs on Claude Code Max subscription

### What This Does NOT Include

- Bundled Blender (user installs separately)
- Subscription/billing system
- Team collaboration
- Custom export formats (just JSON)
- Music sync

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│  DroneAI Studio (Tauri App)                         │
│                                                     │
│  ┌──────────────┬──────────────────────────────┐    │
│  │  Chat Panel  │  Blender 3D Viewport         │    │
│  │  (React)     │  (embedded NSWindow)         │    │
│  │              │                              │    │
│  │              ├──────────────────────────────┤    │
│  │  [Type...]   │  ▶ ■  Timeline    00:30      │    │
│  └──────┬───────┴──────────────────────────────┘    │
│         │ Tauri IPC                                  │
│  ┌──────▼──────────────────────────────────────┐    │
│  │  Rust Backend                                │    │
│  │  ├── claude_code.rs  (subprocess management) │    │
│  │  ├── blender.rs      (launch + lifecycle)    │    │
│  │  ├── embed.rs        (NSWindow reparenting)  │    │
│  │  └── commands.rs     (Tauri IPC handlers)    │    │
│  └──────┬──────────────────────────────────────┘    │
│         │ stdin/stdout                               │
│  ┌──────▼──────────────────────────────────────┐    │
│  │  Claude Code (subprocess)                    │    │
│  │  ├── System prompt: droneai/system_prompt.md │    │
│  │  └── MCP tools ──────────────────────────┐  │    │
│  └──────────────────────────────────────────┤  │    │
│                                    MCP socket│  │    │
│  ┌─────────────────────────────────────────▼──┐│    │
│  │  Blender (subprocess)                      ││    │
│  │  ├── MCP server addon                      ││    │
│  │  ├── droneai/ engine (Python)              ││    │
│  │  └── 3D viewport (embedded in Tauri)       ││    │
│  └────────────────────────────────────────────┘│    │
└─────────────────────────────────────────────────────┘
```

### Key Decisions

- **Tauri** over Electron — Rust backend gives direct access to macOS NSWindow APIs for embedding. Smaller binary, lower memory.
- **Claude Code subprocess** over direct API — uses Max subscription, no API key needed. Claude Code already handles MCP communication with Blender.
- **User installs Blender separately** — simplifies packaging for Phase 1. App detects installation and guides user if missing.
- **Build on Phase 0 code** — no Skybrush fork. Own codebase, full ownership, no GPL complexity.

## 3. Data Flow

```
User types message in chat
  → React ChatPanel
  → Tauri IPC (invoke "send_message")
  → Rust claude_code.rs
      → Pipes message to Claude Code subprocess stdin
      → Claude Code processes with drone show system prompt
          ├── Text response → streamed via stdout → Tauri event → ChatPanel
          └── MCP tool calls (execute_blender_code, get_viewport_screenshot, etc.)
              → Claude Code ↔ Blender MCP (already working)
              → Tool results fed back to Claude internally
              → Claude continues reasoning...
  → Final response displayed in chat
  → Viewport updates visible in embedded Blender window in real-time
```

### Claude Code Session Management

- App spawns one Claude Code process per chat session
- System prompt loaded from `droneai/system_prompt.md`
- Conversation history maintained within the Claude Code session
- New chat = new Claude Code process
- Process killed when chat closed or app exits

## 4. Blender Window Embedding (macOS)

### Launch Sequence

1. App starts → detects Blender at `/Applications/Blender.app` (or user-configured path)
2. Launches Blender as subprocess with startup script:
   - Hides all UI except 3D viewport
   - Starts MCP server addon
   - Sets up drone show workspace (dark background, ground, Drones collection)
3. Rust backend finds Blender's NSWindow by process ID
4. Calls macOS APIs to reparent:
   - `NSWindow.setStyleMask` — remove title bar/chrome
   - `NSView.addSubview` — embed Blender's content view into Tauri's right panel
   - Resize handler keeps viewport filling the panel

### Fallback

If embedding fails (permissions, OS version, OpenGL context issues):
- Detect failure
- Position Blender window adjacent to app window
- Log warning for diagnostics

### MCP Addon Auto-Install

On first launch, if the Blender MCP addon isn't installed:
- Copy addon files to Blender's addon directory (`~/Library/Application Support/Blender/4.x/scripts/addons/`)
- Enable it via Blender's Python API on next launch

## 5. Frontend (React + Tailwind)

### Components

```
src/
├── App.tsx                    # Layout: chat panel | blender viewport | timeline
├── components/
│   ├── ChatPanel.tsx          # Message list + input box
│   ├── ChatMessage.tsx        # Single message (text, code blocks, inline images)
│   ├── BlenderViewport.tsx    # Container div for embedded Blender (sized by Rust)
│   ├── TimelineBar.tsx        # Play/pause/scrub + time display
│   └── SetupScreen.tsx        # First-launch: detect Blender, install addon
├── hooks/
│   ├── useClaude.ts           # Send messages, receive streamed responses via Tauri IPC
│   └── useBlender.ts          # Blender state: running, frame, timeline info
└── styles/
    └── globals.css            # Tailwind base + dark theme
```

### Chat Panel Features

- Markdown rendering for AI responses
- Inline viewport screenshots (auto-captured after each AI action)
- Code block syntax highlighting (for when AI shows what it executed)
- Streaming text display (word-by-word as Claude responds)
- Input box with Enter to send, Shift+Enter for newline

### Timeline Bar

- Play/Pause button — sends `bpy.context.scene.frame_set()` via Claude Code
- Scrubber — drag to change frame, updates Blender in real-time
- Time display — `MM:SS / MM:SS` (current / total)
- Frame info synced from Blender scene metadata

## 6. Engine Architecture (Abstract Base Classes)

The Phase 0 `droneai/` package is restructured with ABCs for all pluggable components.

### Directory Structure

```
droneai/
├── engine/
│   ├── __init__.py
│   ├── transitions/
│   │   ├── __init__.py
│   │   ├── base.py            # TransitionPlanner (ABC)
│   │   ├── hungarian.py       # HungarianPlanner — optimal assignment
│   │   ├── nearest.py         # NearestNeighborPlanner — fast greedy
│   │   └── linear.py          # LinearPlanner — naive (Phase 0 behavior)
│   ├── formations/
│   │   ├── __init__.py
│   │   ├── base.py            # FormationGenerator (ABC)
│   │   ├── parametric.py      # Heart, circle, star, spiral, sphere, text
│   │   └── spacing.py         # SpacingEnforcer (ABC) + RepulsionEnforcer
│   ├── safety/
│   │   ├── __init__.py
│   │   ├── base.py            # SafetyValidator (ABC)
│   │   └── standard.py        # StandardValidator (Phase 0 logic)
│   └── exporters/
│       ├── __init__.py
│       ├── base.py            # ShowExporter (ABC)
│       └── json_exporter.py   # JSON format (Phase 0 schema)
├── formations/                 # Phase 0 code (kept for backwards compat)
│   └── shapes.py
├── safety.py                   # Phase 0 code (kept)
├── show_format/
│   └── schema.py              # Phase 0 code (kept)
├── blender_scripts/            # Blender MCP scripts (Phase 0, extended)
├── system_prompt.md
└── tests/
```

### Abstract Base Classes

```python
# TransitionPlanner — how to assign drones to target positions
class TransitionPlanner(ABC):
    @abstractmethod
    def plan(self, source: List[Position], target: List[Position]) -> List[int]:
        """Return mapping: source[i] moves to target[result[i]]."""
        ...

# FormationGenerator — how to generate positions for a shape
class FormationGenerator(ABC):
    @abstractmethod
    def generate(self, count: int, **params) -> List[Position]:
        """Generate positions for count drones."""
        ...

# SpacingEnforcer — how to guarantee minimum spacing
class SpacingEnforcer(ABC):
    @abstractmethod
    def enforce(self, positions: List[Position], min_spacing: float) -> List[Position]:
        """Adjust positions to maintain minimum spacing."""
        ...

# SafetyValidator — how to validate a show
class SafetyValidator(ABC):
    @abstractmethod
    def validate(self, timeline: ShowTimeline, params: SafetyParams) -> SafetyResult:
        """Validate entire show timeline."""
        ...

# ShowExporter — how to export a show to file
class ShowExporter(ABC):
    @abstractmethod
    def export(self, show: Show, path: str) -> None:
        """Export show to file."""
        ...
```

### Phase 1 Implementations

| ABC | Implementation | Algorithm |
|-----|---------------|-----------|
| `TransitionPlanner` | `HungarianPlanner` | `scipy.optimize.linear_sum_assignment` on distance matrix |
| `FormationGenerator` | `ParametricFormation` | Phase 0 shapes with arc-length parameterization |
| `SpacingEnforcer` | `RepulsionEnforcer` | Iterative repulsion: push apart drones closer than min_spacing |
| `SafetyValidator` | `StandardValidator` | Phase 0 spacing/altitude/velocity checks |
| `ShowExporter` | `JsonExporter` | Phase 0 JSON schema |

## 7. Rust Backend (src-tauri/)

### Modules

```rust
// main.rs — App entry point
// - Creates Tauri app
// - Registers IPC commands
// - Launches Blender on startup

// blender.rs — Blender subprocess lifecycle
// - Find Blender installation path
// - Launch with startup Python script
// - Monitor health (restart if crashes)
// - Kill on app exit

// embed.rs — macOS NSWindow reparenting
// - Find Blender window by PID
// - Remove window chrome
// - Reparent into Tauri webview
// - Handle resize events
// - Fallback to side-by-side if embedding fails

// claude_code.rs — Claude Code subprocess management
// - Spawn claude process with system prompt
// - Pipe user messages via stdin
// - Stream stdout back as Tauri events
// - One process per chat session
// - Kill on session end

// commands.rs — Tauri IPC command handlers
// - send_message(text) → pipes to Claude Code
// - set_frame(n) → executes bpy frame change via Claude Code
// - get_blender_status() → returns running/connected state
// - new_chat() → kills old Claude Code process, spawns new one
```

## 8. First-Launch Experience

1. App opens → `SetupScreen` component checks for:
   - Blender installed? → if not, show download link
   - MCP addon installed? → if not, auto-install
   - Claude Code available? → if not, show install instructions
2. All checks pass → launch Blender → embed viewport → show chat panel
3. Welcome message from AI: "Welcome to DroneAI Studio! Describe a drone show and I'll build it for you."

## 9. Project Structure (Complete)

```
sandbox/droneai-studio/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── blender.rs
│   │   ├── embed.rs
│   │   ├── claude_code.rs
│   │   └── commands.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── BlenderViewport.tsx
│   │   ├── TimelineBar.tsx
│   │   └── SetupScreen.tsx
│   ├── hooks/
│   │   ├── useClaude.ts
│   │   └── useBlender.ts
│   └── styles/
│       └── globals.css
├── droneai/                    # Python engine (in Blender)
│   ├── engine/
│   │   ├── transitions/
│   │   ├── formations/
│   │   ├── safety/
│   │   └── exporters/
│   ├── formations/
│   ├── safety.py
│   ├── show_format/
│   ├── blender_scripts/
│   ├── system_prompt.md
│   └── tests/
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── index.html
```

## 10. Success Criteria

- End-to-end flow works: open app → chat → see drones in embedded Blender → export file
- App runs on macOS without manual Blender configuration (auto-detects + installs addon)
- Claude Code Max subscription powers the AI — no API key setup
- Transition path planning prevents collisions between formations
- All engine components are abstract — swappable implementations
- 24+ existing tests continue passing
- New tests cover: Hungarian planner, spacing enforcer, arc-length parameterization
