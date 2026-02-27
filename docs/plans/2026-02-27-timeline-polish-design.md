# Timeline Polish Design

**Date:** 2026-02-27
**Status:** Approved

## Summary

Replace the 48px thin timeline bar with a rich, multi-layer, read-only timeline panel for visualizing drone shows. Resizable, collapsible layers, zoom, minimap.

## Bug Fix

**Problem:** Timeline shows `00:10` before any show is built. Blender's default scene returns `frame_range: [1, 250]` and `useSceneData.ts` falls back to `[0, 1440]`. The `hasShow` check uses `totalFrames > 0` which is always true.

**Fix:** `hasShow` must also check `sceneData.drones.length > 0`. No drones = no show = disabled timeline.

## Scope

Read-only visualization for chat mode. All editing features (drag formations, add/remove, reorder) are deferred to Direct mode (see `docs/future-features.md`).

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [Minimap] ▓▓▓▓░░░░░░░░░░░░░▓▓▓▓▓▓▓▓░░░░░░░░░░░▓▓▓▓           │ 12px
├──────────────────────────────────────────────────────────────────┤
│  0:00    0:04    0:08    0:12    0:16    0:20    0:24    0:28   │ 20px
│  ──────────────────│─────────────────────────────────────────── │ Ruler + playhead
├──────────────────────────────────────────────────────────────────┤
│ ▶ 20  ░░░░20░░░░░░░░░░░░░░░20░░░░░░░░░░░░20░░░░░░░░░20░░░░░  │ 16px  Drone count
├──────────────────────────────────────────────────────────────────┤
│ ┌─Grid──┐╌morph╌┌─Circle─────┐╌morph╌┌─Circle──┐╌morph╌┌Grid┐ │ 48px
│ │ ● ● ● │  ↔   │  ○    ○    │  ↔   │  ○  ○   │  ↔   │●●●●│ │ Formation track
│ │ 0s    │       │  4s        │       │  12s    │       │ 28s│ │ (cards + transitions)
│ └───────┘       └────────────┘       └─────────┘       └────┘ │
├──────────────────────────────────────────────────────────────────┤
│ ████████████████████████████████████████████████████████████████ │ 12px  Color track
├──────────────────────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ 12px  Safety strip
├──────────────────────────────────────────────────────────────────┤
│ ▶ ⏸  ────────────────────────────── 00:04 / 00:28   [1x ▾]    │ 32px  Controls
└──────────────────────────────────────────────────────────────────┘
                                                    Total: ~160px default
```

## Layers

### 1. Minimap (12px)
Compressed overview of entire show. Formation blocks as colored rectangles. Current viewport highlighted as a draggable window for navigation. Visible when zoomed in.

### 2. Ruler + Playhead (20px)
Time ticks (seconds/minutes). Vertical playhead line. Click to seek, drag to scrub. Scrubbing updates both the Three.js viewport (via `onFrameChange`) and Blender (via `set_blender_frame`).

### 3. Drone Count (16px)
Thin bar showing drone count at each formation point. Currently constant across all formations (from `spec.drone_count`), but future-ready for variable-count shows.

### 4. Formation Track (48px) — hero layer
Formation cards as colored blocks. Width proportional to hold duration. Each card shows:
- Formation shape name (e.g. "Circle", "Grid")
- Color palette dots (from spec color)
- Time label

Between cards: transition blocks (narrower, visually distinct) showing easing type. Hover for tooltip with formation details (shape, params, altitude).

### 5. Color Track (12px)
Horizontal gradient bar. Each segment colored from the spec's `color` field. Solid colors are flat, gradients show start color. Gives a quick sense of the show's color journey.

### 6. Safety Strip (12px)
Heatmap bar. Green = safe, yellow = near limits, red = violations. Data from `BuildResult.safety_report`. Initially simple (overall safe/unsafe), refined later with per-transition granularity.

### 7. Controls Bar (32px)
- Play/pause button
- Time display: `00:04 / 00:28`
- Speed selector: cycle through 0.5x / 1x / 2x
- Layer toggle icons: `[M] [D] [F] [C] [S]`

## Interactions

- **Scrub:** Click/drag on ruler or playhead to seek
- **Zoom:** Mouse wheel on timeline zooms horizontally. Minimap shows viewport
- **Hover:** Formation cards show tooltip with details
- **Playback:** Play button at configured speed, loops at end
- **Resize:** Drag handle on top edge of panel. Min 80px, max 350px, default 160px
- **Collapse layers:** Toggle icons in controls bar hide/show individual layers

## Data Source

New IPC command `get_show_info` returns the ShowSpec + SafetyReport from the current project. Called once after a show is built (not polled). This data is persistent via the project system.

```rust
#[tauri::command]
fn get_show_info(project: State<ProjectState>) -> Option<ShowInfo>
```

```typescript
interface ShowInfo {
  spec: {
    drone_count: number;
    fps: number;
    timeline: {
      time: number;
      formation: { type: string; shape?: string; params?: Record<string, unknown> };
      color: { type: string; value?: number[]; start?: number[]; end?: number[] };
      transition?: { easing: string };
    }[];
  } | null;
  safety: {
    is_safe: boolean;
    min_spacing_found: number;
    max_velocity_found: number;
    max_altitude_found: number;
    violations: string[];
  } | null;
}
```

## Component Structure

```
src/components/
├── Timeline/
│   ├── TimelinePanel.tsx       # Main container: resize, collapse, zoom state
│   ├── Minimap.tsx             # Compressed overview
│   ├── Ruler.tsx               # Time ruler + playhead
│   ├── DroneCountTrack.tsx     # Drone count bar
│   ├── FormationTrack.tsx      # Formation cards + transition blocks
│   ├── ColorTrack.tsx          # Color gradient strip
│   ├── SafetyStrip.tsx         # Heatmap
│   ├── ControlsBar.tsx         # Play, time, speed, layer toggles
│   └── types.ts                # Shared timeline types
```

Each sub-component receives shared props: `showInfo`, `currentFrame`, `totalFrames`, `fps`, `zoom`, `scrollOffset`. The panel manages zoom/scroll state and passes it down.

## Future (Direct Mode)

Deferred to `docs/future-features.md`:
- Drag formation cards to reorder
- Add/remove formations from timeline
- Resize formation cards to change hold duration
- Music/beat track
- Annotations/cue track
- Emotional arc overlay
- Snap to beats
