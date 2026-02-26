# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DroneAI Studio — a macOS Tauri desktop app where users design drone light shows via natural language chat. The AI (Claude Code) controls Blender programmatically via MCP to generate formations, transitions, and safety-validated show files.

## Repository Structure

Two independent codebases in `sandbox/`:

- **`droneai/`** — Python engine library. ABC-based pluggable components for formation generation, transition planning, safety validation, and export. No Blender dependency (pure Python + scipy).
- **`droneai-studio/`** — Tauri 2 desktop app. Rust backend spawns Blender (headless) and Claude Code CLI as subprocesses. React frontend with Three.js viewport and chat panel.

## Commands

### Python engine tests
```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
python3 -m pytest droneai/tests/ -v

# Single test file
python3 -m pytest droneai/tests/test_engine_integration.py -v

# Single test
python3 -m pytest droneai/tests/test_transition_planners.py::test_hungarian_planner_optimal -v
```

### Tauri app (from droneai-studio/)
```bash
cd droneai-studio
npm run dev              # Vite dev server (port 1420)
npm run build            # TypeScript check + Vite production build
npm run tauri dev        # Full Tauri dev mode (Rust + React)
npm run tauri build      # Production build
cargo build --release    # Rust backend only (from src-tauri/)
cargo test               # Rust tests (from src-tauri/)
```

## Architecture

```
React UI (ChatPanel, DroneViewport, TimelineBar)
  │ Tauri invoke()
  ▼
Rust Backend (lib.rs → commands.rs)
  ├→ BlenderProcess (blender.rs) — headless Blender on TCP:9876 via MCP
  └→ ClaudeSession (claude_code.rs) — Claude Code CLI, stream-json stdin/stdout
       │ MCP tools
       ▼
  Blender MCP addon — executes Python code using droneai/ engine
```

**Data flow:** User message → Tauri IPC → Claude Code stdin → MCP tool calls → Blender executes Python → results stream back via Tauri events → React updates.

**Scene data:** `invoke("get_scene_data")` sends a Python extraction script to Blender over TCP:9876, returns JSON with drone positions, colors, keyframes. The React Three.js viewport renders this independently from Blender's own viewport.

## Engine ABCs (droneai/engine/)

All engine components follow the same pattern: an ABC in `base.py` and concrete implementations alongside it.

| Component | ABC | Default Implementation |
|-----------|-----|----------------------|
| `formations/` | `FormationGenerator` | `ParametricFormation` (wraps shapes.py) |
| `transitions/` | `TransitionPlanner` | `HungarianPlanner` (scipy, optimal assignment) |
| `safety/` | `SafetyValidator` | `StandardValidator` (wraps legacy safety.py) |
| `exporters/` | `ShowExporter` | `JsonExporter` |

There is also a `RepulsionEnforcer` (spacing enforcer) in `transitions/spacing.py` with its own ABC in `transitions/spacing_base.py`.

## Key Data Models (droneai/show_format/schema.py)

```python
@dataclass
class Show:
    manifest: ShowManifest      # title, drone_count, duration_seconds
    trajectories: List[DroneTrajectory]  # [(t, x, y, z), ...]
    lights: List[DroneLightProgram]      # [(t, r, g, b, fade), ...]
```

## Safety Constants (always enforced)

- Min spacing: 2.0 m
- Max altitude: 120.0 m
- Max velocity: 8.0 m/s
- Max acceleration: 4.0 m/s²

## Rust Backend Modules (droneai-studio/src-tauri/src/)

- **commands.rs** — All Tauri IPC commands: `launch_blender`, `send_message`, `get_scene_data`, `run_test_show`, `get_blender_status`, `embed_blender_window`
- **blender.rs** — `BlenderProcess`: detects Blender installation, launches headless with startup script, manages TCP:9876 MCP communication
- **claude_code.rs** — `ClaudeSession`: spawns Claude Code CLI with `--input-format stream-json --output-format stream-json`, pipes messages via stdin/stdout
- **embed.rs** — macOS NSWindow embedding (cocoa/objc), currently fallback mode (window positioned adjacent)

## Claude Code Integration

Claude Code is spawned with flags: `--print --system-prompt <path> --input-format stream-json --output-format stream-json --mcp-config <path> --allowedTools execute_blender_code,get_scene_info,get_object_info,get_viewport_screenshot`

MCP config is generated at runtime by `commands.rs::new_chat()` with the resolved absolute path to `mcp-server/server.py`.

System prompt: `droneai/system_prompt.md` (also copied to `droneai-studio/resources/system_prompt.md`)

## MCP Server (droneai-studio/mcp-server/)

Our own MCP bridge replacing the third-party `blender-mcp` package. A single Python file using FastMCP that:
- Connects to Blender's TCP:9876 addon
- Exposes 4 tools: `execute_blender_code`, `get_scene_info`, `get_object_info`, `get_viewport_screenshot`
- No telemetry, no third-party asset integrations

Dependencies: auto-managed by `uv run` via PEP 723 inline metadata (requires `mcp`)

## Platform Notes

- macOS only (cocoa/objc dependencies for window embedding)
- Blender 4.x required, detected at: bundled → dev-staged → /Applications → ~/Applications
- Blender runs headless (`--background`) with MCP addon on TCP:9876
- Python engine uses scipy (for Hungarian algorithm) — available in Blender's bundled Python or system Python
