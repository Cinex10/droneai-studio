# Real-Time Embedded 3D Viewport Design

**Date:** 2026-02-23
**Status:** Approved
**Scope:** Replace Blender's external viewport with an embedded Three.js real-time renderer

## Problem

The current architecture runs Blender as a visible separate window and attempts to position it alongside the Tauri app. This fails because:
- macOS does not support cross-app window reparenting with OpenGL/Metal contexts
- Screenshot polling (2s interval) is not real-time
- Users must install Blender separately
- The viewport shows a broken thumbnail instead of a live 3D view

## Decision

Replace Blender's visible viewport with **Three.js / React Three Fiber** rendering directly inside the Tauri webview. Blender continues running headlessly as the scene backend, controlled by Claude via MCP.

### Why Not Modify Blender Source?

Research confirmed Blender's viewport cannot be extracted:
- GHOST (window system) creates its own native windows and GPU contexts with no API for external rendering surfaces
- EEVEE is not modularized (unlike Cycles) and cannot function standalone
- The Metal swap chain on macOS is entirely internal to `GHOST_ContextCGL`
- Forking Blender to strip the viewport would require maintaining a massive custom fork

### Why Three.js?

- Renders in the existing React webview (no new window or process)
- InstancedMesh handles 100+ drones in a single draw call at 60fps
- React Three Fiber integrates naturally with the existing React frontend
- Orbit controls, selection, bloom postprocessing available via @react-three/drei
- 2-4 week implementation vs. 4-8 weeks for Bevy or 6-10 for custom wgpu

## Architecture

```
User types -> Claude -> bpy (headless Blender, bundled)
                              |
                       TCP socket (9876)
                              |
                      get_scene_data()
                              |
                    Tauri event: "scene-updated"
                              |
                  Three.js / React Three Fiber
                 [orbit] [zoom] [select] [bloom]
                 |---- embedded in same window ----|
```

### Data Flow

1. Claude executes bpy code via MCP (`execute_blender_code`)
2. After each tool use, Rust backend queries Blender for scene state
3. Scene data (drone positions, colors, keyframes) sent as JSON
4. Frontend receives Tauri event, updates Three.js scene
5. Three.js renders at 60fps with interpolated animations

## Scene Data Protocol

### Request

Rust backend sends to Blender TCP socket (port 9876):
```json
{"type": "execute_code", "params": {"code": "<extraction script>"}}
```

### Response

```json
{
  "frame_range": [0, 1440],
  "fps": 24,
  "drones": [
    {
      "name": "Drone_001",
      "position": [3.0, 0.0, 10.0],
      "color": [1.0, 0.0, 0.0, 1.0],
      "emission_strength": 5.0,
      "keyframes": {
        "location": [
          {"frame": 0, "value": [0.0, 0.0, 0.0]},
          {"frame": 48, "value": [3.0, 0.0, 10.0]}
        ],
        "color": [
          {"frame": 0, "value": [1.0, 1.0, 1.0, 1.0]},
          {"frame": 48, "value": [1.0, 0.0, 0.0, 1.0]}
        ]
      }
    }
  ]
}
```

### Extraction Script (runs in Blender)

Iterates the "Drones" collection, reads each drone's:
- Current location
- Emission node color + strength
- All location keyframes from fcurves
- All color keyframes from fcurves

## Three.js Viewport Component

### Technology Stack

- `@react-three/fiber` — React renderer for Three.js
- `@react-three/drei` — OrbitControls, Grid, etc.
- `@react-three/postprocessing` — Bloom effect for LED glow

### Scene Composition

- **Background:** Dark sky (#010102)
- **Ground:** GridHelper with subtle lines
- **Drones:** Single InstancedMesh (UV spheres, radius 0.15) with MeshStandardMaterial(emissive). One draw call for all drones.
- **Bloom:** EffectComposer with Bloom for emissive glow
- **Controls:** OrbitControls for camera manipulation
- **Selection:** Raycaster on click, outline effect on selected drone

### Animation

The timeline bar controls `currentFrame`. For each frame, Three.js:
1. Finds the surrounding keyframes for each drone
2. Interpolates position and color using Bezier curves
3. Updates InstancedMesh matrices and colors

This mirrors Blender's Bezier keyframe interpolation.

### Performance

- InstancedMesh: 100 spheres = 1 draw call
- Bloom: ~2ms per frame
- Expected: 60fps at 1080p with 100 drones

## Sync Trigger

**Event-driven:** After every Claude response that includes tool_use, the Rust backend:
1. Detects tool completion from the stream-json output
2. Calls `get_scene_data()` via TCP socket
3. Emits `"scene-updated"` Tauri event with the JSON payload
4. Frontend Three.js component re-renders

No polling. Updates only when Claude changes the scene.

## Blender Bundling (Phase 2)

For initial implementation: continue using installed Blender.

For production bundling:
- Build Blender with `WITH_PYTHON_MODULE=ON` + `WITH_HEADLESS=ON`
- Ship binary inside `DroneAI Studio.app/Contents/Resources/blender/`
- Launch: `<bundled-blender> --background --python blender_startup.py`
- App size increase: ~150-200MB
- MCP addon works unchanged (pure Python, TCP socket)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/DroneViewport.tsx` | CREATE | Three.js viewport with R3F |
| `src/components/BlenderViewport.tsx` | DELETE | Remove screenshot-based viewport |
| `src/hooks/useSceneData.ts` | CREATE | Listen for scene-updated events |
| `src-tauri/src/commands.rs` | MODIFY | Add get_scene_data command |
| `src-tauri/src/lib.rs` | MODIFY | Register new command |
| `src/App.tsx` | MODIFY | Wire DroneViewport + useSceneData |
| `src/components/TimelineBar.tsx` | MODIFY | Drive Three.js animation frame |
| `package.json` | MODIFY | Add three, r3f, drei, postprocessing |

## NPM Dependencies

```
@react-three/fiber
@react-three/drei
@react-three/postprocessing
three
@types/three
```

## Success Criteria

1. User sees 60fps 3D viewport embedded in the app window
2. Orbit/zoom/pan with mouse
3. Drones appear as glowing spheres after Claude creates them
4. Timeline scrubbing animates drone positions smoothly
5. Click to select individual drones
6. No separate Blender window visible to the user
