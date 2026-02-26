# Future Features

Ideas and features discussed but deferred. When starting a new feature, check this list first.

## Show Spec / Engine

- **Hold duration per formation** — Add `hold` field to timeline entries so the spec distinguishes "hold time" from "transition time" (currently the gap between entries is implicitly both)
- **Rich transitions** — Beyond simple easing: explode-reform, spiral, wave (sequential drone movement), custom path curves between formations
- **Image/SVG-derived formations** — Generate drone positions from an image or SVG file (point cloud extraction)
- **Music sync** — Beat detection, BPM import, snap formations to beats, audio-reactive color
- **LED light programming system** — ABCs for light effects: solid, fade, chase, rainbow gradient, music-reactive, per-drone patterns
- **Real export formats** — .skyc (Skybrush), .csv (generic), Litebee, DJI formats beyond JSON

## Formations

- **Text/logo formations** — From font rendering or SVG paths (beyond current pixel font)
- **Freeform drawing** — User draws a shape in the viewport, drones fill it
- **Composite formations** — Multiple shapes combined (e.g. heart inside a circle)

## UX / Interaction

- **Direct mode** (working name) — User interacts with viewport (click, drag, select drones/formations) to build context-rich prompts for the AI. Like Cursor's code selection but for 3D drone shows
- **Timeline polish** — Scrubbing with preview, keyframe visualization, playback controls
- **Undo/redo** — Show spec versioning, step back through modifications
- **Project system** — Save/load projects, each containing a show spec + modifications
- **Bloom post-processing** — Emissive glow effect in Three.js viewport (component exists, not wired)

## Architecture

- **Rust engine rewrite** — The pure-math pipeline (position generation, Hungarian assignment, spacing enforcement, safety validation) could move from Python to Rust for performance at high drone counts (500-2000+). The Tauri backend is already Rust. Only the final Blender rendering step (bpy calls) must stay Python. Pre-computed positions would be sent to Blender via TCP as data, not code.
- **Replace blender-mcp** — Own MCP server (in progress, see docs/plans/2026-02-26-own-mcp-server-plan.md)
- **Bundled Blender** — Ship Blender with the app so users don't install separately
- **Subscription/billing** — Licensing and payment system
- **Team collaboration** — Multi-user project editing
