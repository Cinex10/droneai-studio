# LED Light Programming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full LED light programming to drone shows by extending `ColorSpec` with a `program` type supporting per-drone keyframe sequences.

**Architecture:** Extend the existing `ColorSpec` dataclass with a `sequences` field. The MCP server's Blender render script gains a `program` branch that compiles sequences to per-drone material keyframes. The Three.js viewport and scene extraction already handle per-drone color keyframes — no changes needed there. Also fix the existing color hold-frame bug.

**Tech Stack:** Python (show_spec.py, server.py), TypeScript (Timeline types, ColorTrack), Blender bpy (material keyframing)

**Design doc:** `docs/plans/2026-02-27-led-light-design.md`

---

### Task 1: Add `sequences` field to ColorSpec

**Files:**
- Modify: `droneai/engine/show_spec.py`
- Test: `droneai/tests/test_show_spec.py`

**Step 1: Write the failing tests**

Add to `droneai/tests/test_show_spec.py`:

```python
def test_parse_program_color_spec():
    """ColorSpec type='program' parses sequences correctly."""
    from droneai.engine.show_spec import ColorSpec

    raw = {
        "type": "program",
        "sequences": [
            {
                "drones": "all",
                "keyframes": [
                    {"t": 0.0, "color": [1, 0, 0]},
                    {"t": 0.5, "color": [0, 0, 1]},
                ],
            }
        ],
    }
    cs = ColorSpec.from_dict(raw)
    assert cs.type == "program"
    assert cs.sequences is not None
    assert len(cs.sequences) == 1
    assert cs.sequences[0]["drones"] == "all"
    assert len(cs.sequences[0]["keyframes"]) == 2
    assert cs.sequences[0]["keyframes"][0]["color"] == [1, 0, 0]


def test_program_color_roundtrip():
    """program ColorSpec survives to_dict() -> from_dict() roundtrip."""
    from droneai.engine.show_spec import ColorSpec

    raw = {
        "type": "program",
        "sequences": [
            {
                "drones": [0, 1, 2],
                "keyframes": [
                    {"t": 0.0, "color": [1, 0, 0]},
                    {"t": 1.0, "color": [0, 1, 0]},
                ],
            },
            {
                "drones": "all",
                "keyframes": [
                    {"t": 0.0, "color": [0, 0, 1]},
                ],
            },
        ],
    }
    cs = ColorSpec.from_dict(raw)
    d = cs.to_dict()
    assert d["type"] == "program"
    assert len(d["sequences"]) == 2
    cs2 = ColorSpec.from_dict(d)
    assert cs2.sequences == cs.sequences


def test_program_in_full_spec():
    """Full ShowSpec with a program color entry parses and roundtrips."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "hold": 2,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.0}},
                "color": {"type": "solid", "value": [0.2, 0.2, 1.0]},
            },
            {
                "time": 5,
                "hold": 3,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 10}},
                "color": {
                    "type": "program",
                    "sequences": [
                        {
                            "drones": "all",
                            "keyframes": [
                                {"t": 0.0, "color": [1, 0, 0]},
                                {"t": 1.0, "color": [0.2, 0, 0]},
                                {"t": 2.0, "color": [1, 0, 0]},
                            ],
                        }
                    ],
                },
                "transition": {"easing": "ease_in_out"},
            },
        ],
    }
    spec = ShowSpec.from_dict(raw)
    assert spec.timeline[1].color.type == "program"
    assert len(spec.timeline[1].color.sequences) == 1

    # Roundtrip
    roundtripped = ShowSpec.from_dict(spec.to_dict())
    assert roundtripped.timeline[1].color.type == "program"
    assert roundtripped.timeline[1].color.sequences == spec.timeline[1].color.sequences
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/test_show_spec.py -v -k "program"`
Expected: FAIL — `ColorSpec` doesn't have `sequences` attribute, `from_dict` doesn't handle `program` type.

**Step 3: Implement ColorSpec changes**

In `droneai/engine/show_spec.py`, modify the `ColorSpec` class:

```python
@dataclass
class ColorSpec:
    type: str  # "solid" | "gradient" | "program"
    value: Optional[List[float]] = None  # for "solid": [r, g, b]
    start: Optional[List[float]] = None  # for "gradient"
    end: Optional[List[float]] = None  # for "gradient"
    axis: str = "x"  # for "gradient"
    sequences: Optional[List[dict]] = None  # for "program"

    @classmethod
    def from_dict(cls, d: dict) -> "ColorSpec":
        return cls(
            type=d["type"],
            value=d.get("value"),
            start=d.get("start"),
            end=d.get("end"),
            axis=d.get("axis", "x"),
            sequences=d.get("sequences"),
        )

    def to_dict(self) -> dict:
        out: dict = {"type": self.type}
        if self.type == "solid":
            out["value"] = self.value
        elif self.type == "gradient":
            out["start"] = self.start
            out["end"] = self.end
            out["axis"] = self.axis
        elif self.type == "program":
            out["sequences"] = self.sequences
        return out
```

Also update the module docstring at the top of `show_spec.py` — change line 13:
```python
#            "color": {"type": "solid"|"gradient"|"program", ...},
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/test_show_spec.py -v`
Expected: ALL PASS (existing + new tests).

**Step 5: Commit**

```bash
git add droneai/engine/show_spec.py droneai/tests/test_show_spec.py
git commit -m "feat: add program type to ColorSpec for per-drone LED keyframes"
```

---

### Task 2: Fix color hold-frame bug in Blender script

**Files:**
- Modify: `droneai-studio/mcp-server/server.py` (the `_RENDER_SCRIPT_BODY` string)

**Context:** Currently, only position keyframes get a hold-frame duplicate. Color keyframes don't, causing color to start interpolating toward the next formation's color immediately during a position hold.

**Step 1: Add color hold-frame keyframing**

In `server.py`, inside the `_RENDER_SCRIPT_BODY` string, after the color keyframing blocks (after the `elif color_spec["type"] == "gradient":` block, around line 339), add a hold-frame duplicate for color:

Find this section (lines 340-376):
```python
# --- Transition interpolation ---
```

Insert BEFORE it (after the gradient color block ends):

```python
    # Hold keyframe for color: duplicate last color at hold_frame to prevent
    # premature interpolation during position holds
    hf = hold_frames[entry_idx]
    if hf > frame:
        if color_spec["type"] == "solid":
            c = color_spec["value"]
            for drone in drone_objs:
                for node in drone.data.materials[0].node_tree.nodes:
                    if node.type == "EMISSION":
                        node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                        node.inputs["Color"].keyframe_insert(
                            data_path="default_value", frame=hf
                        )
                        break
        elif color_spec["type"] == "gradient":
            ax = {"x": 0, "y": 1, "z": 2}[color_spec.get("axis", "x")]
            sc, ec = color_spec["start"], color_spec["end"]
            vals = [pos_list[j][ax] for j in range(len(drone_objs))]
            lo, hi = min(vals), max(vals)
            span = hi - lo if hi > lo else 1.0
            for di, drone in enumerate(drone_objs):
                t = (pos_list[di][ax] - lo) / span
                c = (
                    sc[0] + t * (ec[0] - sc[0]),
                    sc[1] + t * (ec[1] - sc[1]),
                    sc[2] + t * (ec[2] - sc[2]),
                )
                for node in drone.data.materials[0].node_tree.nodes:
                    if node.type == "EMISSION":
                        node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                        node.inputs["Color"].keyframe_insert(
                            data_path="default_value", frame=hf
                        )
                        break
```

**Step 2: Verify**

Run: `cd droneai-studio && npm run build`
Expected: Compiles (this is a Python string in server.py, no TS compile issues).

**Step 3: Commit**

```bash
git add droneai-studio/mcp-server/server.py
git commit -m "fix: add color hold-frame keyframes to prevent premature interpolation"
```

---

### Task 3: Add `program` branch to Blender render script

**Files:**
- Modify: `droneai-studio/mcp-server/server.py` (the `_RENDER_SCRIPT_BODY` string)

**Step 1: Add program handler**

In the `_RENDER_SCRIPT_BODY` string, inside the formation loop, after the `elif color_spec["type"] == "gradient":` block and BEFORE the new hold-frame section from Task 2, add:

```python
    elif color_spec["type"] == "program":
        for seq in color_spec["sequences"]:
            # Resolve drone targets
            target = seq["drones"]
            if target == "all":
                indices = list(range(len(drone_objs)))
            elif isinstance(target, list) and len(target) > 0 and isinstance(target[0], int):
                indices = target
            elif isinstance(target, dict) and "range" in target:
                r = target["range"]
                indices = list(range(r[0], min(r[1] + 1, len(drone_objs))))
            else:
                indices = list(range(len(drone_objs)))

            # Insert per-drone keyframes
            for kf in seq["keyframes"]:
                kf_frame = frame + int(kf["t"] * fps)
                c = kf["color"]
                for di in indices:
                    if di < len(drone_objs):
                        drone = drone_objs[di]
                        for node in drone.data.materials[0].node_tree.nodes:
                            if node.type == "EMISSION":
                                node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                                node.inputs["Color"].keyframe_insert(
                                    data_path="default_value", frame=kf_frame
                                )
                                break
```

Also update the hold-frame section (from Task 2) to handle `program` type. Add after the gradient hold block:

```python
        elif color_spec["type"] == "program":
            # For program, the last keyframe in each sequence serves as the hold value.
            # Insert it at hold_frame to freeze the final state.
            for seq in color_spec["sequences"]:
                target = seq["drones"]
                if target == "all":
                    indices = list(range(len(drone_objs)))
                elif isinstance(target, list) and len(target) > 0 and isinstance(target[0], int):
                    indices = target
                elif isinstance(target, dict) and "range" in target:
                    r = target["range"]
                    indices = list(range(r[0], min(r[1] + 1, len(drone_objs))))
                else:
                    indices = list(range(len(drone_objs)))

                if seq["keyframes"]:
                    last_c = seq["keyframes"][-1]["color"]
                    for di in indices:
                        if di < len(drone_objs):
                            drone = drone_objs[di]
                            for node in drone.data.materials[0].node_tree.nodes:
                                if node.type == "EMISSION":
                                    node.inputs["Color"].default_value = (last_c[0], last_c[1], last_c[2], 1.0)
                                    node.inputs["Color"].keyframe_insert(
                                        data_path="default_value", frame=hf
                                    )
                                    break
```

**Step 2: Verify**

Run: `cd droneai-studio && npm run build`
Expected: Compiles.

**Step 3: Commit**

```bash
git add droneai-studio/mcp-server/server.py
git commit -m "feat: add program color type to Blender render script"
```

---

### Task 4: Update TypeScript types

**Files:**
- Modify: `droneai-studio/src/components/Timeline/types.ts`

**Step 1: Add sequences to ColorSpec interface**

In `types.ts`, update the `ColorSpec` interface:

```typescript
export interface LightKeyframe {
  t: number;
  color: number[];
}

export interface LightSequence {
  drones: "all" | number[] | { range: [number, number] };
  keyframes: LightKeyframe[];
}

export interface ColorSpec {
  type: string;
  value?: number[];
  start?: number[];
  end?: number[];
  axis?: string;
  sequences?: LightSequence[];
}
```

**Step 2: Verify**

Run: `cd droneai-studio && npm run build`
Expected: Compiles. All existing code that reads `ColorSpec` still works (new fields are optional).

**Step 3: Commit**

```bash
git add droneai-studio/src/components/Timeline/types.ts
git commit -m "feat: add LightSequence types for program color spec"
```

---

### Task 5: Enhance ColorTrack for program type

**Files:**
- Modify: `droneai-studio/src/components/Timeline/ColorTrack.tsx`

**Step 1: Update ColorTrack to render program keyframes**

Replace the full contents of `ColorTrack.tsx`:

```tsx
import type { TimelineEntry, ColorSpec } from "./types";

interface ColorTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

function rgbToCSS(rgb: number[], alpha = 1): string {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return alpha < 1
    ? `rgba(${r}, ${g}, ${b}, ${alpha})`
    : `rgb(${r}, ${g}, ${b})`;
}

/** Extract a representative CSS gradient for a ColorSpec within its time span. */
function colorSpecToGradient(color: ColorSpec, nextColor: ColorSpec | null): string {
  if (color.type === "program" && color.sequences && color.sequences.length > 0) {
    // Find the "all" sequence, or fall back to the first one
    const seq = color.sequences.find((s) => s.drones === "all") || color.sequences[0];
    if (seq.keyframes.length === 0) {
      return rgbToCSS([1, 1, 1], 0.7);
    }
    if (seq.keyframes.length === 1) {
      return rgbToCSS(seq.keyframes[0].color, 0.7);
    }
    // Build a multi-stop gradient from the keyframes
    const maxT = seq.keyframes[seq.keyframes.length - 1].t || 1;
    const stops = seq.keyframes.map((kf) => {
      const pct = maxT > 0 ? (kf.t / maxT) * 100 : 0;
      return `${rgbToCSS(kf.color, 0.7)} ${pct.toFixed(1)}%`;
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }

  // solid / gradient — existing behavior
  const startRGB = color.value || color.start || [1, 1, 1];
  const endRGB = nextColor
    ? nextColor.value || nextColor.start || [1, 1, 1]
    : startRGB;
  return `linear-gradient(to right, ${rgbToCSS(startRGB, 0.7)}, ${rgbToCSS(endRGB, 0.7)})`;
}

function colorSpecToEdge(color: ColorSpec): string {
  if (color.type === "program" && color.sequences && color.sequences.length > 0) {
    const seq = color.sequences.find((s) => s.drones === "all") || color.sequences[0];
    if (seq.keyframes.length > 0) {
      return rgbToCSS(seq.keyframes[0].color);
    }
  }
  return rgbToCSS(color.value || color.start || [1, 1, 1]);
}

export default function ColorTrack({ entries, totalFrames, fps, zoom, scrollOffset }: ColorTrackProps) {
  const totalSeconds = totalFrames / fps;
  const timeToPct = (t: number) => ((t / totalSeconds) * 100 * zoom) - scrollOffset;

  return (
    <div className="tl-track tl-track-color relative">
      {entries.map((entry, i) => {
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const left = timeToPct(entry.time);
        const width = timeToPct(nextTime) - left;
        const nextColor = i < entries.length - 1 ? entries[i + 1].color : null;

        return (
          <div
            key={i}
            className="tl-color-block"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: colorSpecToGradient(entry.color, nextColor),
              borderLeft: `2px solid ${colorSpecToEdge(entry.color)}`,
            }}
          />
        );
      })}
    </div>
  );
}
```

**Step 2: Verify**

Run: `cd droneai-studio && npm run build`
Expected: Compiles.

**Step 3: Commit**

```bash
git add droneai-studio/src/components/Timeline/ColorTrack.tsx
git commit -m "feat: enhance ColorTrack to show program keyframes as gradient"
```

---

### Task 6: Update system prompt for embedded Claude

**Files:**
- Modify: `droneai-studio/resources/system_prompt.md`

**Step 1: Add program color documentation**

Find the section (around line 168):
```
Color types: solid `{"value": [r,g,b]}`, gradient `{"start": [r,g,b], "end": [r,g,b], "axis": "x"|"y"|"z"}`.
```

Replace with:

```markdown
Color types:
- solid: `{"type": "solid", "value": [r,g,b]}`
- gradient: `{"type": "gradient", "start": [r,g,b], "end": [r,g,b], "axis": "x"|"y"|"z"}`
- program: per-drone LED keyframe sequences for animated effects

Program color format:
```json
{"type": "program", "sequences": [
  {"drones": "all", "keyframes": [
    {"t": 0.0, "color": [1, 0, 0]},
    {"t": 0.5, "color": [0.2, 0, 0]},
    {"t": 1.0, "color": [1, 0, 0]}
  ]}
]}
```

`drones` targeting: `"all"`, `[0, 1, 2]` (indices), or `{"range": [0, 9]}`.
`t` is seconds from formation start. `color` is [r, g, b] floats 0-1.

Use `program` for animated LED effects:
- Pulse/breathing: cycle brightness on all drones
- Chase/wave: stagger timing across drone indices
- Rainbow: assign different hue per drone
- Fade to black: ramp color to [0, 0, 0]
- Any custom pattern: specify exact per-drone keyframes

Use `solid` or `gradient` for static colors (simpler, preferred when no animation needed).
```

Also add to the "Creative Defaults" section (around line 119), after the color palette by mood:

```markdown
- LED effects by mood:
  - Energetic: fast pulse, chase waves, color cycling
  - Elegant: slow breathing, gentle color fades
  - Dramatic: fade to black, sudden color shifts, alternating groups
  - Playful: rainbow spreads, fast chase, multi-color pulse
```

**Step 2: Verify**

Read the file to confirm the edits look correct.

**Step 3: Commit**

```bash
git add droneai-studio/resources/system_prompt.md
git commit -m "docs: document program color type in system prompt for Claude"
```

---

### Task 7: Run full test suite

**Files:** None (verification only)

**Step 1: Run Python tests**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/ -v`
Expected: ALL PASS (existing + 3 new program tests).

**Step 2: Run TypeScript build**

Run: `cd droneai-studio && npm run build`
Expected: Compiles without errors.

**Step 3: Commit (if any fixes needed)**

Only commit if a fix was required. Otherwise, no commit needed.

---

### Task 8: E2E visual verification

**Files:** None (manual testing)

**Step 1: Start the app**

Run: `cd droneai-studio && npm run tauri dev`

**Step 2: Test via chat**

Send a prompt like: "Create a 20 drone circle show with a pulsing red LED effect"

Verify:
- Claude generates a spec with `"type": "program"` in the color field
- The show builds successfully in Blender
- The Three.js viewport shows animated (pulsing) drone colors
- The timeline's ColorTrack shows a multi-stop gradient for the program entry
- Check the session log to confirm the spec used `program` type

**Step 3: Test solid/gradient backward compatibility**

Send: "Make the drones a solid blue" or "Add a gradient from red to blue"
Verify existing `solid` and `gradient` types still work correctly.

**Step 4: Commit any fixes**

If any issues found, fix and commit.
