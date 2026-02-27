# LED Light Programming Design

**Date:** 2026-02-27
**Status:** Approved

## Summary

Add full LED light programming to drone shows. Extend `ColorSpec` with a `program` type that supports per-drone keyframe sequences, giving Claude complete freedom to generate any light effect (pulse, chase, rainbow, strobe, custom patterns) as a list of `(time, color)` pairs per drone. Keep `solid` and `gradient` as convenient shorthands.

## Scope

- Chat-driven: user describes effects in natural language, Claude generates the LED spec
- Per-formation: each formation entry has its own `ColorSpec` (no separate light timeline)
- Core effects via keyframes: pulse, chase, rainbow, fade-to-black, and anything else Claude can compute
- Timeline ColorTrack visualizes the generated programs
- Three.js viewport renders animated colors automatically (already interpolates per-drone color keyframes)

## Extended ColorSpec

```python
@dataclass
class ColorSpec:
    type: str  # "solid" | "gradient" | "program"

    # solid
    value: Optional[List[float]] = None       # [r, g, b] 0-1

    # gradient
    start: Optional[List[float]] = None       # [r, g, b]
    end: Optional[List[float]] = None         # [r, g, b]
    axis: str = "x"

    # program — per-drone keyframe sequences
    sequences: Optional[List[dict]] = None
```

### Program Format

```json
{
  "type": "program",
  "sequences": [
    {
      "drones": "all",
      "keyframes": [
        {"t": 0.0, "color": [1, 0, 0]},
        {"t": 0.5, "color": [0, 0, 1]},
        {"t": 1.0, "color": [1, 0, 0]}
      ]
    }
  ]
}
```

**`drones` targeting:**
- `"all"` — every drone in the formation
- `[0, 1, 2, 5]` — specific drone indices
- `{"range": [0, 9]}` — drone index range (inclusive)

**`keyframes[].t`:** time offset in seconds from the formation start. Blender frame = `formation_frame + t * fps`.

**`keyframes[].color`:** RGB float 0-1.

### Effect Examples

**Pulse (all drones breathe red):**
```json
{"type": "program", "sequences": [
  {"drones": "all", "keyframes": [
    {"t": 0.0, "color": [1, 0, 0]},
    {"t": 0.5, "color": [0.2, 0, 0]},
    {"t": 1.0, "color": [1, 0, 0]},
    {"t": 1.5, "color": [0.2, 0, 0]},
    {"t": 2.0, "color": [1, 0, 0]}
  ]}
]}
```

**Chase (staggered wave across drones):**
```json
{"type": "program", "sequences": [
  {"drones": [0], "keyframes": [{"t": 0.0, "color": [0,1,0]}, {"t": 0.3, "color": [0,0,0]}, {"t": 1.0, "color": [0,1,0]}]},
  {"drones": [1], "keyframes": [{"t": 0.1, "color": [0,1,0]}, {"t": 0.4, "color": [0,0,0]}, {"t": 1.1, "color": [0,1,0]}]},
  {"drones": [2], "keyframes": [{"t": 0.2, "color": [0,1,0]}, {"t": 0.5, "color": [0,0,0]}, {"t": 1.2, "color": [0,1,0]}]}
]}
```

**Fade to black:**
```json
{"type": "program", "sequences": [
  {"drones": "all", "keyframes": [
    {"t": 0.0, "color": [1, 0.5, 0]},
    {"t": 3.0, "color": [0, 0, 0]}
  ]}
]}
```

**Rainbow (hue spread across 10 drones):**
Claude generates one sequence per drone with hue offsets:
```json
{"type": "program", "sequences": [
  {"drones": [0], "keyframes": [{"t": 0, "color": [1,0,0]}, {"t": 2, "color": [1,0,0]}]},
  {"drones": [1], "keyframes": [{"t": 0, "color": [1,0.6,0]}, {"t": 2, "color": [1,0.6,0]}]},
  {"drones": [2], "keyframes": [{"t": 0, "color": [0.5,1,0]}, {"t": 2, "color": [0.5,1,0]}]}
]}
```

## Blender Script Changes

In `_RENDER_SCRIPT_BODY` (inside `server.py`), add a third branch alongside `solid` and `gradient`:

```python
elif color_spec["type"] == "program":
    for seq in color_spec["sequences"]:
        # Resolve drone targets
        target = seq["drones"]
        if target == "all":
            indices = range(len(drone_objs))
        elif isinstance(target, list):
            indices = target
        elif isinstance(target, dict) and "range" in target:
            r = target["range"]
            indices = range(r[0], r[1] + 1)

        # Insert keyframes
        for kf in seq["keyframes"]:
            kf_frame = frame + int(kf["t"] * fps)
            c = kf["color"]
            for di in indices:
                drone = drone_objs[di]
                for node in drone.data.materials[0].node_tree.nodes:
                    if node.type == "EMISSION":
                        node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                        node.inputs["Color"].keyframe_insert(
                            data_path="default_value", frame=kf_frame
                        )
                        break
```

### Color Hold-Frame Fix (Existing Bug)

Currently, color keyframes are only inserted at the formation arrival frame. This causes color to start interpolating toward the next formation's color immediately, even during position holds.

**Fix:** After inserting color keyframes for any type (solid, gradient, program), also duplicate the last color value at the hold end frame:
```python
hold_frame = frame + hold_frames[entry_idx]
# Insert hold keyframe for color (same as last color value)
```

This mirrors what already happens for position keyframes.

### Transition Behavior

Between formations, Blender linearly interpolates from the last color keyframe of the outgoing formation to the first color keyframe of the incoming formation. This gives natural fades between LED states with no extra code.

## Engine Changes

**`show_spec.py`:**
- Add `sequences: Optional[List[dict]] = None` to `ColorSpec`
- Update `to_dict()` and `from_dict()` to handle the new field
- Add validation: if `type == "program"`, `sequences` must be non-empty

**`show_builder.py`:**
- No changes. Builder remains position-only. Color lives in the spec and compiles to Blender keyframes in the MCP server.

## System Prompt Update

Update `droneai-studio/resources/system_prompt.md` to document the `program` color type so the embedded Claude Code instance knows how to generate LED programs. Include examples of pulse, chase, rainbow, fade-to-black patterns.

## Timeline ColorTrack Enhancement

For `program` type entries:
- Extract colors from the first `"all"` sequence (or the first sequence if no `"all"`)
- Render keyframes as a multi-stop CSS gradient within the formation's time span
- For single-color programs (e.g., solid via program), show as flat color

No interactivity — read-only in chat mode, matching existing timeline behavior.

## Stack Impact

| Layer | Change |
|-------|--------|
| `show_spec.py` | Add `sequences` field, validation |
| `show_builder.py` | None |
| `server.py` (`_RENDER_SCRIPT_BODY`) | Add `program` branch, fix color hold-frames |
| `server.py` (`_generate_blender_script`) | Already passes `colors` — no change |
| `commands.rs` (scene extraction) | None — already reads per-drone color keyframes |
| `DroneViewport.tsx` | None — already interpolates per-drone color keyframes |
| `ColorTrack.tsx` | Enhanced to show program keyframes as gradient |
| `system_prompt.md` | Document `program` type with examples |
| `types.ts` | None — `ColorSpec` in ShowInfo already uses `Record<string, unknown>` |

## What's NOT in Scope

- Visual LED editor (future Direct mode feature)
- Separate light timeline independent of formations
- Music/beat-synced light cues
- Per-drone brightness/strength control (emission strength stays fixed at 5.0)
