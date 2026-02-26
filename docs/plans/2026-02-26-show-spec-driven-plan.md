# Show Spec-Driven Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current "Claude writes raw Python" approach with a declarative show spec that Claude outputs via MCP tools, which the engine validates and renders to Blender atomically.

**Architecture:** A `ShowSpec` dataclass describes the show (formations, timing, colors). A `ShowBuilder` class parses the spec, runs it through the existing engine ABCs (FormationGenerator → HungarianPlanner → RepulsionEnforcer → SafetyValidator), and renders to Blender. Two new MCP tools (`build_show`, `update_show`) expose this to Claude.

**Tech Stack:** Python 3.11+, dataclasses, existing droneai engine ABCs, existing blender_scripts helpers, FastMCP

---

## Pre-requisites

- Existing engine ABCs in `droneai/engine/` (formations, transitions, safety, exporters)
- Existing blender scripts in `droneai/blender_scripts/`
- MCP server at `droneai-studio/mcp-server/server.py` (from the own-mcp-server plan)
- Python 3.11+, pytest, scipy

**Test command:** `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/ -v`

**Design doc:** `docs/plans/2026-02-26-show-spec-driven-design.md`

---

### Task 1: ShowSpec dataclasses — schema and validation

**Files:**
- Create: `droneai/engine/show_spec.py`
- Create: `droneai/tests/test_show_spec.py`

**Step 1: Write the failing tests**

```python
# droneai/tests/test_show_spec.py
"""Tests for show spec parsing and validation."""
import pytest
import json


def test_parse_minimal_spec():
    """Minimal valid spec: 1 formation, solid color."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.0, "altitude": 0}},
                "color": {"type": "solid", "value": [1.0, 1.0, 1.0]},
            }
        ],
    }
    spec = ShowSpec.from_dict(raw)
    assert spec.drone_count == 5
    assert spec.fps == 24
    assert len(spec.timeline) == 1
    assert spec.timeline[0].time == 0
    assert spec.timeline[0].formation.type == "parametric"
    assert spec.timeline[0].formation.shape == "grid"
    assert spec.timeline[0].color.type == "solid"


def test_parse_full_spec():
    """Full spec with multiple formations, transitions, different color types."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 25,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.5, "altitude": 0}},
                "color": {"type": "solid", "value": [0.2, 0.2, 1.0]},
            },
            {
                "time": 3,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 12, "altitude": 15}},
                "color": {"type": "gradient", "start": [0, 0.8, 1], "end": [0, 0.2, 1], "axis": "x"},
                "transition": {"easing": "ease_in_out"},
            },
            {
                "time": 7,
                "formation": {"type": "positions", "positions": [[i, 0, 20] for i in range(25)]},
                "color": {"type": "solid", "value": [1, 0.1, 0.3]},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    }
    spec = ShowSpec.from_dict(raw)
    assert spec.drone_count == 25
    assert len(spec.timeline) == 3
    assert spec.timeline[1].transition.easing == "ease_in_out"
    assert spec.timeline[2].formation.type == "positions"
    assert len(spec.timeline[2].formation.positions) == 25


def test_parse_from_json_string():
    """Parse from JSON string (as MCP tool would receive)."""
    from droneai.engine.show_spec import ShowSpec

    raw = json.dumps({
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 5}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            }
        ],
    })
    spec = ShowSpec.from_json(raw)
    assert spec.drone_count == 5


def test_invalid_spec_missing_timeline():
    """Spec without timeline raises ValueError."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="timeline"):
        ShowSpec.from_dict({"version": "1.0", "drone_count": 5, "fps": 24})


def test_invalid_spec_zero_drones():
    """drone_count must be positive."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="drone_count"):
        ShowSpec.from_dict({
            "version": "1.0", "drone_count": 0, "fps": 24,
            "timeline": [{"time": 0, "formation": {"type": "parametric", "shape": "grid"}, "color": {"type": "solid", "value": [1,1,1]}}],
        })


def test_invalid_positions_count_mismatch():
    """positions formation must have exactly drone_count positions."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="positions"):
        ShowSpec.from_dict({
            "version": "1.0", "drone_count": 5, "fps": 24,
            "timeline": [
                {
                    "time": 0,
                    "formation": {"type": "positions", "positions": [[0,0,0], [1,0,0]]},
                    "color": {"type": "solid", "value": [1,1,1]},
                }
            ],
        })


def test_timeline_sorted_by_time():
    """Timeline entries must be sorted by time."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="sorted"):
        ShowSpec.from_dict({
            "version": "1.0", "drone_count": 5, "fps": 24,
            "timeline": [
                {"time": 5, "formation": {"type": "parametric", "shape": "grid"}, "color": {"type": "solid", "value": [1,1,1]}},
                {"time": 2, "formation": {"type": "parametric", "shape": "circle"}, "color": {"type": "solid", "value": [1,1,1]}},
            ],
        })


def test_spec_to_dict_roundtrip():
    """to_dict() output can be re-parsed."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 10,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.0}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
            {
                "time": 5,
                "formation": {"type": "parametric", "shape": "heart", "params": {"scale": 15}},
                "color": {"type": "gradient", "start": [1, 0, 0], "end": [0, 0, 1], "axis": "z"},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    }
    spec = ShowSpec.from_dict(raw)
    roundtripped = ShowSpec.from_dict(spec.to_dict())
    assert roundtripped.drone_count == spec.drone_count
    assert len(roundtripped.timeline) == len(spec.timeline)
    assert roundtripped.timeline[1].formation.shape == "heart"
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/test_show_spec.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'droneai.engine.show_spec'`

**Step 3: Write the implementation**

```python
# droneai/engine/show_spec.py
"""Declarative show spec — describes a drone show as data, not code.

The spec format is:
{
    "version": "1.0",
    "drone_count": int,
    "fps": int,
    "timeline": [
        {
            "time": float (seconds),
            "formation": {"type": "parametric"|"positions", ...},
            "color": {"type": "solid"|"gradient", ...},
            "transition": {"easing": str} (optional, absent on first entry)
        }
    ]
}
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class FormationSpec:
    type: str  # "parametric" | "positions"
    shape: Optional[str] = None  # for "parametric"
    params: dict = field(default_factory=dict)  # for "parametric"
    positions: Optional[List[List[float]]] = None  # for "positions"

    @classmethod
    def from_dict(cls, d: dict) -> "FormationSpec":
        return cls(
            type=d["type"],
            shape=d.get("shape"),
            params=d.get("params", {}),
            positions=d.get("positions"),
        )

    def to_dict(self) -> dict:
        out: dict = {"type": self.type}
        if self.type == "parametric":
            if self.shape:
                out["shape"] = self.shape
            if self.params:
                out["params"] = self.params
        elif self.type == "positions":
            out["positions"] = self.positions
        return out


@dataclass
class ColorSpec:
    type: str  # "solid" | "gradient"
    value: Optional[List[float]] = None  # for "solid": [r, g, b]
    start: Optional[List[float]] = None  # for "gradient"
    end: Optional[List[float]] = None  # for "gradient"
    axis: str = "x"  # for "gradient"

    @classmethod
    def from_dict(cls, d: dict) -> "ColorSpec":
        return cls(
            type=d["type"],
            value=d.get("value"),
            start=d.get("start"),
            end=d.get("end"),
            axis=d.get("axis", "x"),
        )

    def to_dict(self) -> dict:
        out: dict = {"type": self.type}
        if self.type == "solid":
            out["value"] = self.value
        elif self.type == "gradient":
            out["start"] = self.start
            out["end"] = self.end
            out["axis"] = self.axis
        return out


@dataclass
class TransitionSpec:
    easing: str = "ease_in_out"

    @classmethod
    def from_dict(cls, d: dict) -> "TransitionSpec":
        return cls(easing=d.get("easing", "ease_in_out"))

    def to_dict(self) -> dict:
        return {"easing": self.easing}


@dataclass
class TimelineEntry:
    time: float  # seconds
    formation: FormationSpec
    color: ColorSpec
    transition: Optional[TransitionSpec] = None

    @classmethod
    def from_dict(cls, d: dict) -> "TimelineEntry":
        transition = TransitionSpec.from_dict(d["transition"]) if "transition" in d else None
        return cls(
            time=d["time"],
            formation=FormationSpec.from_dict(d["formation"]),
            color=ColorSpec.from_dict(d["color"]),
            transition=transition,
        )

    def to_dict(self) -> dict:
        out: dict = {
            "time": self.time,
            "formation": self.formation.to_dict(),
            "color": self.color.to_dict(),
        }
        if self.transition:
            out["transition"] = self.transition.to_dict()
        return out


@dataclass
class ShowSpec:
    version: str
    drone_count: int
    fps: int
    timeline: List[TimelineEntry]

    @classmethod
    def from_dict(cls, d: dict) -> "ShowSpec":
        if "timeline" not in d or not d["timeline"]:
            raise ValueError("Show spec must have a non-empty 'timeline'")

        drone_count = d.get("drone_count", 0)
        if drone_count < 1:
            raise ValueError("drone_count must be positive")

        entries = [TimelineEntry.from_dict(e) for e in d["timeline"]]

        # Validate timeline is sorted
        for i in range(1, len(entries)):
            if entries[i].time < entries[i - 1].time:
                raise ValueError("Timeline entries must be sorted by time")

        # Validate positions formations match drone_count
        for entry in entries:
            if entry.formation.type == "positions":
                if entry.formation.positions is None or len(entry.formation.positions) != drone_count:
                    raise ValueError(
                        f"'positions' formation must have exactly {drone_count} positions, "
                        f"got {len(entry.formation.positions) if entry.formation.positions else 0}"
                    )

        return cls(
            version=d.get("version", "1.0"),
            drone_count=drone_count,
            fps=d.get("fps", 24),
            timeline=entries,
        )

    @classmethod
    def from_json(cls, s: str) -> "ShowSpec":
        return cls.from_dict(json.loads(s))

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "drone_count": self.drone_count,
            "fps": self.fps,
            "timeline": [e.to_dict() for e in self.timeline],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/test_show_spec.py -v`
Expected: All 8 tests PASS.

**Step 5: Run full test suite**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/ -v`
Expected: All existing tests still pass (no regressions).

**Step 6: Commit**

```bash
git add droneai/engine/show_spec.py droneai/tests/test_show_spec.py
git commit -m "feat: add ShowSpec dataclasses for declarative show format"
```

---

### Task 2: ShowBuilder — spec-to-positions pipeline (no Blender)

The pure-Python pipeline: parse spec → generate formation positions → plan transitions → enforce spacing → validate safety. No Blender dependency.

**Files:**
- Create: `droneai/engine/show_builder.py`
- Create: `droneai/tests/test_show_builder.py`

**Step 1: Write the failing tests**

```python
# droneai/tests/test_show_builder.py
"""Tests for ShowBuilder pipeline (pure Python, no Blender)."""
import pytest


def test_build_positions_parametric():
    """ShowBuilder generates positions for parametric formations."""
    from droneai.engine.show_builder import ShowBuilder
    from droneai.engine.show_spec import ShowSpec

    spec = ShowSpec.from_dict({
        "version": "1.0",
        "drone_count": 9,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.0, "altitude": 0}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
            {
                "time": 3,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 8, "altitude": 10}},
                "color": {"type": "solid", "value": [0, 0, 1]},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    })
    builder = ShowBuilder()
    result = builder.build(spec)

    assert result.is_safe
    assert len(result.formations) == 2
    assert len(result.formations[0]) == 9  # 9 positions for 9 drones
    assert len(result.formations[1]) == 9


def test_build_positions_explicit():
    """ShowBuilder uses explicit positions when type is 'positions'."""
    from droneai.engine.show_builder import ShowBuilder
    from droneai.engine.show_spec import ShowSpec

    positions = [[float(i), 0.0, 10.0] for i in range(5)]
    spec = ShowSpec.from_dict({
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "positions", "positions": positions},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
        ],
    })
    builder = ShowBuilder()
    result = builder.build(spec)

    assert result.is_safe
    for i, pos in enumerate(result.formations[0]):
        assert abs(pos[0] - float(i)) < 0.5  # may shift slightly from spacing enforcement


def test_build_safety_validation():
    """ShowBuilder validates safety and returns violations if unsafe."""
    from droneai.engine.show_builder import ShowBuilder
    from droneai.engine.show_spec import ShowSpec

    # Drones too close together (0.5m spacing, min is 2.0m)
    positions = [[i * 0.5, 0, 10] for i in range(5)]
    spec = ShowSpec.from_dict({
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "positions", "positions": positions},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
        ],
    })
    builder = ShowBuilder()
    result = builder.build(spec)

    # Spacing enforcer should fix the positions, but let's check it ran
    assert result.is_safe  # enforcer adjusts them
    # All drones should be at least ~2m apart after enforcement
    for i in range(len(result.formations[0])):
        for j in range(i + 1, len(result.formations[0])):
            pi = result.formations[0][i]
            pj = result.formations[0][j]
            dist = sum((a - b) ** 2 for a, b in zip(pi, pj)) ** 0.5
            assert dist >= 1.5  # slightly under 2.0 tolerance for repulsion


def test_build_transition_assignment():
    """ShowBuilder uses Hungarian algorithm for drone-to-position assignment."""
    from droneai.engine.show_builder import ShowBuilder
    from droneai.engine.show_spec import ShowSpec

    spec = ShowSpec.from_dict({
        "version": "1.0",
        "drone_count": 4,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 3.0, "altitude": 0}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
            {
                "time": 3,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 5, "altitude": 10}},
                "color": {"type": "solid", "value": [0, 1, 0]},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    })
    builder = ShowBuilder()
    result = builder.build(spec)

    assert result.is_safe
    assert len(result.assignments) == 1  # one transition between 2 formations
    assert len(result.assignments[0]) == 4  # 4 drones assigned


def test_build_result_has_frames():
    """BuildResult contains frame numbers for each timeline entry."""
    from droneai.engine.show_builder import ShowBuilder
    from droneai.engine.show_spec import ShowSpec

    spec = ShowSpec.from_dict({
        "version": "1.0",
        "drone_count": 4,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 3.0, "altitude": 0}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
            {
                "time": 5,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 5, "altitude": 10}},
                "color": {"type": "solid", "value": [0, 1, 0]},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    })
    builder = ShowBuilder()
    result = builder.build(spec)

    assert result.frames == [0, 120]  # 0s * 24fps = 0, 5s * 24fps = 120


def test_build_result_safety_report():
    """BuildResult includes safety metrics."""
    from droneai.engine.show_builder import ShowBuilder
    from droneai.engine.show_spec import ShowSpec

    spec = ShowSpec.from_dict({
        "version": "1.0",
        "drone_count": 9,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 3.0, "altitude": 0}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
            {
                "time": 4,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 8, "altitude": 10}},
                "color": {"type": "solid", "value": [0, 0, 1]},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    })
    builder = ShowBuilder()
    result = builder.build(spec)

    assert result.is_safe
    assert result.safety_report.min_spacing_found > 0
    assert result.safety_report.max_altitude_found > 0
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/test_show_builder.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'droneai.engine.show_builder'`

**Step 3: Write the implementation**

```python
# droneai/engine/show_builder.py
"""ShowBuilder — converts a ShowSpec into validated formation data.

Pipeline:
1. Parse timeline entries
2. Generate positions for each formation (parametric or explicit)
3. Plan transitions between consecutive formations (Hungarian algorithm)
4. Enforce minimum spacing on each formation
5. Build ShowTimeline and validate safety
6. Return BuildResult with positions, assignments, safety report

This module is pure Python — no Blender dependency.
Blender rendering is handled separately by show_renderer.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Tuple

from droneai.engine.show_spec import ShowSpec, FormationSpec
from droneai.engine.formations.parametric import ParametricFormation
from droneai.engine.transitions.hungarian import HungarianPlanner
from droneai.engine.formations.spacing import RepulsionEnforcer
from droneai.engine.safety.base import SafetyParams, SafetyResult, ShowTimeline, Position
from droneai.engine.safety.standard import StandardValidator


@dataclass
class BuildResult:
    """Result of building a show from a spec."""
    is_safe: bool
    safety_report: SafetyResult
    formations: List[List[Position]]  # positions per timeline entry
    assignments: List[List[int]]  # transition assignments between consecutive entries
    frames: List[int]  # Blender frame number per timeline entry
    spec: ShowSpec  # the spec that was built


class ShowBuilder:
    """Builds a validated show from a ShowSpec."""

    def __init__(
        self,
        safety_params: SafetyParams | None = None,
        min_spacing: float = 2.0,
    ):
        self.formation_gen = ParametricFormation()
        self.planner = HungarianPlanner()
        self.enforcer = RepulsionEnforcer()
        self.validator = StandardValidator()
        self.safety_params = safety_params or SafetyParams()
        self.min_spacing = min_spacing

    def build(self, spec: ShowSpec) -> BuildResult:
        # Step 1: Generate positions for each formation
        formations: List[List[Position]] = []
        for entry in spec.timeline:
            positions = self._generate_positions(entry.formation, spec.drone_count)
            formations.append(positions)

        # Step 2: Plan transitions and reorder target positions
        assignments: List[List[int]] = []
        for i in range(1, len(formations)):
            mapping = self.planner.plan(formations[i - 1], formations[i])
            assignments.append(mapping)
            # Reorder target positions so drone[j] goes to target[mapping[j]]
            reordered = [formations[i][mapping[j]] for j in range(len(mapping))]
            formations[i] = reordered

        # Step 3: Enforce spacing on each formation
        for i in range(len(formations)):
            formations[i] = self.enforcer.enforce(formations[i], self.min_spacing)

        # Step 4: Compute frame numbers
        frames = [int(entry.time * spec.fps) for entry in spec.timeline]

        # Step 5: Build timeline and validate safety
        timeline = self._build_timeline(formations, frames, spec)
        safety_result = self.validator.validate(timeline, self.safety_params)

        return BuildResult(
            is_safe=safety_result.is_safe,
            safety_report=safety_result,
            formations=formations,
            assignments=assignments,
            frames=frames,
            spec=spec,
        )

    def _generate_positions(self, formation: FormationSpec, count: int) -> List[Position]:
        if formation.type == "parametric":
            return self.formation_gen.generate(
                count, shape=formation.shape, **formation.params
            )
        elif formation.type == "positions":
            return [tuple(p) for p in formation.positions]
        else:
            raise ValueError(f"Unknown formation type: {formation.type}")

    def _build_timeline(
        self,
        formations: List[List[Position]],
        frames: List[int],
        spec: ShowSpec,
    ) -> ShowTimeline:
        """Build a ShowTimeline suitable for SafetyValidator.

        Creates intermediate frames between formations for velocity checking.
        """
        timeline: ShowTimeline = []
        drone_ids = [f"Drone_{i+1:03d}" for i in range(spec.drone_count)]

        for idx, (positions, frame) in enumerate(zip(formations, frames)):
            time_s = frame / spec.fps
            frame_dict = {drone_ids[j]: positions[j] for j in range(len(positions))}
            timeline.append((time_s, frame_dict))

            # Add interpolated midpoint between this and next formation for velocity check
            if idx < len(formations) - 1:
                next_positions = formations[idx + 1]
                next_time = frames[idx + 1] / spec.fps
                mid_time = (time_s + next_time) / 2
                mid_dict = {}
                for j in range(spec.drone_count):
                    mid_dict[drone_ids[j]] = tuple(
                        (a + b) / 2 for a, b in zip(positions[j], next_positions[j])
                    )
                timeline.append((mid_time, mid_dict))

        return timeline
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/test_show_builder.py -v`
Expected: All 6 tests PASS.

**Step 5: Run full test suite**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/ -v`
Expected: All tests pass (no regressions).

**Step 6: Commit**

```bash
git add droneai/engine/show_builder.py droneai/tests/test_show_builder.py
git commit -m "feat: add ShowBuilder pipeline — spec to validated positions"
```

---

### Task 3: ShowRenderer — Blender rendering from BuildResult

This renders a BuildResult to Blender using the existing blender_scripts. This file will only run inside Blender's Python environment.

**Files:**
- Create: `droneai/engine/show_renderer.py`

**Step 1: Write the implementation**

Note: This cannot be unit tested without Blender. It will be integration-tested via the MCP tool in Task 5.

```python
# droneai/engine/show_renderer.py
"""ShowRenderer — renders a BuildResult into a Blender scene.

This module requires Blender's Python environment (bpy).
It uses the existing blender_scripts helpers for all Blender operations.
"""
from __future__ import annotations

from droneai.engine.show_builder import BuildResult
from droneai.engine.show_spec import ShowSpec


def render_to_blender(result: BuildResult) -> str:
    """Render a validated BuildResult into the Blender scene.

    Clears the scene and creates everything from scratch (atomic).
    Returns a summary string.
    """
    from droneai.blender_scripts.setup_scene import setup_drone_show_scene
    from droneai.blender_scripts.create_drones import create_drones
    from droneai.blender_scripts.set_led_colors import set_led_color_all, set_led_gradient
    from droneai.blender_scripts.animate_transition import animate_transition
    import bpy

    spec = result.spec

    # Calculate total duration from last timeline entry
    last_time = spec.timeline[-1].time
    # Add a few seconds after the last formation for hold
    duration = last_time + 3.0

    # 1. Setup clean scene
    setup_drone_show_scene(fps=spec.fps, duration_seconds=duration)

    # 2. Create drones at first formation positions
    create_drones(count=spec.drone_count, start_positions=result.formations[0])

    # 3. Keyframe each formation's positions and colors
    drones_collection = bpy.data.collections.get("Drones")
    if not drones_collection:
        return "Error: Drones collection not found after create_drones()"

    drone_objects = sorted(
        [obj for obj in drones_collection.objects if obj.type == "MESH"],
        key=lambda o: o.name,
    )

    for entry_idx, (entry, positions, frame) in enumerate(
        zip(spec.timeline, result.formations, result.frames)
    ):
        # Set positions
        for drone_idx, drone in enumerate(drone_objects):
            pos = positions[drone_idx]
            drone.location = (pos[0], pos[1], pos[2])
            drone.keyframe_insert(data_path="location", frame=frame)

        # Set colors
        _apply_color(entry.color, drone_objects, frame)

    # 4. Set interpolation for transitions
    for i in range(1, len(result.frames)):
        easing = spec.timeline[i].transition.easing if spec.timeline[i].transition else "EASE_IN_OUT"
        blender_easing = easing.upper().replace("-", "_")
        animate_transition(result.frames[i - 1], result.frames[i], easing=blender_easing)

    # 5. Set frame range
    bpy.context.scene.frame_end = result.frames[-1]
    bpy.context.scene.frame_set(0)

    summary = (
        f"Show rendered: {spec.drone_count} drones, "
        f"{len(spec.timeline)} formations, "
        f"{result.frames[-1]} frames ({result.frames[-1] / spec.fps:.1f}s)"
    )
    return summary


def _apply_color(color_spec, drone_objects, frame):
    """Apply a ColorSpec to drone objects at a frame."""
    from droneai.blender_scripts.set_led_colors import (
        set_led_color_all,
        set_led_gradient,
    )

    if color_spec.type == "solid":
        set_led_color_all(tuple(color_spec.value), frame=frame)
    elif color_spec.type == "gradient":
        set_led_gradient(
            tuple(color_spec.start),
            tuple(color_spec.end),
            frame=frame,
            axis=color_spec.axis,
        )
```

**Step 2: Commit**

```bash
git add droneai/engine/show_renderer.py
git commit -m "feat: add ShowRenderer — renders BuildResult to Blender scene"
```

---

### Task 4: Add `build_show` and `update_show` MCP tools

**Files:**
- Modify: `droneai-studio/mcp-server/server.py` — add two new tools
- Modify: `droneai-studio/src-tauri/src/claude_code.rs` — add new tools to allowedTools

**Step 1: Add tools to MCP server**

Add these two tools to `droneai-studio/mcp-server/server.py`, after the existing tool definitions. The MCP server runs in system Python, but `build_show` needs to execute the renderer inside Blender. So:

- `build_show`: runs ShowBuilder (pure Python, in MCP server process) for validation, then sends the render script to Blender via TCP:9876
- `update_show`: patches stored spec, re-runs build + render

Add to `server.py` after the existing tools:

```python
# --- Show state (persisted in memory for the session) ---
_current_spec: dict | None = None
_current_build_result_json: str | None = None


@mcp.tool()
def build_show(spec: str) -> str:
    """Build a drone show from a declarative spec. The spec describes formations,
    timing, and colors. The engine validates safety before rendering to Blender.

    Parameters:
        spec: JSON string with the show spec. Format:
            {
                "drone_count": int,
                "fps": int (default 24),
                "timeline": [
                    {
                        "time": float (seconds),
                        "formation": {"type": "parametric", "shape": "grid", "params": {...}}
                                  or {"type": "positions", "positions": [[x,y,z], ...]},
                        "color": {"type": "solid", "value": [r,g,b]}
                              or {"type": "gradient", "start": [r,g,b], "end": [r,g,b], "axis": "x"},
                        "transition": {"easing": "ease_in_out"} (optional, absent on first entry)
                    }
                ]
            }
    """
    global _current_spec, _current_build_result_json
    try:
        import json as _json

        # Parse and validate spec
        spec_dict = _json.loads(spec)

        # Build + validate (pure Python — runs in this process)
        # We send the full pipeline to Blender where droneai is available
        build_code = f"""
import json
import sys

# Ensure droneai is importable
spec_json = '''{spec}'''

from droneai.engine.show_spec import ShowSpec
from droneai.engine.show_builder import ShowBuilder
from droneai.engine.show_renderer import render_to_blender

spec = ShowSpec.from_json(spec_json)
builder = ShowBuilder()
result = builder.build(spec)

if not result.is_safe:
    violations = "; ".join(result.safety_report.violations[:10])
    print(json.dumps({{"safe": False, "violations": violations}}))
else:
    summary = render_to_blender(result)
    report = {{
        "safe": True,
        "summary": summary,
        "min_spacing": round(result.safety_report.min_spacing_found, 2),
        "max_velocity": round(result.safety_report.max_velocity_found, 2),
        "max_altitude": round(result.safety_report.max_altitude_found, 2),
    }}
    print(json.dumps(report))
"""
        resp = _send_command("execute_code", {"code": build_code})

        if resp.get("status") == "error":
            return f"Error: {resp.get('message', 'Unknown error')}"

        result_str = resp.get("result", {}).get("result", "")
        if not result_str.strip():
            return f"Error: No output from build pipeline. Response: {resp}"

        result_data = _json.loads(result_str.strip())

        if not result_data.get("safe"):
            return f"Safety validation FAILED:\n{result_data.get('violations', 'Unknown')}\n\nAdjust the spec and try again."

        # Store spec for update_show
        _current_spec = spec_dict
        _current_build_result_json = result_str.strip()

        report = result_data
        return (
            f"Show built successfully!\n\n"
            f"{report.get('summary', '')}\n\n"
            f"Safety report:\n"
            f"  Min spacing: {report.get('min_spacing', '?')}m (safe >= 2.0m)\n"
            f"  Max velocity: {report.get('max_velocity', '?')} m/s (safe <= 8.0 m/s)\n"
            f"  Max altitude: {report.get('max_altitude', '?')}m (safe <= 120m)"
        )

    except Exception as e:
        return f"Error building show: {e}"


@mcp.tool()
def update_show(changes: str) -> str:
    """Update the current show by patching the spec and re-rendering.

    Parameters:
        changes: JSON string with changes to apply:
            {
                "changes": [
                    {"action": "update", "index": 0, "formation": {...}, "color": {...}},
                    {"action": "add", "time": 5, "formation": {...}, "color": {...}},
                    {"action": "remove", "index": 2}
                ]
            }
            Fields in "update" are merged — only specified fields change.
    """
    global _current_spec
    if _current_spec is None:
        return "Error: No current show. Use build_show first."

    try:
        import json as _json
        import copy

        changes_data = _json.loads(changes)
        spec = copy.deepcopy(_current_spec)
        timeline = spec["timeline"]

        for change in changes_data.get("changes", []):
            action = change["action"]

            if action == "remove":
                idx = change["index"]
                if 0 <= idx < len(timeline):
                    timeline.pop(idx)

            elif action == "update":
                idx = change["index"]
                if 0 <= idx < len(timeline):
                    entry = timeline[idx]
                    if "formation" in change:
                        entry["formation"].update(change["formation"])
                    if "color" in change:
                        entry["color"].update(change["color"])
                    if "time" in change:
                        entry["time"] = change["time"]
                    if "transition" in change:
                        entry["transition"] = change["transition"]

            elif action == "add":
                new_entry = {
                    "time": change["time"],
                    "formation": change["formation"],
                    "color": change["color"],
                }
                if "transition" in change:
                    new_entry["transition"] = change["transition"]
                else:
                    new_entry["transition"] = {"easing": "ease_in_out"}
                timeline.append(new_entry)
                timeline.sort(key=lambda e: e["time"])

        # Re-build with patched spec
        return build_show(_json.dumps(spec))

    except Exception as e:
        return f"Error updating show: {e}"
```

**Step 2: Update allowedTools in claude_code.rs**

In `droneai-studio/src-tauri/src/claude_code.rs`, update the `--allowedTools` list (lines 46-50):

Current:
```rust
"--allowedTools",
    "mcp__blender__execute_blender_code",
    "mcp__blender__get_scene_info",
    "mcp__blender__get_object_info",
    "mcp__blender__get_viewport_screenshot",
```

New:
```rust
"--allowedTools",
    "mcp__blender__execute_blender_code",
    "mcp__blender__get_scene_info",
    "mcp__blender__get_object_info",
    "mcp__blender__get_viewport_screenshot",
    "mcp__blender__build_show",
    "mcp__blender__update_show",
```

**Step 3: Verify Rust compiles**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio/src-tauri && cargo check`
Expected: Compiles with no new errors.

**Step 4: Commit**

```bash
git add droneai-studio/mcp-server/server.py droneai-studio/src-tauri/src/claude_code.rs
git commit -m "feat: add build_show and update_show MCP tools"
```

---

### Task 5: Update system prompt — scope restriction + spec-first workflow

**Files:**
- Modify: `droneai/system_prompt.md`
- Modify: `droneai-studio/resources/system_prompt.md` (keep in sync)

**Step 1: Rewrite the system prompt**

Replace the entire contents of `droneai/system_prompt.md`:

```markdown
# DroneAI Studio — System Prompt

You are a professional drone show designer. You ONLY help with drone show design, creation, and modification. If the user asks about anything unrelated to drone shows, politely redirect: "I'm specialized in drone show design. How can I help with your show?"

## How You Work

You build drone shows using a **declarative show spec** — a JSON structure describing formations, timing, and colors. You ALWAYS use the `build_show()` and `update_show()` tools for standard shows. Only use `execute_blender_code` for custom visual effects that the spec cannot express.

### Workflow

1. Understand what the user wants (formations, colors, timing, drone count)
2. Construct a show spec JSON
3. Call `build_show(spec)`
4. If safety fails, adjust the spec and retry
5. Present the result to the user with the safety report
6. For modifications, use `update_show(changes)`

### Show Spec Format

```json
{
  "drone_count": 25,
  "fps": 24,
  "timeline": [
    {
      "time": 0,
      "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.5, "altitude": 0}},
      "color": {"type": "solid", "value": [0.2, 0.2, 1.0]}
    },
    {
      "time": 3,
      "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 12, "altitude": 15}},
      "color": {"type": "solid", "value": [0, 0.8, 1]},
      "transition": {"easing": "ease_in_out"}
    }
  ]
}
```

### Formation Types

- `parametric` — uses built-in shapes: grid, circle, heart, star, spiral, sphere, text
  - grid: `{"spacing": 2.5, "altitude": 0}`
  - circle: `{"radius": 12, "altitude": 15}`
  - heart: `{"scale": 20, "altitude": 20}`
  - star: `{"outer_radius": 10, "inner_radius": 5, "points_count": 5, "altitude": 15}`
  - spiral: `{"radius": 10, "turns": 3, "altitude_start": 5, "altitude_end": 20}`
  - sphere: `{"radius": 10}`
  - text: `{"text": "HELLO", "scale": 10, "altitude": 15}`
- `positions` — explicit coordinates: `{"positions": [[x,y,z], ...]}`

### Color Types

- `solid` — all drones same color: `{"value": [r, g, b]}` (0.0–1.0)
- `gradient` — linear gradient: `{"start": [r,g,b], "end": [r,g,b], "axis": "x"|"y"|"z"}`

### Modifying Shows

Use `update_show()` with changes:
```json
{"changes": [
  {"action": "update", "index": 2, "formation": {"params": {"scale": 30}}},
  {"action": "add", "time": 12, "formation": {...}, "color": {...}},
  {"action": "remove", "index": 1}
]}
```

## Safety Rules (ALWAYS ENFORCED BY ENGINE)

The engine automatically validates these — you don't need to check manually:
- **Minimum spacing:** 2.0 meters between any two drones
- **Maximum altitude:** 120 meters
- **Maximum velocity:** 8 m/s
- **Maximum acceleration:** 4 m/s²
- **Takeoff/landing:** Always start and end on the ground in a grid formation

If `build_show` returns safety violations, adjust the spec (increase spacing, reduce scale, add more transition time) and retry.

## Transition Timing

Allow enough time between formations for drones to travel safely:
- Short distance (<10m): 2-3 seconds
- Medium distance (10-25m): 3-5 seconds
- Long distance (>25m): 5-8 seconds
- Always start with ground grid at time 0 and end with ground grid

## LED Color Guidelines

- Use bright, saturated colors for visibility
- Coordinate with formations: hearts=red, stars=gold, text=white
- Color transitions happen automatically between timeline entries

## Blender Coordinate System

- X: Right, Y: Forward, Z: Up
- Origin (0, 0, 0) is center of the ground
- Altitude = Z coordinate

## Response Style

- Be concise and action-oriented
- After building a show, present a summary table (time, formation, color)
- Include the safety report metrics
- Ask clarifying questions when the request is ambiguous
```

**Step 2: Copy to resources**

Run: `cp droneai/system_prompt.md droneai-studio/resources/system_prompt.md`

**Step 3: Commit**

```bash
git add droneai/system_prompt.md droneai-studio/resources/system_prompt.md
git commit -m "feat: update system prompt — scope restriction + spec-first workflow"
```

---

### Task 6: Copy updated engine files to resources

The Tauri app bundles droneai from `droneai-studio/resources/droneai/`. The new files need to be copied there.

**Files:**
- Copy: `droneai/engine/show_spec.py` → `droneai-studio/resources/droneai/engine/show_spec.py`
- Copy: `droneai/engine/show_builder.py` → `droneai-studio/resources/droneai/engine/show_builder.py`
- Copy: `droneai/engine/show_renderer.py` → `droneai-studio/resources/droneai/engine/show_renderer.py`

**Step 1: Copy files**

```bash
cp droneai/engine/show_spec.py droneai-studio/resources/droneai/engine/show_spec.py
cp droneai/engine/show_builder.py droneai-studio/resources/droneai/engine/show_builder.py
cp droneai/engine/show_renderer.py droneai-studio/resources/droneai/engine/show_renderer.py
```

**Step 2: Commit**

```bash
git add droneai-studio/resources/droneai/engine/
git commit -m "chore: sync new engine files to Tauri resources"
```

---

### Task 7: End-to-end integration test

**Step 1: Kill any orphaned Blender processes**

Run: `pkill -f "Blender --background --addons addon" || true`

**Step 2: Run all Python unit tests**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && python3 -m pytest droneai/tests/ -v`
Expected: All tests pass (existing + new show_spec + show_builder tests).

**Step 3: Start the Tauri app**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio && npm run tauri dev`

**Step 4: Test build_show via chat**

1. Launch Blender + Connect Claude in SetupScreen
2. Click "Start Designing"
3. Type: `create a simple drone show with 10 drones, starting as a grid on the ground, then forming a circle at 15m altitude, then a heart, then back to ground`
4. Expected: Claude constructs a spec JSON, calls `build_show`, reports safety metrics, viewport shows the show

**Step 5: Test update_show via chat**

Type: `make the heart bigger and change its color to pink`
Expected: Claude calls `update_show` with changes, show re-renders, viewport updates.

**Step 6: Test escape hatch**

Type: `add a custom spiral animation effect to the drones during the heart formation`
Expected: Claude uses `execute_blender_code` for the custom effect since the spec can't express it.

**Step 7: Test /test command still works**

Type: `/test`
Expected: 25-drone test show created (bypasses spec system, direct TCP).

**Step 8: Final commit if any adjustments**

```bash
git add -A
git commit -m "fix: adjustments from E2E testing of show spec system"
```
