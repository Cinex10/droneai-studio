# Three.js Real-Time Viewport Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the screenshot-based Blender viewport with a real-time Three.js 3D viewport embedded in the Tauri webview, synced with headless Blender via event-driven scene data extraction.

**Architecture:** Claude controls headless Blender via MCP. After each tool use, Rust backend extracts scene data (drone positions, colors, keyframes) from Blender via TCP socket, emits Tauri event. React Three Fiber renders the scene at 60fps with orbit controls, selection, and bloom.

**Tech Stack:** React Three Fiber, @react-three/drei, @react-three/postprocessing, Three.js, existing Tauri/Rust backend, existing Blender MCP addon on port 9876.

---

### Task 1: Install Three.js dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install npm packages**

Run:
```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install -D @types/three
```

**Step 2: Verify install**

Run: `npx tsc --noEmit`
Expected: PASS (no new type errors)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add three.js, react-three-fiber, drei, postprocessing"
```

---

### Task 2: Create scene data types and hook

**Files:**
- Create: `src/types/scene.ts`
- Create: `src/hooks/useSceneData.ts`

**Step 1: Create scene data types**

Create `src/types/scene.ts`:
```typescript
export interface Keyframe {
  frame: number;
  value: number[];
}

export interface DroneData {
  name: string;
  position: [number, number, number];
  color: [number, number, number, number];
  emission_strength: number;
  keyframes: {
    location: Keyframe[];
    color: Keyframe[];
  };
}

export interface SceneData {
  frame_range: [number, number];
  fps: number;
  drones: DroneData[];
}
```

**Step 2: Create useSceneData hook**

Create `src/hooks/useSceneData.ts`:
```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SceneData } from "../types/scene";

export function useSceneData() {
  const [sceneData, setSceneData] = useState<SceneData | null>(null);

  useEffect(() => {
    const unlisten = listen<string>("scene-updated", (event) => {
      try {
        const data: SceneData = JSON.parse(event.payload);
        setSceneData(data);
      } catch (e) {
        console.error("Failed to parse scene data:", e);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const refreshScene = useCallback(async () => {
    try {
      const json = await invoke<string>("get_scene_data");
      const data: SceneData = JSON.parse(json);
      setSceneData(data);
    } catch (e) {
      console.error("Failed to get scene data:", e);
    }
  }, []);

  return { sceneData, refreshScene };
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/types/scene.ts src/hooks/useSceneData.ts
git commit -m "feat: add scene data types and useSceneData hook"
```

---

### Task 3: Add get_scene_data Rust command

**Files:**
- Modify: `src-tauri/src/commands.rs` (add `get_scene_data` command)
- Modify: `src-tauri/src/lib.rs` (register command)

**Step 1: Add the Python extraction script as a const and the command**

Add to `src-tauri/src/commands.rs` at the end:

```rust
const SCENE_EXTRACT_SCRIPT: &str = r#"
import bpy, json

drones = []
coll = bpy.data.collections.get("Drones")
if coll:
    for obj in coll.objects:
        drone = {
            "name": obj.name,
            "position": list(obj.location),
            "color": [1.0, 1.0, 1.0, 1.0],
            "emission_strength": 5.0,
            "keyframes": {"location": [], "color": []}
        }
        # Get emission color from material
        if obj.data and obj.data.materials:
            mat = obj.data.materials[0]
            if mat and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'EMISSION':
                        c = node.inputs['Color'].default_value
                        drone["color"] = [c[0], c[1], c[2], c[3]]
                        drone["emission_strength"] = node.inputs['Strength'].default_value
                        break
        # Get location keyframes
        if obj.animation_data and obj.animation_data.action:
            for fc in obj.animation_data.action.fcurves:
                if fc.data_path == "location" and fc.array_index == 0:
                    # Get all X keyframes, then build [x,y,z] per frame
                    pass
            # Simpler: get keyframes per-channel and merge
            loc_frames = {}
            color_frames = {}
            for fc in obj.animation_data.action.fcurves:
                if fc.data_path == "location":
                    idx = fc.array_index
                    for kp in fc.keyframe_points:
                        f = int(kp.co[0])
                        if f not in loc_frames:
                            loc_frames[f] = [0.0, 0.0, 0.0]
                        loc_frames[f][idx] = kp.co[1]
            for f in sorted(loc_frames.keys()):
                drone["keyframes"]["location"].append({"frame": f, "value": loc_frames[f]})
            # Get color keyframes from material
            if obj.data and obj.data.materials:
                mat = obj.data.materials[0]
                if mat and mat.node_tree and mat.node_tree.animation_data and mat.node_tree.animation_data.action:
                    for fc in mat.node_tree.animation_data.action.fcurves:
                        if "Color" in fc.data_path:
                            idx = fc.array_index
                            for kp in fc.keyframe_points:
                                f = int(kp.co[0])
                                if f not in color_frames:
                                    color_frames[f] = [1.0, 1.0, 1.0, 1.0]
                                color_frames[f][idx] = kp.co[1]
                    for f in sorted(color_frames.keys()):
                        drone["keyframes"]["color"].append({"frame": f, "value": color_frames[f]})
        drones.append(drone)

scene = bpy.context.scene
result = json.dumps({
    "frame_range": [scene.frame_start, scene.frame_end],
    "fps": scene.render.fps,
    "drones": drones
})
result
"#;

#[tauri::command]
pub fn get_scene_data() -> Result<String, String> {
    let payload = serde_json::json!({
        "type": "execute_code",
        "params": { "code": SCENE_EXTRACT_SCRIPT }
    });
    let resp = blender_mcp_call(&payload)?;

    // The execute_code handler returns {"result": "<json string>"}
    if let Some(result) = resp.get("result") {
        if let Some(s) = result.as_str() {
            return Ok(s.to_string());
        }
        return Ok(result.to_string());
    }
    if let Some(err) = resp.get("error") {
        return Err(format!("Blender error: {}", err));
    }
    Ok(resp.to_string())
}
```

**Step 2: Register in lib.rs**

Add `commands::get_scene_data,` to the `generate_handler!` macro in `src-tauri/src/lib.rs`.

**Step 3: Verify Rust compiles**

Run:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo check
```
Expected: Compiles with only pre-existing embed.rs warnings.

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add get_scene_data command for Three.js viewport sync"
```

---

### Task 4: Create the DroneViewport Three.js component

**Files:**
- Create: `src/components/DroneViewport.tsx`

**Step 1: Create the component**

Create `src/components/DroneViewport.tsx`:
```tsx
import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { SceneData, DroneData } from "../types/scene";

interface DroneViewportProps {
  sceneData: SceneData | null;
  currentFrame: number;
}

/** Interpolate drone position/color at a given frame from keyframes */
function interpolateKeyframes(
  keyframes: { frame: number; value: number[] }[],
  frame: number,
  fallback: number[]
): number[] {
  if (keyframes.length === 0) return fallback;
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  if (frame >= keyframes[keyframes.length - 1].frame)
    return keyframes[keyframes.length - 1].value;

  // Find surrounding keyframes
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

/** InstancedMesh renderer for all drones */
function DroneSwarm({
  drones,
  currentFrame,
}: {
  drones: DroneData[];
  currentFrame: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorArr = useMemo(
    () => new Float32Array(Math.max(drones.length, 1) * 3),
    [drones.length]
  );

  useFrame(() => {
    if (!meshRef.current || drones.length === 0) return;

    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const pos = interpolateKeyframes(
        d.keyframes.location,
        currentFrame,
        d.position
      );
      const col = interpolateKeyframes(
        d.keyframes.color,
        currentFrame,
        d.color
      );

      dummy.position.set(pos[0], pos[2], -pos[1]); // Blender Z-up -> Three.js Y-up
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      colorArr[i * 3] = col[0];
      colorArr[i * 3 + 1] = col[1];
      colorArr[i * 3 + 2] = col[2];
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.geometry.setAttribute(
      "color",
      new THREE.InstancedBufferAttribute(colorArr, 3)
    );
  });

  if (drones.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, drones.length]}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial
        emissive="white"
        emissiveIntensity={5}
        toneMapped={false}
        vertexColors
      />
    </instancedMesh>
  );
}

/** Main viewport scene content */
function SceneContent({
  sceneData,
  currentFrame,
}: {
  sceneData: SceneData | null;
  currentFrame: number;
}) {
  return (
    <>
      <color attach="background" args={["#010102"]} />
      <ambientLight intensity={0.1} />

      <Grid
        args={[100, 100]}
        cellSize={2}
        cellColor="#1a1a2e"
        sectionSize={10}
        sectionColor="#2a2a4e"
        fadeDistance={80}
        position={[0, 0, 0]}
      />

      {sceneData && (
        <DroneSwarm drones={sceneData.drones} currentFrame={currentFrame} />
      )}

      <OrbitControls
        makeDefault
        target={[0, 10, 0]}
        maxPolarAngle={Math.PI * 0.85}
      />

      <EffectComposer>
        <Bloom
          intensity={1.5}
          luminanceThreshold={0.5}
          luminanceSmoothing={0.9}
        />
      </EffectComposer>
    </>
  );
}

export default function DroneViewport({
  sceneData,
  currentFrame,
}: DroneViewportProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 20, 40], fov: 50 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <SceneContent sceneData={sceneData} currentFrame={currentFrame} />
      </Canvas>
    </div>
  );
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/DroneViewport.tsx
git commit -m "feat: add Three.js DroneViewport with InstancedMesh and bloom"
```

---

### Task 5: Wire DroneViewport into App.tsx and remove BlenderViewport

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TimelineBar.tsx` (expose currentFrame via callback)

**Step 1: Update App.tsx**

Replace `BlenderViewport` import with `DroneViewport`. Add `useSceneData` hook. Pass `currentFrame` state between TimelineBar and DroneViewport.

Key changes to `src/App.tsx`:
- Remove: `import BlenderViewport from "./components/BlenderViewport";`
- Add: `import DroneViewport from "./components/DroneViewport";`
- Add: `import { useSceneData } from "./hooks/useSceneData";`
- Add state: `const [currentFrame, setCurrentFrame] = useState(0);`
- Add: `const { sceneData, refreshScene } = useSceneData();`
- After Claude's tool use completes, call `refreshScene()` (detect from `isToolRunning` going false→true→false)
- Replace `<BlenderViewport blenderRunning={blenderRunning} />` with `<DroneViewport sceneData={sceneData} currentFrame={currentFrame} />`
- Pass `onFrameChange={setCurrentFrame}` to TimelineBar

**Step 2: Update TimelineBar to expose frame via callback**

Add `onFrameChange?: (frame: number) => void` prop to `TimelineBarProps`. Call it whenever `currentFrame` changes.

**Step 3: Add scene refresh after tool use**

In App.tsx, add a useEffect that watches `claude.isToolRunning`:
```typescript
const prevToolRunning = useRef(false);
useEffect(() => {
  if (prevToolRunning.current && !claude.isToolRunning) {
    // Tool just finished — refresh scene data
    refreshScene();
  }
  prevToolRunning.current = claude.isToolRunning;
}, [claude.isToolRunning, refreshScene]);
```

**Step 4: Verify all compiles**

Run: `npx tsc --noEmit`
Expected: PASS

Run:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo check
```
Expected: Compiles

**Step 5: Commit**

```bash
git add src/App.tsx src/components/TimelineBar.tsx
git commit -m "feat: wire DroneViewport into App, event-driven scene sync"
```

---

### Task 6: Delete old BlenderViewport and clean up unused embed code

**Files:**
- Delete: `src/components/BlenderViewport.tsx`
- Modify: `src-tauri/src/commands.rs` (remove `capture_viewport`, `position_blender_window`)
- Modify: `src-tauri/src/lib.rs` (unregister removed commands)
- Modify: `src-tauri/tauri.conf.json` (remove assetProtocol scope)

**Step 1: Delete BlenderViewport.tsx**

```bash
rm src/components/BlenderViewport.tsx
```

**Step 2: Remove unused Rust commands**

Remove `capture_viewport` and `position_blender_window` from `commands.rs`. Remove their registrations from `lib.rs`. Remove the `use crate::embed;` import if no longer needed. Remove `assetProtocol` from `tauri.conf.json`.

**Step 3: Verify compiles**

Run: `cargo check` and `npx tsc --noEmit`
Expected: Both pass

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove screenshot viewport, clean up unused embed commands"
```

---

### Task 7: Manual end-to-end test

**Step 1: Run all automated checks**

```bash
# Python engine tests (must all still pass)
/Users/cinex/.local/bin/pytest /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai/tests/ -v

# Rust compilation
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo check

# TypeScript compilation
cd .. && npx tsc --noEmit
```

**Step 2: Manual E2E test**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm run tauri dev
```

1. Setup screen → Launch Blender → Connect Claude → Start Designing
2. Verify: Three.js viewport shows dark sky with ground grid
3. Type: "Create 25 drones in a circle at altitude 10"
4. Verify: After Claude's tool use, glowing spheres appear in the viewport
5. Orbit camera with mouse drag, zoom with scroll
6. Scrub timeline → drones animate if keyframes were set
7. Type: "Make them red" → verify color updates

**Step 3: Commit final state**

```bash
git add -A
git commit -m "feat: complete Three.js real-time viewport integration"
```

---

## Task Dependencies

```
Task 1 (npm install) → Task 2 (types + hook)
                     → Task 3 (Rust command) [parallel with Task 2]
Task 2 + Task 3     → Task 4 (DroneViewport component)
Task 4              → Task 5 (wire into App.tsx)
Task 5              → Task 6 (cleanup old viewport)
Task 6              → Task 7 (E2E test)
```

Tasks 2 and 3 can be done in parallel (frontend types vs Rust command).
