# Show Spec-Driven Architecture — Design Document

## 1. Problem

Claude currently builds drone shows by writing raw Python/bpy code via `execute_blender_code`. Each call mutates Blender state destructively. There's no undo, no show representation, no safety validation before rendering, and modifications require re-writing Python from scratch. The show only exists as scattered Blender scene state.

## 2. Solution

A **declarative show spec** — a JSON data structure describing the show's intent (formations, timing, colors). Claude outputs specs via new MCP tools (`build_show`, `update_show`). The engine validates safety and renders to Blender atomically. Raw `execute_blender_code` remains as an escape hatch for custom effects.

## 3. Show Spec Format

```json
{
  "version": "1.0",
  "drone_count": 25,
  "fps": 24,
  "timeline": [
    {
      "time": 0,
      "formation": {
        "type": "parametric",
        "shape": "grid",
        "params": {"spacing": 2.5, "altitude": 0}
      },
      "color": {"type": "solid", "value": [0.2, 0.2, 1.0]}
    },
    {
      "time": 3,
      "formation": {
        "type": "parametric",
        "shape": "circle",
        "params": {"radius": 12, "altitude": 15}
      },
      "color": {"type": "gradient", "start": [0, 0.8, 1], "end": [0, 0.2, 1], "axis": "x"},
      "transition": {"easing": "ease_in_out"}
    },
    {
      "time": 7,
      "formation": {
        "type": "positions",
        "positions": [[0, 0, 20], [1, 2, 20]]
      },
      "color": {"type": "solid", "value": [1, 0.1, 0.3]},
      "transition": {"easing": "ease_in_out"}
    }
  ]
}
```

### Formation types (extensible)

| Type | Description | Key fields |
|------|-------------|------------|
| `parametric` | Uses existing shape generators | `shape`, `params` (shape-specific) |
| `positions` | Explicit per-drone coordinates | `positions: [[x,y,z], ...]` |
| `code` | Custom Python returning positions (future) | `code: str` |

### Color types (extensible)

| Type | Description | Key fields |
|------|-------------|------------|
| `solid` | All drones same color | `value: [r, g, b]` |
| `gradient` | Linear gradient along axis | `start`, `end`, `axis` |
| `per_drone` | Individual drone colors (future) | `values: [[r,g,b], ...]` |

### Transition (optional per timeline entry)

| Field | Description | Default |
|-------|-------------|---------|
| `easing` | Interpolation type | `ease_in_out` |

First timeline entry has no transition (it's the starting state).

Time is in **seconds** (not frames). Engine converts using `fps`.

## 4. MCP Tools

### `build_show(spec: str) -> str`

Creates a new show from a complete spec JSON string.

1. Parses and validates the spec schema
2. Runs the engine pipeline (see section 5)
3. If safety fails → returns violations, does NOT render
4. If safe → renders to Blender atomically, stores spec as current show
5. Returns safety report + summary

### `update_show(changes: str) -> str`

Patches the current show spec and re-renders.

Input format:
```json
{
  "changes": [
    {"action": "update", "index": 2, "formation": {...}, "color": {...}},
    {"action": "add", "time": 12, "formation": {...}, "color": {...}},
    {"action": "remove", "index": 1}
  ]
}
```

Actions:
- `update` — modify an existing timeline entry by index (only specified fields change)
- `add` — insert a new entry at the given time (sorted into timeline)
- `remove` — delete entry at index

After patching, re-runs full pipeline and re-renders.

### Existing tools (unchanged)

- `execute_blender_code` — escape hatch for custom effects
- `get_scene_info`, `get_object_info`, `get_viewport_screenshot` — unchanged

## 5. Engine Pipeline

New file: `droneai/engine/show_builder.py`

```
spec (JSON)
  │
  ▼
① Parse timeline entries, validate schema
  │
  ▼
② For each formation → generate positions
   ├─ "parametric" → FormationGenerator.generate(count, shape=..., **params)
   └─ "positions"  → use directly (validate count matches drone_count)
  │
  ▼
③ For each consecutive pair → plan transitions
   └─ HungarianPlanner.plan(source, target) → optimal drone assignment
  │
  ▼
④ Enforce spacing on each formation
   └─ RepulsionEnforcer.enforce(positions, min_spacing=2.0)
  │
  ▼
⑤ Build ShowTimeline → validate safety
   └─ StandardValidator.validate(timeline, SafetyParams) → SafetyResult
  │
  ▼
⑥ If unsafe → STOP, return violations (no Blender mutation)
  │
  ▼
⑦ Render to Blender (atomic):
   ├─ setup_drone_show_scene(fps, duration)
   ├─ create_drones(count)
   ├─ For each entry: keyframe positions + colors at frame
   ├─ animate_transition() for each pair
   └─ Set frame range
  │
  ▼
⑧ Return {safety_report, summary}
```

Steps ①–⑥ are pure Python (no Blender). Step ⑦ uses existing `blender_scripts/`. This means the pipeline is unit-testable without Blender.

## 6. System Prompt Changes

Two updates to `droneai/system_prompt.md`:

### Scope restriction
Claude is restricted to drone show design only. Off-topic requests are politely redirected.

### Spec-first workflow
Claude is instructed to always use `build_show()`/`update_show()` for standard shows. `execute_blender_code` is only for custom visual effects the spec cannot express.

Workflow Claude follows:
1. Understand requirements (formations, colors, timing, drone count)
2. Construct show spec JSON
3. Call `build_show(spec)`
4. If safety fails, adjust spec and retry
5. Present result to user
6. For modifications, use `update_show(changes)`

## 7. Data Flow

### New show
```
User: "25 drones, circle then heart"
  → Claude constructs spec → build_show(spec)
  → Engine validates + renders
  → Blender scene updated atomically
  → Frontend polls → viewport shows drones
  → Claude responds with summary + safety report
```

### Modification
```
User: "make the heart bigger"
  → Claude → update_show({changes: [{action: "update", index: 2, formation: {params: {scale: 30}}}]})
  → Engine patches spec, re-validates, re-renders
  → Viewport updates
```

### Escape hatch
```
User: "add particle trails behind each drone"
  → Claude → execute_blender_code(custom_python)
  → Direct Blender manipulation
```

## 8. Files to Create/Modify

**Create:**
- `droneai/engine/show_builder.py` — spec parser, pipeline orchestrator, Blender renderer
- `droneai/engine/show_spec.py` — spec dataclasses and validation
- `droneai/tests/test_show_builder.py` — unit tests for pipeline (no Blender)
- `droneai/tests/test_show_spec.py` — spec parsing and validation tests

**Modify:**
- `droneai-studio/mcp-server/server.py` — add `build_show` and `update_show` tools
- `droneai/system_prompt.md` — scope restriction + spec-first workflow
- `droneai-studio/resources/system_prompt.md` — same changes (copy)
- `droneai-studio/src-tauri/src/claude_code.rs` — add new tools to `--allowedTools`

## 9. What This Does NOT Include (deferred to future-features.md)

- Rich transitions (explode, spiral, wave)
- Music sync
- Image/SVG formations
- Per-drone color programming
- Direct mode (viewport interaction → prompt enrichment)
- Project save/load system
- Custom Python formation type (`"code"`)
