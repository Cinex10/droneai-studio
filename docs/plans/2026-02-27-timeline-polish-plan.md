# Timeline Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the thin 48px timeline bar with a rich multi-layer read-only timeline panel showing minimap, ruler, formation cards, color track, safety strip, and playback controls.

**Architecture:** New `Timeline/` component directory replaces `TimelineBar.tsx`. A `get_show_info` Rust IPC command exposes ShowSpec + SafetyReport to the frontend. The panel is resizable (drag handle), layers are collapsible, and zoom is supported via mouse wheel.

**Tech Stack:** React, TypeScript, Tauri IPC, CSS (Tailwind), existing `SceneData` + new `ShowInfo` types.

**Design doc:** `docs/plans/2026-02-27-timeline-polish-design.md`

---

### Task 1: Fix the 00:10 bug

**Files:**
- Modify: `droneai-studio/src/components/TimelineBar.tsx`

The bug: `totalFrames` comes from `sceneData.frame_range[1]` which is always non-zero (Blender's default is 250 frames). The `hasShow` check only checks `totalFrames > 0`, so the timeline shows `00:10` even with no show.

**Step 1: Fix hasShow check**

In `TimelineBar.tsx`, change line 81:

```typescript
// Before:
const hasShow = totalFrames > 0;

// After:
const hasShow = totalFrames > 0 && (sceneData?.drones?.length ?? 0) > 0;
```

**Step 2: Verify fix**

Run: `cd droneai-studio && npm run build`
Expected: Compiles without errors. Timeline shows `--:-- / --:--` when no drones exist.

**Step 3: Commit**

```bash
git add src/components/TimelineBar.tsx
git commit -m "fix: timeline shows --:-- when no show is loaded"
```

---

### Task 2: `get_show_info` Rust IPC command

**Files:**
- Modify: `droneai-studio/src-tauri/src/commands.rs`
- Modify: `droneai-studio/src-tauri/src/lib.rs`

This command returns the current ShowSpec + safety data from the project state. The timeline reads formation names, colors, and timings from this.

**Step 1: Add the command to `commands.rs`**

```rust
#[derive(serde::Serialize)]
pub struct ShowInfo {
    pub spec: Option<serde_json::Value>,
    pub safety: Option<serde_json::Value>,
}

#[tauri::command]
pub fn get_show_info(
    project: State<'_, ProjectState>,
) -> ShowInfo {
    let pm = project.lock().unwrap();
    match &pm.current {
        Some(project) => ShowInfo {
            spec: project.spec.clone(),
            safety: project.build_result.as_ref().and_then(|br| br.get("safety").cloned()),
        },
        None => ShowInfo {
            spec: None,
            safety: None,
        },
    }
}
```

Note: This depends on Task 1-2 of the project system plan (ProjectManager in Tauri state). If that hasn't landed yet, create a temporary version that returns `ShowInfo { spec: None, safety: None }` and update it once the project system merges.

**Step 2: Register in `lib.rs`**

Add `commands::get_show_info` to the `invoke_handler` list.

**Step 3: Verify**

Run: `cd droneai-studio/src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add get_show_info IPC command for timeline data"
```

---

### Task 3: Timeline types + `useShowInfo` hook

**Files:**
- Create: `droneai-studio/src/components/Timeline/types.ts`
- Create: `droneai-studio/src/hooks/useShowInfo.ts`

**Step 1: Create shared types**

```typescript
// src/components/Timeline/types.ts

export interface FormationSpec {
  type: string;
  shape?: string;
  params?: Record<string, unknown>;
}

export interface ColorSpec {
  type: string;
  value?: number[];
  start?: number[];
  end?: number[];
  axis?: string;
}

export interface TransitionSpec {
  easing: string;
}

export interface TimelineEntry {
  time: number;
  formation: FormationSpec;
  color: ColorSpec;
  transition?: TransitionSpec;
}

export interface ShowSpec {
  drone_count: number;
  fps: number;
  timeline: TimelineEntry[];
}

export interface SafetyReport {
  is_safe: boolean;
  min_spacing_found: number;
  max_velocity_found: number;
  max_altitude_found: number;
}

export interface ShowInfo {
  spec: ShowSpec | null;
  safety: SafetyReport | null;
}

export interface TimelineLayerVisibility {
  minimap: boolean;
  droneCount: boolean;
  formations: boolean;
  color: boolean;
  safety: boolean;
}
```

**Step 2: Create useShowInfo hook**

```typescript
// src/hooks/useShowInfo.ts
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ShowInfo } from "../components/Timeline/types";

export function useShowInfo() {
  const [showInfo, setShowInfo] = useState<ShowInfo | null>(null);

  const refreshShowInfo = useCallback(async () => {
    try {
      const info = await invoke<ShowInfo>("get_show_info");
      setShowInfo(info);
    } catch {
      // Project system may not be ready yet
    }
  }, []);

  return { showInfo, refreshShowInfo };
}
```

**Step 3: Commit**

```bash
git add src/components/Timeline/types.ts src/hooks/useShowInfo.ts
git commit -m "feat: add timeline types and useShowInfo hook"
```

---

### Task 4: ControlsBar component

**Files:**
- Create: `droneai-studio/src/components/Timeline/ControlsBar.tsx`

The bottom bar with play/pause, time display, speed selector, and layer toggles. This replaces the old TimelineBar's controls.

**Step 1: Create the component**

```tsx
// src/components/Timeline/ControlsBar.tsx
import type { TimelineLayerVisibility } from "./types";

interface ControlsBarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  speed: number;
  onSpeedChange: (speed: number) => void;
  hasShow: boolean;
  layers: TimelineLayerVisibility;
  onToggleLayer: (layer: keyof TimelineLayerVisibility) => void;
}

const SPEEDS = [0.5, 1, 2];

function formatTime(frame: number, fps: number): string {
  const seconds = Math.floor(frame / fps);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function ControlsBar({
  isPlaying,
  onPlayPause,
  currentFrame,
  totalFrames,
  fps,
  speed,
  onSpeedChange,
  hasShow,
  layers,
  onToggleLayer,
}: ControlsBarProps) {
  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const layerKeys: { key: keyof TimelineLayerVisibility; label: string }[] = [
    { key: "minimap", label: "M" },
    { key: "droneCount", label: "D" },
    { key: "formations", label: "F" },
    { key: "color", label: "C" },
    { key: "safety", label: "S" },
  ];

  return (
    <div className="flex items-center h-8 px-3 gap-3 bg-[var(--bg-tertiary)] border-t border-[var(--border)]">
      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        disabled={!hasShow}
        className="text-[var(--text-primary)] hover:text-[var(--accent)] text-sm disabled:opacity-30 disabled:cursor-default w-5"
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>

      {/* Time display */}
      <span className="text-xs text-[var(--text-secondary)] font-mono">
        {hasShow
          ? `${formatTime(currentFrame, fps)} / ${formatTime(totalFrames, fps)}`
          : "--:-- / --:--"}
      </span>

      {/* Speed */}
      <button
        onClick={cycleSpeed}
        disabled={!hasShow}
        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] disabled:opacity-30"
      >
        {speed}x
      </button>

      <div className="flex-1" />

      {/* Layer toggles */}
      <div className="flex gap-1">
        {layerKeys.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onToggleLayer(key)}
            className={`text-[10px] w-5 h-5 rounded font-mono ${
              layers[key]
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            } hover:opacity-80`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Timeline/ControlsBar.tsx
git commit -m "feat: add ControlsBar with play, time, speed, layer toggles"
```

---

### Task 5: Ruler component

**Files:**
- Create: `droneai-studio/src/components/Timeline/Ruler.tsx`

Time ruler with ticks and a draggable playhead.

**Step 1: Create the component**

```tsx
// src/components/Timeline/Ruler.tsx
import { useRef, useCallback } from "react";

interface RulerProps {
  totalFrames: number;
  currentFrame: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
  onSeek: (frame: number) => void;
}

export default function Ruler({
  totalFrames,
  currentFrame,
  fps,
  zoom,
  scrollOffset,
  onSeek,
}: RulerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const frameToX = useCallback(
    (frame: number) => ((frame / totalFrames) * 100 * zoom) - scrollOffset,
    [totalFrames, zoom, scrollOffset]
  );

  const xToFrame = useCallback(
    (clientX: number) => {
      if (!ref.current) return 0;
      const rect = ref.current.getBoundingClientRect();
      const x = clientX - rect.left + scrollOffset;
      const pct = x / (rect.width * zoom);
      return Math.round(Math.max(0, Math.min(totalFrames, pct * totalFrames)));
    },
    [totalFrames, zoom, scrollOffset]
  );

  const handleClick = (e: React.MouseEvent) => {
    onSeek(xToFrame(e.clientX));
  };

  const handleDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const move = (ev: MouseEvent) => onSeek(xToFrame(ev.clientX));
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [xToFrame, onSeek]
  );

  // Generate tick marks
  const totalSeconds = totalFrames / fps;
  const tickInterval = totalSeconds <= 30 ? 2 : totalSeconds <= 120 ? 5 : 10;
  const ticks: { time: number; frame: number }[] = [];
  for (let t = 0; t <= totalSeconds; t += tickInterval) {
    ticks.push({ time: t, frame: Math.round(t * fps) });
  }

  const playheadPct = totalFrames > 0 ? frameToX(currentFrame) : 0;

  const formatTick = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
  };

  return (
    <div
      ref={ref}
      className="relative h-5 bg-[var(--bg-secondary)] cursor-pointer select-none overflow-hidden"
      onClick={handleClick}
    >
      {/* Ticks */}
      {ticks.map((tick) => (
        <div
          key={tick.frame}
          className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${frameToX(tick.frame)}%` }}
        >
          <div className="w-px h-2 bg-[var(--text-secondary)] opacity-40" />
          <span className="text-[9px] text-[var(--text-secondary)] opacity-60 mt-0.5">
            {formatTick(tick.time)}
          </span>
        </div>
      ))}

      {/* Playhead */}
      <div
        className="absolute top-0 w-0.5 h-full bg-[var(--accent)] z-10 cursor-ew-resize"
        style={{ left: `${playheadPct}%` }}
        onMouseDown={handleDrag}
      >
        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--accent)] rounded-full" />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Timeline/Ruler.tsx
git commit -m "feat: add Ruler with time ticks and draggable playhead"
```

---

### Task 6: FormationTrack component

**Files:**
- Create: `droneai-studio/src/components/Timeline/FormationTrack.tsx`

The hero layer. Formation cards with color dots and transition blocks between them.

**Step 1: Create the component**

```tsx
// src/components/Timeline/FormationTrack.tsx
import { useState } from "react";
import type { TimelineEntry } from "./types";

interface FormationTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

function colorToCSS(color: { type: string; value?: number[]; start?: number[] }): string {
  const rgb = color.value || color.start || [1, 1, 1];
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

export default function FormationTrack({
  entries,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
}: FormationTrackProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalSeconds = totalFrames / fps;

  const timeToPct = (time: number) =>
    ((time / totalSeconds) * 100 * zoom) - scrollOffset;

  return (
    <div className="relative h-12 bg-[var(--bg-primary)]">
      {entries.map((entry, i) => {
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : entry.time + 2;
        const holdEnd = i < entries.length - 1
          ? entry.time + (nextTime - entry.time) * 0.7
          : totalSeconds;
        const left = timeToPct(entry.time);
        const width = timeToPct(holdEnd) - left;
        const shapeName = entry.formation.shape || entry.formation.type;

        return (
          <div key={i}>
            {/* Formation card */}
            <div
              className="absolute top-1 bottom-1 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col justify-center px-2 overflow-hidden cursor-default hover:border-[var(--accent)] transition-colors"
              style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <span className="text-[10px] text-[var(--text-primary)] font-medium truncate capitalize">
                {shapeName}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: colorToCSS(entry.color) }}
                />
                <span className="text-[9px] text-[var(--text-secondary)]">
                  {entry.time}s
                </span>
              </div>

              {/* Tooltip */}
              {hoveredIdx === i && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[10px] text-[var(--text-primary)] whitespace-nowrap z-20 shadow-lg">
                  {shapeName}
                  {entry.formation.params &&
                    Object.entries(entry.formation.params)
                      .map(([k, v]) => ` · ${k}: ${v}`)
                      .join("")}
                </div>
              )}
            </div>

            {/* Transition block */}
            {i < entries.length - 1 && (
              <div
                className="absolute top-3 bottom-3 flex items-center justify-center"
                style={{
                  left: `${timeToPct(holdEnd)}%`,
                  width: `${timeToPct(nextTime) - timeToPct(holdEnd)}%`,
                }}
              >
                <div className="w-full h-px bg-[var(--text-secondary)] opacity-30" />
                <span className="absolute text-[8px] text-[var(--text-secondary)] opacity-60 bg-[var(--bg-primary)] px-1">
                  {entries[i + 1].transition?.easing?.replace("_", " ") || "ease"}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Timeline/FormationTrack.tsx
git commit -m "feat: add FormationTrack with cards, color dots, transitions, tooltips"
```

---

### Task 7: ColorTrack, DroneCountTrack, SafetyStrip components

**Files:**
- Create: `droneai-studio/src/components/Timeline/ColorTrack.tsx`
- Create: `droneai-studio/src/components/Timeline/DroneCountTrack.tsx`
- Create: `droneai-studio/src/components/Timeline/SafetyStrip.tsx`

Three thin strip components. Simple enough to do in one task.

**Step 1: Create ColorTrack**

```tsx
// src/components/Timeline/ColorTrack.tsx
import type { TimelineEntry } from "./types";

interface ColorTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

function colorToCSS(c: { value?: number[]; start?: number[] }): string {
  const rgb = c.value || c.start || [1, 1, 1];
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

export default function ColorTrack({ entries, totalFrames, fps, zoom, scrollOffset }: ColorTrackProps) {
  const totalSeconds = totalFrames / fps;
  const timeToPct = (t: number) => ((t / totalSeconds) * 100 * zoom) - scrollOffset;

  // Build gradient stops
  const stops = entries.map((e) => `${colorToCSS(e.color)} ${timeToPct(e.time)}%`).join(", ");

  return (
    <div
      className="h-3 w-full"
      style={{ background: `linear-gradient(to right, ${stops})` }}
    />
  );
}
```

**Step 2: Create DroneCountTrack**

```tsx
// src/components/Timeline/DroneCountTrack.tsx

interface DroneCountTrackProps {
  droneCount: number;
}

export default function DroneCountTrack({ droneCount }: DroneCountTrackProps) {
  return (
    <div className="h-4 flex items-center px-3 bg-[var(--bg-primary)] border-b border-[var(--border)]">
      <span className="text-[9px] text-[var(--text-secondary)] font-mono">
        {droneCount} drones
      </span>
    </div>
  );
}
```

**Step 3: Create SafetyStrip**

```tsx
// src/components/Timeline/SafetyStrip.tsx
import type { SafetyReport } from "./types";

interface SafetyStripProps {
  safety: SafetyReport | null;
}

export default function SafetyStrip({ safety }: SafetyStripProps) {
  const isSafe = safety?.is_safe ?? true;
  const bgColor = isSafe ? "bg-green-900/40" : "bg-red-900/40";
  const label = safety
    ? isSafe
      ? `Safe · ${safety.min_spacing_found.toFixed(1)}m min · ${safety.max_velocity_found.toFixed(1)}m/s max`
      : `Violations · ${safety.min_spacing_found.toFixed(1)}m min spacing`
    : "No data";

  return (
    <div className={`h-3 flex items-center px-3 ${bgColor}`}>
      <span className="text-[8px] text-[var(--text-secondary)] font-mono">{label}</span>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/Timeline/ColorTrack.tsx src/components/Timeline/DroneCountTrack.tsx src/components/Timeline/SafetyStrip.tsx
git commit -m "feat: add ColorTrack, DroneCountTrack, SafetyStrip layers"
```

---

### Task 8: Minimap component

**Files:**
- Create: `droneai-studio/src/components/Timeline/Minimap.tsx`

Compressed overview showing formation blocks as colored rectangles with a viewport indicator.

**Step 1: Create the component**

```tsx
// src/components/Timeline/Minimap.tsx
import type { TimelineEntry } from "./types";

interface MinimapProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
  onNavigate: (scrollOffset: number) => void;
}

function colorToCSS(c: { value?: number[]; start?: number[] }): string {
  const rgb = c.value || c.start || [0.5, 0.5, 0.5];
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

export default function Minimap({
  entries,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
  onNavigate,
}: MinimapProps) {
  const totalSeconds = totalFrames / fps;
  const viewportWidthPct = (1 / zoom) * 100;
  const viewportLeftPct = (scrollOffset / (100 * zoom)) * 100;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPct = (e.clientX - rect.left) / rect.width;
    const newOffset = clickPct * 100 * zoom - viewportWidthPct / 2;
    onNavigate(Math.max(0, newOffset));
  };

  return (
    <div
      className="relative h-3 bg-[var(--bg-tertiary)] cursor-pointer"
      onClick={handleClick}
    >
      {/* Formation blocks */}
      {entries.map((entry, i) => {
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const left = (entry.time / totalSeconds) * 100;
        const width = ((nextTime - entry.time) / totalSeconds) * 100;
        return (
          <div
            key={i}
            className="absolute top-0.5 bottom-0.5 rounded-sm opacity-70"
            style={{
              left: `${left}%`,
              width: `${Math.max(width, 1)}%`,
              backgroundColor: colorToCSS(entry.color),
            }}
          />
        );
      })}

      {/* Viewport indicator */}
      {zoom > 1 && (
        <div
          className="absolute top-0 h-full border border-[var(--accent)] opacity-50 rounded-sm"
          style={{ left: `${viewportLeftPct}%`, width: `${viewportWidthPct}%` }}
        />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Timeline/Minimap.tsx
git commit -m "feat: add Minimap with formation blocks and viewport indicator"
```

---

### Task 9: TimelinePanel — main container

**Files:**
- Create: `droneai-studio/src/components/Timeline/TimelinePanel.tsx`
- Create: `droneai-studio/src/components/Timeline/index.ts`

Assembles all layers. Manages resize, collapse, zoom, scroll, and playback state.

**Step 1: Create TimelinePanel**

```tsx
// src/components/Timeline/TimelinePanel.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SceneData } from "../../types/scene";
import type { ShowInfo, TimelineLayerVisibility } from "./types";
import Minimap from "./Minimap";
import Ruler from "./Ruler";
import DroneCountTrack from "./DroneCountTrack";
import FormationTrack from "./FormationTrack";
import ColorTrack from "./ColorTrack";
import SafetyStrip from "./SafetyStrip";
import ControlsBar from "./ControlsBar";

interface TimelinePanelProps {
  sceneData: SceneData | null;
  showInfo: ShowInfo | null;
  blenderRunning: boolean;
  onFrameChange: (frame: number) => void;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 350;
const DEFAULT_HEIGHT = 160;

export default function TimelinePanel({
  sceneData,
  showInfo,
  blenderRunning,
  onFrameChange,
}: TimelinePanelProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [layers, setLayers] = useState<TimelineLayerVisibility>({
    minimap: true,
    droneCount: true,
    formations: true,
    color: true,
    safety: true,
  });

  const playRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fps = sceneData?.fps ?? 24;
  const totalFrames = sceneData?.frame_range?.[1] ?? 0;
  const hasShow = totalFrames > 0 && (sceneData?.drones?.length ?? 0) > 0;
  const spec = showInfo?.spec ?? null;
  const entries = spec?.timeline ?? [];

  // Clamp frame on new show
  useEffect(() => {
    if (totalFrames > 0 && currentFrame > totalFrames) {
      setCurrentFrame(0);
      onFrameChange(0);
    }
  }, [totalFrames, currentFrame, onFrameChange]);

  // Send frame to Blender (debounced)
  const sendFrame = useCallback(
    (frame: number) => {
      if (!blenderRunning) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        invoke("set_blender_frame", { frame }).catch(() => {});
      }, 50);
    },
    [blenderRunning]
  );

  // Seek handler
  const handleSeek = useCallback(
    (frame: number) => {
      setCurrentFrame(frame);
      onFrameChange(frame);
      sendFrame(frame);
    },
    [sendFrame, onFrameChange]
  );

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !hasShow) {
      if (playRef.current) cancelAnimationFrame(playRef.current);
      return;
    }
    let lastTime = performance.now();
    const step = (now: number) => {
      const dt = now - lastTime;
      if (dt >= 1000 / (fps * speed)) {
        lastTime = now;
        setCurrentFrame((prev) => {
          const next = prev >= totalFrames ? 0 : prev + 1;
          onFrameChange(next);
          sendFrame(next);
          return next;
        });
      }
      playRef.current = requestAnimationFrame(step);
    };
    playRef.current = requestAnimationFrame(step);
    return () => {
      if (playRef.current) cancelAnimationFrame(playRef.current);
    };
  }, [isPlaying, hasShow, sendFrame, onFrameChange, totalFrames, fps, speed]);

  // Zoom via mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(1, Math.min(10, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  // Resize drag handle
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH + delta)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [height]);

  const toggleLayer = (key: keyof TimelineLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!hasShow) {
    return (
      <div className="h-10 flex items-center justify-center bg-[var(--bg-secondary)] border-t border-[var(--border)]">
        <span className="text-xs text-[var(--text-secondary)]">No show loaded</span>
      </div>
    );
  }

  return (
    <div
      className="border-t border-[var(--border)] flex flex-col bg-[var(--bg-secondary)]"
      style={{ height }}
      onWheel={handleWheel}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize hover:bg-[var(--accent)]/30 transition-colors"
        onMouseDown={handleResizeStart}
      />

      {/* Layers */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {layers.minimap && (
          <Minimap
            entries={entries}
            totalFrames={totalFrames}
            fps={fps}
            zoom={zoom}
            scrollOffset={scrollOffset}
            onNavigate={setScrollOffset}
          />
        )}

        <Ruler
          totalFrames={totalFrames}
          currentFrame={currentFrame}
          fps={fps}
          zoom={zoom}
          scrollOffset={scrollOffset}
          onSeek={handleSeek}
        />

        {layers.droneCount && spec && (
          <DroneCountTrack droneCount={spec.drone_count} />
        )}

        {layers.formations && entries.length > 0 && (
          <FormationTrack
            entries={entries}
            totalFrames={totalFrames}
            fps={fps}
            zoom={zoom}
            scrollOffset={scrollOffset}
          />
        )}

        {layers.color && entries.length > 0 && (
          <ColorTrack
            entries={entries}
            totalFrames={totalFrames}
            fps={fps}
            zoom={zoom}
            scrollOffset={scrollOffset}
          />
        )}

        {layers.safety && (
          <SafetyStrip safety={showInfo?.safety ?? null} />
        )}
      </div>

      {/* Controls */}
      <ControlsBar
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        fps={fps}
        speed={speed}
        onSpeedChange={setSpeed}
        hasShow={hasShow}
        layers={layers}
        onToggleLayer={toggleLayer}
      />
    </div>
  );
}
```

**Step 2: Create index barrel**

```typescript
// src/components/Timeline/index.ts
export { default as TimelinePanel } from "./TimelinePanel";
```

**Step 3: Commit**

```bash
git add src/components/Timeline/
git commit -m "feat: add TimelinePanel — assembles all layers with resize, zoom, playback"
```

---

### Task 10: Wire into App.tsx

**Files:**
- Modify: `droneai-studio/src/App.tsx`

Replace `TimelineBar` with `TimelinePanel`. Add `useShowInfo` hook. Refresh show info after tool use completes.

**Step 1: Update imports and usage in App.tsx**

Replace:
```typescript
import TimelineBar from "./components/TimelineBar";
```
With:
```typescript
import { TimelinePanel } from "./components/Timeline";
import { useShowInfo } from "./hooks/useShowInfo";
```

Add hook:
```typescript
const { showInfo, refreshShowInfo } = useShowInfo();
```

In the `useEffect` that detects tool completion (the `prevToolRunning` one), also call `refreshShowInfo()`:
```typescript
useEffect(() => {
  if (prevToolRunning.current && !claude.isToolRunning) {
    setTimeout(() => {
      refreshScene();
      refreshShowInfo();
    }, 500);
  }
  prevToolRunning.current = claude.isToolRunning;
}, [claude.isToolRunning, refreshScene, refreshShowInfo]);
```

Replace the TimelineBar JSX:
```tsx
{/* Before */}
<div className="h-12 border-t border-[var(--border)]">
  <TimelineBar blenderRunning={blenderRunning} onFrameChange={setCurrentFrame} sceneData={sceneData} />
</div>

{/* After */}
<TimelinePanel
  sceneData={sceneData}
  showInfo={showInfo}
  blenderRunning={blenderRunning}
  onFrameChange={setCurrentFrame}
/>
```

Remove the fixed `h-12` wrapper div — `TimelinePanel` manages its own height.

**Step 2: Verify app runs**

Run: `cd droneai-studio && npm run build`
Expected: Compiles. No TypeScript errors.

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: replace TimelineBar with TimelinePanel in App"
```

---

### Task 11: Visual verification

**Step 1: Run the app**

```bash
cd droneai-studio && npm run tauri dev
```

**Step 2: Test**

1. App opens → timeline shows "No show loaded" (bug fix verified)
2. Launch Blender → Connect Claude → build a show
3. Timeline populates: minimap, ruler, formation cards, color gradient, safety strip
4. Scrub playhead → viewport updates
5. Play button → playback at 1x
6. Click speed → cycles 0.5x/1x/2x
7. Mouse wheel → zoom in/out, minimap shows viewport
8. Click layer toggles → layers show/hide
9. Drag top edge → resize timeline height

**Step 3: Fix any visual issues and commit**

```bash
git commit -m "fix: timeline visual adjustments"
```
