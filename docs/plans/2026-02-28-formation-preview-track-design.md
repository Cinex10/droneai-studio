# Formation Preview Track Design

**Date:** 2026-02-28
**Status:** Approved

## Summary

Add a new timeline layer — FormationPreviewTrack — that renders mini Three.js thumbnails of each formation from the audience's front view. Sits above the existing FormationTrack as a separate, toggleable layer. Each formation gets a small offscreen render showing drone positions as colored dots, giving an instant visual preview of what the formation looks like.

## New Component: FormationPreviewTrack

**File:** `droneai-studio/src/components/Timeline/FormationPreviewTrack.tsx`

A timeline track that renders one thumbnail card per formation entry, aligned to the formation's time position. Each card contains:
- A 64x48px thumbnail image of the formation (front view, colored dots)
- The formation name below the thumbnail

**Track height:** 48px, toggleable via "V" button in ControlsBar.

## Thumbnail Generation

**Approach:** Offscreen Three.js render using a shared `WebGLRenderer`.

**Renderer:**
- `new THREE.WebGLRenderer({ antialias: true, alpha: true })` at 64x48px
- Created once (via `useRef`), reused for all formations, disposed on unmount

**Per-formation render:**
1. Get the formation's arrival frame: `Math.round(entry.time * fps)`
2. Interpolate each drone's position and color at that frame using `interpolateKeyframes` (exported from `DroneViewport.tsx`)
3. Create a `THREE.Scene` with black background
4. For each drone: `SphereGeometry(0.15)` + `MeshBasicMaterial({ color })` — no lights needed
5. Convert Blender Z-up to Three.js Y-up: `(x, z, -y)`
6. Auto-fit an `OrthographicCamera` looking from front (+Z direction) to the formation bounding box with padding
7. Render and export: `renderer.domElement.toDataURL("image/png")`

**Camera:** `OrthographicCamera` facing from front. Frustum auto-computed from the XY bounding box (Three.js coords) of all drone positions, with 10% padding.

## Caching

- Cache key: `${formationIndex}-${entry.time}-${entry.formation.shape}-${sceneDataRef}`
- Store as `Map<string, string>` (key → data URL) in `useRef`
- Invalidate when `showInfo` or `sceneData` identity changes (new object = new show build)
- Generate all thumbnails in a single batch: loop through entries, render each, store data URL

## Data Flow

```
SceneData.drones[].keyframes.location  →  interpolate at entry.time * fps  →  3D positions
SceneData.drones[].keyframes.color     →  interpolate at entry.time * fps  →  RGB colors
                                          ↓
                                   Offscreen Three.js render (front view)
                                          ↓
                                   data:image/png URL → <img> in track
```

**Props:**
```typescript
interface FormationPreviewTrackProps {
  entries: TimelineEntry[];
  sceneData: SceneData;
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}
```

## TimelinePanel Integration

**Layout order (top to bottom):**
```
Ruler (24px)
FormationPreviewTrack (48px)  ← NEW
FormationTrack (24px)
ColorTrack (20px)
```

**Gutter:** New label row "Preview" with a camera icon, placed above the "Form" label.

**Layer toggle:** Add `preview: boolean` to `TimelineLayerVisibility`. ControlsBar gets "V" toggle. Defaults to `true`.

**Data:** TimelinePanel already receives `sceneData` — pass it through to FormationPreviewTrack.

## Export interpolateKeyframes

The `interpolateKeyframes` function currently lives inside `DroneViewport.tsx` (lines 45-64). Extract it to a shared utility so both the viewport and the preview track can use it.

**Move to:** `droneai-studio/src/utils/interpolate.ts`

## Stack Impact

| File | Change |
|------|--------|
| `FormationPreviewTrack.tsx` | **Create** — thumbnail track with offscreen Three.js renderer |
| `utils/interpolate.ts` | **Create** — extracted `interpolateKeyframes` utility |
| `DroneViewport.tsx` | Import `interpolateKeyframes` from utils instead of local definition |
| `TimelinePanel.tsx` | Import + render FormationPreviewTrack, add gutter label, pass sceneData |
| `ControlsBar.tsx` | Add "V" toggle for preview layer |
| `types.ts` | Add `preview: boolean` to `TimelineLayerVisibility` |
| `globals.css` | Add `.tl-preview-*` styles for thumbnail cards |

## What's NOT in Scope

- Editable formation names (future feature)
- Drag-to-reorder formations on the timeline
- Animated thumbnails (they are static snapshots)
- Thumbnail for transition states (only formation hold positions)
