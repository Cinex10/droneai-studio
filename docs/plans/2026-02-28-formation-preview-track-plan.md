# Formation Preview Track Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new timeline layer that renders mini Three.js thumbnails of each formation from the audience's front view, giving instant visual previews of drone arrangements.

**Architecture:** Create `FormationPreviewTrack.tsx` using an offscreen `WebGLRenderer` to render drone positions as colored spheres from a front-facing orthographic camera. Extract the shared `interpolateKeyframes` utility. Wire the new track into `TimelinePanel` between Ruler and FormationTrack with its own toggle and gutter label.

**Tech Stack:** React, TypeScript, Three.js (offscreen WebGLRenderer, OrthographicCamera), Tailwind CSS

---

### Task 1: Extract interpolateKeyframes to Shared Utility

**Files:**
- Create: `droneai-studio/src/utils/interpolate.ts`
- Modify: `droneai-studio/src/components/DroneViewport.tsx:44-64`

**Step 1: Create the utility file**

Create `droneai-studio/src/utils/interpolate.ts`:

```typescript
/** Interpolate a value at a given frame from a sorted keyframe array */
export function interpolateKeyframes(
  keyframes: { frame: number; value: number[] }[],
  frame: number,
  fallback: number[]
): number[] {
  if (keyframes.length === 0) return fallback;
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  if (frame >= keyframes[keyframes.length - 1].frame)
    return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const t = (frame - a.frame) / (b.frame - a.frame);
      return a.value.map((v, j) => v + (b.value[j] - v) * t);
    }
  }
  return fallback;
}
```

**Step 2: Update DroneViewport.tsx to import from utility**

In `droneai-studio/src/components/DroneViewport.tsx`, delete the local `interpolateKeyframes` function (lines 44-64) and replace with an import at the top of the file:

```typescript
import { interpolateKeyframes } from "../utils/interpolate";
```

Remove these lines (44-64):
```typescript
/** Interpolate drone position/color at a given frame from keyframes */
function interpolateKeyframes(
  keyframes: { frame: number; value: number[] }[],
  frame: number,
  fallback: number[]
): number[] {
  // ... entire function body ...
}
```

**Step 3: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds — DroneViewport still works, just imports from a new location

**Step 4: Commit**

```bash
git add droneai-studio/src/utils/interpolate.ts droneai-studio/src/components/DroneViewport.tsx
git commit -m "refactor: extract interpolateKeyframes to shared utility"
```

---

### Task 2: Add `preview` to TimelineLayerVisibility

**Files:**
- Modify: `droneai-studio/src/components/Timeline/types.ts:56-62`

**Step 1: Add preview field**

In `droneai-studio/src/components/Timeline/types.ts`, change `TimelineLayerVisibility` from:

```typescript
export interface TimelineLayerVisibility {
  minimap: boolean;
  droneCount: boolean;
  formations: boolean;
  color: boolean;
  safety: boolean;
}
```

to:

```typescript
export interface TimelineLayerVisibility {
  minimap: boolean;
  droneCount: boolean;
  preview: boolean;
  formations: boolean;
  color: boolean;
  safety: boolean;
}
```

**Step 2: Update TimelinePanel default state**

In `droneai-studio/src/components/Timeline/TimelinePanel.tsx`, find the `useState` for `layers` (line 34-40) and add `preview: true`:

Change:
```typescript
  const [layers, setLayers] = useState<TimelineLayerVisibility>({
    minimap: true,
    droneCount: true,
    formations: true,
    color: true,
    safety: true,
  });
```

to:
```typescript
  const [layers, setLayers] = useState<TimelineLayerVisibility>({
    minimap: true,
    droneCount: true,
    preview: true,
    formations: true,
    color: true,
    safety: true,
  });
```

**Step 3: Add "V" toggle to ControlsBar**

In `droneai-studio/src/components/Timeline/ControlsBar.tsx`, find the `layerKeys` array (line 46-49) and add the preview toggle:

Change:
```typescript
  const layerKeys: { key: keyof TimelineLayerVisibility; label: string }[] = [
    { key: "formations", label: "F" },
    { key: "color", label: "C" },
  ];
```

to:
```typescript
  const layerKeys: { key: keyof TimelineLayerVisibility; label: string }[] = [
    { key: "preview", label: "V" },
    { key: "formations", label: "F" },
    { key: "color", label: "C" },
  ];
```

**Step 4: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add droneai-studio/src/components/Timeline/types.ts droneai-studio/src/components/Timeline/TimelinePanel.tsx droneai-studio/src/components/Timeline/ControlsBar.tsx
git commit -m "feat: add preview layer toggle to timeline"
```

---

### Task 3: Create FormationPreviewTrack Component

**Files:**
- Create: `droneai-studio/src/components/Timeline/FormationPreviewTrack.tsx`

**Step 1: Create the component**

Create `droneai-studio/src/components/Timeline/FormationPreviewTrack.tsx`:

```typescript
import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import type { SceneData } from "../../types/scene";
import type { TimelineEntry } from "./types";
import { interpolateKeyframes } from "../../utils/interpolate";

interface FormationPreviewTrackProps {
  entries: TimelineEntry[];
  sceneData: SceneData;
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

const THUMB_W = 64;
const THUMB_H = 48;

/** Render a single formation thumbnail using offscreen Three.js */
function renderThumbnail(
  renderer: THREE.WebGLRenderer,
  sceneData: SceneData,
  entryTime: number,
  fps: number,
  entryColor: { type: string; value?: number[]; start?: number[] }
): string {
  const frame = Math.round(entryTime * fps);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);

  // Collect drone positions and colors at this frame
  const positions: THREE.Vector3[] = [];
  const colors: THREE.Color[] = [];

  for (const drone of sceneData.drones) {
    const pos = interpolateKeyframes(drone.keyframes.location, frame, drone.position as number[]);
    const col = interpolateKeyframes(drone.keyframes.color, frame, drone.color as number[]);

    // Blender Z-up → Three.js Y-up: (x, z, -y)
    const v = new THREE.Vector3(pos[0], pos[2], -pos[1]);
    positions.push(v);
    colors.push(new THREE.Color(col[0], col[1], col[2]));
  }

  if (positions.length === 0) {
    // Empty — return blank
    renderer.render(scene, new THREE.OrthographicCamera());
    return renderer.domElement.toDataURL("image/png");
  }

  // Add spheres
  const geo = new THREE.SphereGeometry(0.15, 8, 8);
  for (let i = 0; i < positions.length; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: colors[i] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(positions[i]);
    scene.add(mesh);
  }

  // Compute bounding box in XY (front view)
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Add padding
  const padX = (maxX - minX) * 0.15 + 0.5;
  const padY = (maxY - minY) * 0.15 + 0.5;
  minX -= padX; maxX += padX;
  minY -= padY; maxY += padY;

  // Maintain aspect ratio to fit THUMB_W x THUMB_H
  const aspect = THUMB_W / THUMB_H;
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const bboxAspect = bboxW / bboxH;

  let left, right, top, bottom;
  if (bboxAspect > aspect) {
    // Wider — fit width, expand height
    left = minX; right = maxX;
    const centerY = (minY + maxY) / 2;
    const halfH = bboxW / aspect / 2;
    bottom = centerY - halfH; top = centerY + halfH;
  } else {
    // Taller — fit height, expand width
    bottom = minY; top = maxY;
    const centerX = (minX + maxX) / 2;
    const halfW = bboxH * aspect / 2;
    left = centerX - halfW; right = centerX + halfW;
  }

  // Front view camera: looking from +Z toward -Z
  const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 1000);
  const centerZ = 0;
  for (const p of positions) {
    if (p.z > centerZ) { /* find front */ }
  }
  camera.position.set((left + right) / 2, (top + bottom) / 2, 50);
  camera.lookAt((left + right) / 2, (top + bottom) / 2, 0);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  // Cleanup
  geo.dispose();
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      (obj.material as THREE.Material).dispose();
    }
  });

  return dataUrl;
}

export default function FormationPreviewTrack({
  entries,
  sceneData,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
}: FormationPreviewTrackProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const lastSpecRef = useRef<string>("");

  const totalSeconds = totalFrames / fps;
  const timeToPct = (time: number) =>
    ((time / totalSeconds) * 100 * zoom) - scrollOffset;

  // Generate thumbnails when data changes
  const generateThumbnails = useCallback(() => {
    if (!sceneData || sceneData.drones.length === 0 || entries.length === 0) return;

    // Check if we already generated for this data
    const specKey = `${entries.length}-${entries.map(e => `${e.time}-${e.formation.shape}`).join(",")}`;
    if (specKey === lastSpecRef.current) return;
    lastSpecRef.current = specKey;

    // Create renderer if needed
    if (!rendererRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      rendererRef.current.setSize(THUMB_W, THUMB_H);
    }

    const newThumbs = new Map<number, string>();
    for (let i = 0; i < entries.length; i++) {
      const url = renderThumbnail(
        rendererRef.current,
        sceneData,
        entries[i].time,
        fps,
        entries[i].color
      );
      newThumbs.set(i, url);
    }
    setThumbnails(newThumbs);
  }, [sceneData, entries, fps]);

  useEffect(() => {
    generateThumbnails();
  }, [generateThumbnails]);

  // Dispose renderer on unmount
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  return (
    <div className="tl-track tl-track-preview" style={{ background: "var(--bg-primary)" }}>
      {entries.map((entry, i) => {
        const hold = entry.hold ?? 0;
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const formEnd = hold > 0 ? entry.time + hold : Math.min(entry.time + 1.5, nextTime);
        const formLeft = timeToPct(entry.time);
        const formWidth = timeToPct(formEnd) - formLeft;
        const shapeName = entry.formation.shape || entry.formation.type;
        const thumbUrl = thumbnails.get(i);

        return (
          <div
            key={i}
            className="tl-preview-card"
            style={{
              left: `${formLeft}%`,
              width: `${formWidth}%`,
            }}
          >
            {/* Thumbnail image */}
            <div className="tl-preview-thumb">
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={shapeName}
                  className="tl-preview-img"
                  draggable={false}
                />
              ) : (
                <div className="tl-preview-placeholder" />
              )}
            </div>
            {/* Formation name */}
            <span className="tl-preview-name">{shapeName}</span>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds (component exists but isn't imported yet)

**Step 3: Commit**

```bash
git add droneai-studio/src/components/Timeline/FormationPreviewTrack.tsx
git commit -m "feat: create FormationPreviewTrack with offscreen Three.js thumbnails"
```

---

### Task 4: Wire FormationPreviewTrack into TimelinePanel

**Files:**
- Modify: `droneai-studio/src/components/Timeline/TimelinePanel.tsx`

**Step 1: Add import**

At the top of `droneai-studio/src/components/Timeline/TimelinePanel.tsx`, add:

```typescript
import FormationPreviewTrack from "./FormationPreviewTrack";
```

**Step 2: Add preview track between Ruler and FormationTrack**

In the track lanes area (around line 198-231), insert the preview track between the Ruler and FormationTrack blocks. Find:

```typescript
          {/* Formation track */}
          {layers.formations && entries.length > 0 && (
            <FormationTrack
```

Insert **above** it:

```typescript
          {/* Formation preview track */}
          {layers.preview && entries.length > 0 && sceneData && (
            <FormationPreviewTrack
              entries={entries}
              sceneData={sceneData}
              totalFrames={totalFrames}
              fps={fps}
              zoom={zoom}
              scrollOffset={scrollOffset}
            />
          )}

```

**Step 3: Add gutter label for preview track**

In the gutter section (around line 178-195), find the FormationTrack gutter label:

```typescript
          {/* Formation label — must match .tl-track flex sizing */}
          {layers.formations && entries.length > 0 && (
            <div className="tl-gutter-label tl-gutter-label-form">
```

Insert **above** it:

```typescript
          {/* Preview label */}
          {layers.preview && entries.length > 0 && (
            <div className="tl-gutter-label tl-gutter-label-preview">
              <span className="tl-gutter-icon">⊡</span>
              <span className="tl-gutter-text">Preview</span>
            </div>
          )}
```

**Step 4: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add droneai-studio/src/components/Timeline/TimelinePanel.tsx
git commit -m "feat: wire FormationPreviewTrack into TimelinePanel"
```

---

### Task 5: Add Preview Track CSS Styles

**Files:**
- Modify: `droneai-studio/src/globals.css`

**Step 1: Add styles**

Append the following CSS after the `.tl-color-block` section (after line 935) in `droneai-studio/src/globals.css`:

```css
/* ---- Formation Preview Track ---- */

.tl-track-preview {
  flex: 0 0 48px;
  min-height: 48px;
  max-height: 48px;
}

.tl-gutter-label-preview {
  flex: 0 0 48px;
  height: 48px;
}

.tl-preview-card {
  position: absolute;
  top: 2px;
  bottom: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  overflow: hidden;
  min-width: 24px;
  transition: border-color 0.2s;
}

.tl-preview-card:hover {
  border-color: var(--accent);
}

.tl-preview-thumb {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(var(--overlay-rgb), 0.04);
}

.tl-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: auto;
}

.tl-preview-placeholder {
  width: 100%;
  height: 100%;
  background: rgba(var(--overlay-rgb), 0.06);
  border-radius: 3px;
}

.tl-preview-name {
  font-size: 8px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1;
  flex-shrink: 0;
}
```

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add droneai-studio/src/globals.css
git commit -m "feat: add formation preview track CSS styles"
```

---

### Task 6: Visual Polish

**Files:**
- Modify: `droneai-studio/src/components/Timeline/FormationPreviewTrack.tsx`
- Modify: `droneai-studio/src/globals.css`

**Step 1: Use /frontend-design skill**

Invoke `/frontend-design` to refine the preview track visuals. Requirements:

- Component: `droneai-studio/src/components/Timeline/FormationPreviewTrack.tsx`
- Styles: bottom of `droneai-studio/src/globals.css` (`.tl-preview-*` section)
- Theme: CSS variables (`--bg-primary`, `--bg-secondary`, `--text-secondary`, `--accent`, `--border`, `--overlay-rgb`)
- Must work in dark and light modes
- Goal: thumbnail cards should feel premium — subtle glow on the thumbnail border matching the formation's LED color, smooth hover transitions
- The offscreen render background should match the app's dark bg (`#0a0a12`) in dark mode — consider making it slightly lighter for contrast
- Keep functional logic unchanged — only enhance visual presentation

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add droneai-studio/src/components/Timeline/FormationPreviewTrack.tsx droneai-studio/src/globals.css
git commit -m "feat: polish formation preview track visuals"
```

---

### Task 7: Build Verification and Visual Test

**Step 1: Full build check**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds with zero errors

**Step 2: E2E walkthrough**

Run: `cd droneai-studio && npm run tauri dev`

Test the full flow:
1. Open or create a project → loading screen → workspace
2. Send a chat message to create a show with multiple formations (e.g., "Create a show with a circle, then a heart, then a grid")
3. Wait for show to build (timeline appears)
4. **Verify Preview Track appears** above the Formation Track with thumbnail cards
5. **Verify thumbnails** show drone positions from front view with correct colors
6. **Verify "V" toggle** in ControlsBar hides/shows the preview track
7. **Verify gutter label** "Preview" appears on the left
8. **Zoom** — thumbnails should stay aligned with formation cards below
9. **Light mode** — toggle theme, verify thumbnails still render correctly
10. **New show** — send another message to create a different show, verify thumbnails regenerate

**Step 3: Commit if any fixes needed**

```bash
git add -u droneai-studio/src/
git commit -m "fix: formation preview track adjustments from testing"
```
