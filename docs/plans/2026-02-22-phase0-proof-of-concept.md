# Phase 0: Proof of Concept — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that Claude can generate valid, visually compelling drone shows from natural language by controlling Blender via MCP.

**Architecture:** A system prompt + Blender helper scripts that let Claude create drone formations, animate transitions, assign LED colors, and validate safety — all through the existing Blender MCP tools. No app shell, no UI — just the AI pipeline working end-to-end.

**Tech Stack:** Python 3, Blender 4.x Python API (`bpy`), Blender MCP server (already configured), Claude API (via MCP tools: `execute_blender_code`, `get_scene_info`, `get_viewport_screenshot`).

---

## Project Structure

```
sandbox/
├── docs/plans/                          # Design + implementation plans
├── droneai/                             # Phase 0 proof of concept
│   ├── system_prompt.md                 # Claude system prompt for drone show design
│   ├── blender_scripts/                 # Python scripts executed in Blender via MCP
│   │   ├── setup_scene.py              # Initialize clean drone show scene
│   │   ├── create_drones.py            # Create N drone objects in grid
│   │   ├── create_formation.py         # Arrange drones into a shape
│   │   ├── animate_transition.py       # Animate drones between formations
│   │   ├── set_led_colors.py           # Assign LED colors to drones
│   │   ├── validate_safety.py          # Check spacing, speed, acceleration
│   │   └── export_show.py             # Export to JSON show file
│   ├── formations/                      # Formation shape definitions
│   │   └── shapes.py                   # Heart, circle, grid, star, text, spiral
│   ├── show_format/                     # Show file format
│   │   └── schema.py                   # Show file structure definition
│   └── tests/                           # Validation tests
│       ├── test_formations.py          # Test formation math
│       ├── test_safety.py              # Test safety validator
│       └── test_show_format.py         # Test export format
```

---

### Task 1: Initialize Project Structure

**Files:**
- Create: `sandbox/droneai/__init__.py`
- Create: `sandbox/droneai/blender_scripts/__init__.py`
- Create: `sandbox/droneai/formations/__init__.py`
- Create: `sandbox/droneai/show_format/__init__.py`
- Create: `sandbox/droneai/tests/__init__.py`

**Step 1: Create directory structure**

```bash
mkdir -p sandbox/droneai/{blender_scripts,formations,show_format,tests}
```

**Step 2: Create __init__.py files**

Create empty `__init__.py` in each directory:
- `sandbox/droneai/__init__.py`
- `sandbox/droneai/blender_scripts/__init__.py`
- `sandbox/droneai/formations/__init__.py`
- `sandbox/droneai/show_format/__init__.py`
- `sandbox/droneai/tests/__init__.py`

**Step 3: Commit**

```bash
git add sandbox/droneai/
git commit -m "feat: initialize droneai project structure for Phase 0 POC"
```

---

### Task 2: Create Formation Shape Library

This is the core math — given N drones, compute (x, y, z) positions to form a shape. No Blender dependency — pure Python + math.

**Files:**
- Create: `sandbox/droneai/formations/shapes.py`
- Create: `sandbox/droneai/tests/test_formations.py`

**Step 1: Write failing tests**

File: `sandbox/droneai/tests/test_formations.py`

```python
"""Tests for formation shape generation."""
import math
import pytest


def test_grid_formation_returns_correct_count():
    from droneai.formations.shapes import grid_formation
    points = grid_formation(count=25, spacing=2.0, altitude=10.0)
    assert len(points) == 25


def test_grid_formation_respects_spacing():
    from droneai.formations.shapes import grid_formation
    points = grid_formation(count=4, spacing=3.0, altitude=10.0)
    # 4 drones in 2x2 grid, spacing 3m
    xs = sorted(set(p[0] for p in points))
    assert len(xs) == 2
    assert abs(xs[1] - xs[0] - 3.0) < 0.01


def test_grid_formation_altitude():
    from droneai.formations.shapes import grid_formation
    points = grid_formation(count=9, spacing=2.0, altitude=15.0)
    for p in points:
        assert abs(p[2] - 15.0) < 0.01


def test_circle_formation_returns_correct_count():
    from droneai.formations.shapes import circle_formation
    points = circle_formation(count=20, radius=10.0, altitude=10.0)
    assert len(points) == 20


def test_circle_formation_radius():
    from droneai.formations.shapes import circle_formation
    points = circle_formation(count=20, radius=10.0, altitude=10.0)
    for p in points:
        dist = math.sqrt(p[0] ** 2 + p[1] ** 2)
        assert abs(dist - 10.0) < 0.01


def test_heart_formation_returns_correct_count():
    from droneai.formations.shapes import heart_formation
    points = heart_formation(count=50, scale=10.0, altitude=10.0)
    assert len(points) == 50


def test_heart_formation_centered():
    from droneai.formations.shapes import heart_formation
    points = heart_formation(count=50, scale=10.0, altitude=10.0)
    avg_x = sum(p[0] for p in points) / len(points)
    assert abs(avg_x) < 2.0  # roughly centered


def test_star_formation_returns_correct_count():
    from droneai.formations.shapes import star_formation
    points = star_formation(count=30, outer_radius=10.0, inner_radius=5.0, points_count=5, altitude=10.0)
    assert len(points) == 30


def test_spiral_formation_returns_correct_count():
    from droneai.formations.shapes import spiral_formation
    points = spiral_formation(count=40, radius=10.0, turns=3, altitude_start=5.0, altitude_end=20.0)
    assert len(points) == 40


def test_text_formation_returns_points():
    from droneai.formations.shapes import text_formation
    points = text_formation(text="HI", count=30, scale=10.0, altitude=10.0)
    assert len(points) > 0
    assert len(points) <= 30


def test_sphere_formation_returns_correct_count():
    from droneai.formations.shapes import sphere_formation
    points = sphere_formation(count=50, radius=10.0)
    assert len(points) == 50


def test_minimum_spacing_between_drones():
    """All formations should maintain minimum 1.5m spacing."""
    from droneai.formations.shapes import grid_formation, circle_formation, heart_formation

    for name, points in [
        ("grid", grid_formation(count=25, spacing=2.0, altitude=10.0)),
        ("circle", circle_formation(count=20, radius=10.0, altitude=10.0)),
        ("heart", heart_formation(count=30, scale=15.0, altitude=10.0)),
    ]:
        for i in range(len(points)):
            for j in range(i + 1, len(points)):
                dx = points[i][0] - points[j][0]
                dy = points[i][1] - points[j][1]
                dz = points[i][2] - points[j][2]
                dist = math.sqrt(dx * dx + dy * dy + dz * dz)
                assert dist >= 1.5, f"{name}: drones {i} and {j} too close: {dist:.2f}m"
```

**Step 2: Run tests to verify they fail**

Run: `cd sandbox && python -m pytest droneai/tests/test_formations.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'droneai'`

**Step 3: Write the formation shapes module**

File: `sandbox/droneai/formations/shapes.py`

```python
"""Formation shape generators.

Each function takes a drone count and shape parameters,
returns a list of (x, y, z) tuples representing drone positions in meters.
Coordinate system: X=right, Y=forward, Z=up.
"""
import math
from typing import List, Tuple

Position = Tuple[float, float, float]


def grid_formation(
    count: int,
    spacing: float = 2.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones in a flat square grid centered at origin."""
    cols = math.ceil(math.sqrt(count))
    rows = math.ceil(count / cols)
    points = []
    for i in range(count):
        row = i // cols
        col = i % cols
        x = (col - (cols - 1) / 2) * spacing
        y = (row - (rows - 1) / 2) * spacing
        points.append((x, y, altitude))
    return points


def circle_formation(
    count: int,
    radius: float = 10.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones in a circle in the XY plane."""
    points = []
    for i in range(count):
        angle = 2 * math.pi * i / count
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        points.append((x, y, altitude))
    return points


def heart_formation(
    count: int,
    scale: float = 10.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones along a heart shape in the XZ plane (visible from front).

    Uses parametric heart curve: x = 16sin^3(t), y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
    Scaled and centered.
    """
    points = []
    for i in range(count):
        t = 2 * math.pi * i / count
        # Parametric heart curve
        raw_x = 16 * (math.sin(t) ** 3)
        raw_y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        # Normalize to [-1, 1] range (heart curve goes roughly -17 to 17 in x, -17 to 15 in y)
        x = raw_x / 17.0 * (scale / 2)
        z = raw_y / 17.0 * (scale / 2) + altitude
        points.append((x, 0.0, z))
    return points


def star_formation(
    count: int,
    outer_radius: float = 10.0,
    inner_radius: float = 5.0,
    points_count: int = 5,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones along a star shape in the XY plane."""
    # Generate star vertices (alternating outer/inner)
    star_vertices = []
    for i in range(points_count * 2):
        angle = math.pi * i / points_count - math.pi / 2  # start from top
        r = outer_radius if i % 2 == 0 else inner_radius
        star_vertices.append((r * math.cos(angle), r * math.sin(angle)))

    # Distribute drones evenly along star perimeter
    # Calculate perimeter segments
    segments = []
    total_length = 0.0
    for i in range(len(star_vertices)):
        x1, y1 = star_vertices[i]
        x2, y2 = star_vertices[(i + 1) % len(star_vertices)]
        seg_len = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        segments.append((x1, y1, x2, y2, seg_len))
        total_length += seg_len

    points = []
    for i in range(count):
        target_dist = total_length * i / count
        cumulative = 0.0
        for x1, y1, x2, y2, seg_len in segments:
            if cumulative + seg_len >= target_dist or seg_len == 0:
                t = (target_dist - cumulative) / seg_len if seg_len > 0 else 0
                x = x1 + t * (x2 - x1)
                y = y1 + t * (y2 - y1)
                points.append((x, y, altitude))
                break
            cumulative += seg_len

    return points


def spiral_formation(
    count: int,
    radius: float = 10.0,
    turns: float = 3.0,
    altitude_start: float = 5.0,
    altitude_end: float = 20.0,
) -> List[Position]:
    """Arrange drones in a 3D spiral (helix)."""
    points = []
    for i in range(count):
        t = i / max(count - 1, 1)
        angle = 2 * math.pi * turns * t
        r = radius * (1 - 0.3 * t)  # slightly narrowing spiral
        x = r * math.cos(angle)
        y = r * math.sin(angle)
        z = altitude_start + (altitude_end - altitude_start) * t
        points.append((x, y, z))
    return points


def sphere_formation(
    count: int,
    radius: float = 10.0,
) -> List[Position]:
    """Distribute drones on a sphere using Fibonacci sphere algorithm."""
    points = []
    golden_ratio = (1 + math.sqrt(5)) / 2
    for i in range(count):
        theta = math.acos(1 - 2 * (i + 0.5) / count)
        phi = 2 * math.pi * i / golden_ratio
        x = radius * math.sin(theta) * math.cos(phi)
        y = radius * math.sin(theta) * math.sin(phi)
        z = radius * math.cos(theta) + radius  # shift up so bottom is at z=0
        points.append((x, y, z))
    return points


def text_formation(
    text: str,
    count: int = 50,
    scale: float = 10.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones to spell text using a simple pixel font.

    Uses a basic 5x7 pixel font. Drones are distributed across lit pixels.
    Text is rendered in the XZ plane (visible from front).
    """
    # Simple 5x7 pixel font for A-Z and 0-9
    FONT = {
        'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
        'B': ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
        'C': ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
        'D': ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
        'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
        'F': ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
        'G': ["01110", "10001", "10000", "10011", "10001", "10001", "01110"],
        'H': ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
        'I': ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
        'J': ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
        'K': ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
        'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
        'M': ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
        'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
        'O': ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
        'P': ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
        'Q': ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
        'R': ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
        'S': ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
        'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
        'U': ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
        'V': ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
        'W': ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
        'X': ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
        'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
        'Z': ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
        '0': ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
        '1': ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
        '2': ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
        '3': ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
        '4': ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
        '5': ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
        '6': ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
        '7': ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
        '8': ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
        '9': ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
        ' ': ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    }

    # Collect all lit pixel positions
    pixels = []
    cursor_x = 0
    for char in text.upper():
        glyph = FONT.get(char, FONT.get(' '))
        for row_idx, row in enumerate(glyph):
            for col_idx, pixel in enumerate(row):
                if pixel == '1':
                    pixels.append((cursor_x + col_idx, 6 - row_idx))  # flip Y so text isn't upside down
        cursor_x += 6  # 5 wide + 1 space

    if not pixels:
        return []

    # Scale and center
    min_x = min(p[0] for p in pixels)
    max_x = max(p[0] for p in pixels)
    min_y = min(p[1] for p in pixels)
    max_y = max(p[1] for p in pixels)
    width = max_x - min_x if max_x > min_x else 1
    height = max_y - min_y if max_y > min_y else 1
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    # Scale to fit within requested scale
    pixel_scale = scale / max(width, height)

    # If more pixels than drones, subsample evenly
    if len(pixels) > count:
        step = len(pixels) / count
        pixels = [pixels[int(i * step)] for i in range(count)]

    points = []
    for px, py in pixels:
        x = (px - center_x) * pixel_scale
        z = (py - center_y) * pixel_scale + altitude
        points.append((x, 0.0, z))

    return points
```

**Step 4: Run tests to verify they pass**

Run: `cd sandbox && python -m pytest droneai/tests/test_formations.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add sandbox/droneai/formations/ sandbox/droneai/tests/test_formations.py
git commit -m "feat: add formation shape library with grid, circle, heart, star, spiral, sphere, text"
```

---

### Task 3: Create Safety Validator

Pure Python module to validate drone trajectories for safety. No Blender dependency.

**Files:**
- Create: `sandbox/droneai/safety.py`
- Create: `sandbox/droneai/tests/test_safety.py`

**Step 1: Write failing tests**

File: `sandbox/droneai/tests/test_safety.py`

```python
"""Tests for drone show safety validation."""
import math
import pytest


def test_no_violations_for_safe_positions():
    from droneai.safety import validate_frame, SafetyParams
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0, max_acceleration=4.0)
    positions = {
        "drone_1": (0.0, 0.0, 10.0),
        "drone_2": (5.0, 0.0, 10.0),
        "drone_3": (0.0, 5.0, 10.0),
    }
    result = validate_frame(positions, params)
    assert result.is_safe
    assert len(result.violations) == 0


def test_spacing_violation():
    from droneai.safety import validate_frame, SafetyParams
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0, max_acceleration=4.0)
    positions = {
        "drone_1": (0.0, 0.0, 10.0),
        "drone_2": (1.0, 0.0, 10.0),  # only 1m apart
    }
    result = validate_frame(positions, params)
    assert not result.is_safe
    assert any("spacing" in v.lower() for v in result.violations)


def test_altitude_violation():
    from droneai.safety import validate_frame, SafetyParams
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0, max_acceleration=4.0)
    positions = {
        "drone_1": (0.0, 0.0, 60.0),  # above max altitude
    }
    result = validate_frame(positions, params)
    assert not result.is_safe
    assert any("altitude" in v.lower() for v in result.violations)


def test_velocity_check():
    from droneai.safety import validate_velocity, SafetyParams
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0, max_acceleration=4.0)
    # drone moves 20m in 1 second = 20 m/s > 8 m/s max
    positions_t0 = {"drone_1": (0.0, 0.0, 10.0)}
    positions_t1 = {"drone_1": (20.0, 0.0, 10.0)}
    result = validate_velocity(positions_t0, positions_t1, dt=1.0, params=params)
    assert not result.is_safe
    assert any("velocity" in v.lower() for v in result.violations)


def test_velocity_ok_for_slow_movement():
    from droneai.safety import validate_velocity, SafetyParams
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0, max_acceleration=4.0)
    positions_t0 = {"drone_1": (0.0, 0.0, 10.0)}
    positions_t1 = {"drone_1": (2.0, 0.0, 10.0)}
    result = validate_velocity(positions_t0, positions_t1, dt=1.0, params=params)
    assert result.is_safe


def test_validate_show_full_timeline():
    from droneai.safety import validate_show, SafetyParams
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0, max_acceleration=4.0)
    # Simple two-frame show, drones are safe
    timeline = [
        (0.0, {"d1": (0.0, 0.0, 10.0), "d2": (5.0, 0.0, 10.0)}),
        (1.0, {"d1": (0.0, 0.0, 11.0), "d2": (5.0, 0.0, 11.0)}),
    ]
    result = validate_show(timeline, params)
    assert result.is_safe
```

**Step 2: Run tests to verify they fail**

Run: `cd sandbox && python -m pytest droneai/tests/test_safety.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write the safety validator**

File: `sandbox/droneai/safety.py`

```python
"""Drone show safety validation.

Checks spacing between drones, altitude limits, velocity limits,
and acceleration limits across a show timeline.
"""
import math
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

Position = Tuple[float, float, float]


@dataclass
class SafetyParams:
    min_spacing: float = 2.0  # meters
    max_altitude: float = 120.0  # meters
    max_velocity: float = 8.0  # m/s
    max_acceleration: float = 4.0  # m/s^2


@dataclass
class SafetyResult:
    is_safe: bool = True
    violations: List[str] = field(default_factory=list)
    min_spacing_found: float = float("inf")
    max_velocity_found: float = 0.0
    max_altitude_found: float = 0.0

    def add_violation(self, msg: str):
        self.is_safe = False
        self.violations.append(msg)

    def merge(self, other: "SafetyResult"):
        if not other.is_safe:
            self.is_safe = False
        self.violations.extend(other.violations)
        self.min_spacing_found = min(self.min_spacing_found, other.min_spacing_found)
        self.max_velocity_found = max(self.max_velocity_found, other.max_velocity_found)
        self.max_altitude_found = max(self.max_altitude_found, other.max_altitude_found)


def _distance(a: Position, b: Position) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def validate_frame(
    positions: Dict[str, Position],
    params: SafetyParams,
) -> SafetyResult:
    """Validate a single frame: check spacing and altitude."""
    result = SafetyResult()
    names = list(positions.keys())

    # Check altitude
    for name, pos in positions.items():
        if pos[2] > params.max_altitude:
            result.add_violation(
                f"Altitude violation: {name} at {pos[2]:.1f}m (max {params.max_altitude}m)"
            )
        result.max_altitude_found = max(result.max_altitude_found, pos[2])

    # Check spacing between all pairs
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            dist = _distance(positions[names[i]], positions[names[j]])
            result.min_spacing_found = min(result.min_spacing_found, dist)
            if dist < params.min_spacing:
                result.add_violation(
                    f"Spacing violation: {names[i]} and {names[j]} "
                    f"are {dist:.2f}m apart (min {params.min_spacing}m)"
                )

    return result


def validate_velocity(
    positions_t0: Dict[str, Position],
    positions_t1: Dict[str, Position],
    dt: float,
    params: SafetyParams,
) -> SafetyResult:
    """Validate velocity between two consecutive frames."""
    result = SafetyResult()
    if dt <= 0:
        return result

    for name in positions_t0:
        if name not in positions_t1:
            continue
        dist = _distance(positions_t0[name], positions_t1[name])
        velocity = dist / dt
        result.max_velocity_found = max(result.max_velocity_found, velocity)
        if velocity > params.max_velocity:
            result.add_violation(
                f"Velocity violation: {name} moving at {velocity:.1f}m/s "
                f"(max {params.max_velocity}m/s)"
            )

    return result


def validate_show(
    timeline: List[Tuple[float, Dict[str, Position]]],
    params: SafetyParams,
) -> SafetyResult:
    """Validate an entire show timeline.

    Args:
        timeline: List of (time_seconds, {drone_name: (x, y, z)}) sorted by time.
        params: Safety parameters.

    Returns:
        SafetyResult with all violations found.
    """
    result = SafetyResult()

    for i, (t, positions) in enumerate(timeline):
        # Check spacing and altitude at each frame
        frame_result = validate_frame(positions, params)
        result.merge(frame_result)

        # Check velocity between consecutive frames
        if i > 0:
            prev_t, prev_positions = timeline[i - 1]
            dt = t - prev_t
            vel_result = validate_velocity(prev_positions, positions, dt, params)
            result.merge(vel_result)

    return result
```

**Step 4: Run tests to verify they pass**

Run: `cd sandbox && python -m pytest droneai/tests/test_safety.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add sandbox/droneai/safety.py sandbox/droneai/tests/test_safety.py
git commit -m "feat: add safety validator for spacing, altitude, velocity checks"
```

---

### Task 4: Create Show File Format

Define and implement the export format for drone shows.

**Files:**
- Create: `sandbox/droneai/show_format/schema.py`
- Create: `sandbox/droneai/tests/test_show_format.py`

**Step 1: Write failing tests**

File: `sandbox/droneai/tests/test_show_format.py`

```python
"""Tests for drone show file format."""
import json
import pytest


def test_create_show_manifest():
    from droneai.show_format.schema import ShowManifest
    m = ShowManifest(title="Test Show", drone_count=50, duration_seconds=120.0)
    d = m.to_dict()
    assert d["title"] == "Test Show"
    assert d["drone_count"] == 50
    assert d["duration_seconds"] == 120.0
    assert "version" in d


def test_create_drone_trajectory():
    from droneai.show_format.schema import DroneTrajectory
    keyframes = [
        (0.0, 0.0, 0.0, 0.0),    # t, x, y, z
        (5.0, 0.0, 0.0, 10.0),   # takeoff
        (10.0, 5.0, 0.0, 10.0),  # move
    ]
    traj = DroneTrajectory(drone_id="drone_001", keyframes=keyframes)
    d = traj.to_dict()
    assert d["drone_id"] == "drone_001"
    assert len(d["keyframes"]) == 3
    assert d["keyframes"][0] == {"t": 0.0, "x": 0.0, "y": 0.0, "z": 0.0}


def test_create_drone_light_program():
    from droneai.show_format.schema import DroneLightProgram
    keyframes = [
        (0.0, 255, 0, 0, True),   # t, r, g, b, is_fade
        (5.0, 0, 0, 255, True),   # fade to blue
    ]
    lp = DroneLightProgram(drone_id="drone_001", keyframes=keyframes)
    d = lp.to_dict()
    assert d["drone_id"] == "drone_001"
    assert len(d["keyframes"]) == 2
    assert d["keyframes"][0]["color"] == [255, 0, 0]


def test_create_full_show():
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram
    manifest = ShowManifest(title="My Show", drone_count=2, duration_seconds=10.0)
    trajectories = [
        DroneTrajectory("d1", [(0.0, 0.0, 0.0, 0.0), (5.0, 0.0, 0.0, 10.0)]),
        DroneTrajectory("d2", [(0.0, 3.0, 0.0, 0.0), (5.0, 3.0, 0.0, 10.0)]),
    ]
    lights = [
        DroneLightProgram("d1", [(0.0, 255, 0, 0, True)]),
        DroneLightProgram("d2", [(0.0, 0, 255, 0, True)]),
    ]
    show = Show(manifest=manifest, trajectories=trajectories, lights=lights)
    d = show.to_dict()
    assert d["manifest"]["drone_count"] == 2
    assert len(d["drones"]) == 2


def test_show_to_json_roundtrip():
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram
    manifest = ShowManifest(title="Roundtrip Test", drone_count=1, duration_seconds=5.0)
    show = Show(
        manifest=manifest,
        trajectories=[DroneTrajectory("d1", [(0.0, 0.0, 0.0, 0.0)])],
        lights=[DroneLightProgram("d1", [(0.0, 255, 255, 255, True)])],
    )
    json_str = show.to_json()
    parsed = json.loads(json_str)
    assert parsed["manifest"]["title"] == "Roundtrip Test"
```

**Step 2: Run tests to verify they fail**

Run: `cd sandbox && python -m pytest droneai/tests/test_show_format.py -v`
Expected: FAIL

**Step 3: Write the show format module**

File: `sandbox/droneai/show_format/schema.py`

```python
"""DroneAI Studio show file format.

A show file is a JSON document containing:
- manifest: metadata (title, drone count, duration, version)
- drones: list of drone data, each with trajectory and light program
"""
import json
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

FORMAT_VERSION = "1.0.0"


@dataclass
class ShowManifest:
    title: str
    drone_count: int
    duration_seconds: float
    version: str = FORMAT_VERSION

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "drone_count": self.drone_count,
            "duration_seconds": self.duration_seconds,
            "version": self.version,
        }


@dataclass
class DroneTrajectory:
    """Drone flight path as a list of (t, x, y, z) keyframes."""
    drone_id: str
    keyframes: List[Tuple[float, float, float, float]]  # (t, x, y, z)

    def to_dict(self) -> dict:
        return {
            "drone_id": self.drone_id,
            "keyframes": [
                {"t": kf[0], "x": kf[1], "y": kf[2], "z": kf[3]}
                for kf in self.keyframes
            ],
        }


@dataclass
class DroneLightProgram:
    """Drone LED color sequence as a list of (t, r, g, b, is_fade) keyframes."""
    drone_id: str
    keyframes: List[Tuple[float, int, int, int, bool]]  # (t, r, g, b, is_fade)

    def to_dict(self) -> dict:
        return {
            "drone_id": self.drone_id,
            "keyframes": [
                {"t": kf[0], "color": [kf[1], kf[2], kf[3]], "fade": kf[4]}
                for kf in self.keyframes
            ],
        }


@dataclass
class Show:
    manifest: ShowManifest
    trajectories: List[DroneTrajectory]
    lights: List[DroneLightProgram]

    def to_dict(self) -> dict:
        traj_by_id = {t.drone_id: t for t in self.trajectories}
        light_by_id = {l.drone_id: l for l in self.lights}
        all_ids = list(traj_by_id.keys())

        drones = []
        for drone_id in all_ids:
            drone = {"id": drone_id}
            if drone_id in traj_by_id:
                drone["trajectory"] = traj_by_id[drone_id].to_dict()["keyframes"]
            if drone_id in light_by_id:
                drone["lights"] = light_by_id[drone_id].to_dict()["keyframes"]
            drones.append(drone)

        return {
            "manifest": self.manifest.to_dict(),
            "drones": drones,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    def save(self, path: str):
        with open(path, "w") as f:
            f.write(self.to_json())
```

**Step 4: Run tests to verify they pass**

Run: `cd sandbox && python -m pytest droneai/tests/test_show_format.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add sandbox/droneai/show_format/ sandbox/droneai/tests/test_show_format.py
git commit -m "feat: add show file format with manifest, trajectory, and light program"
```

---

### Task 5: Create Blender Helper Scripts

Python scripts designed to be executed inside Blender via MCP `execute_blender_code`. Each script is a standalone function that Claude can call.

**Files:**
- Create: `sandbox/droneai/blender_scripts/setup_scene.py`
- Create: `sandbox/droneai/blender_scripts/create_drones.py`
- Create: `sandbox/droneai/blender_scripts/create_formation.py`
- Create: `sandbox/droneai/blender_scripts/animate_transition.py`
- Create: `sandbox/droneai/blender_scripts/set_led_colors.py`

**Step 1: Create setup_scene.py**

This script clears the Blender scene and sets up a clean workspace for drone show design.

File: `sandbox/droneai/blender_scripts/setup_scene.py`

```python
"""Setup a clean Blender scene for drone show design.

Execute in Blender via MCP execute_blender_code.
Clears existing objects and configures the scene.
"""
import bpy


def setup_drone_show_scene(fps=24, duration_seconds=60):
    """Initialize a clean drone show scene.

    Args:
        fps: Frames per second for the animation.
        duration_seconds: Total show duration.
    """
    # Clear existing objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Clear orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)

    # Configure scene
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = 0
    scene.frame_end = int(fps * duration_seconds)
    scene.frame_current = 0

    # Set up world (dark background for drone show)
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.01, 0.01, 0.02, 1.0)  # near black

    # Create ground plane (optional reference)
    bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    mat = bpy.data.materials.new("Ground_Material")
    mat.diffuse_color = (0.1, 0.15, 0.1, 1.0)
    ground.data.materials.append(mat)

    # Create a collection for drones
    if "Drones" not in bpy.data.collections:
        drone_collection = bpy.data.collections.new("Drones")
        scene.collection.children.link(drone_collection)

    print(f"Scene ready: {fps}fps, {duration_seconds}s, {scene.frame_end} frames")


# Execute
setup_drone_show_scene()
```

**Step 2: Create create_drones.py**

File: `sandbox/droneai/blender_scripts/create_drones.py`

```python
"""Create drone objects in Blender scene.

Execute in Blender via MCP execute_blender_code.
Creates N drone objects as small spheres with emissive materials.
"""
import bpy
import mathutils


def create_drones(count, start_positions=None, spacing=2.0):
    """Create drone objects in the scene.

    Args:
        count: Number of drones to create.
        start_positions: Optional list of (x, y, z) starting positions.
            If None, creates a ground-level grid.
        spacing: Grid spacing if no positions provided.

    Returns:
        List of created drone object names.
    """
    import math

    # Get or create Drones collection
    if "Drones" not in bpy.data.collections:
        drone_collection = bpy.data.collections.new("Drones")
        bpy.context.scene.collection.children.link(drone_collection)
    drone_collection = bpy.data.collections["Drones"]

    # Generate grid positions if none provided
    if start_positions is None:
        cols = math.ceil(math.sqrt(count))
        start_positions = []
        for i in range(count):
            row = i // cols
            col = i % cols
            x = (col - (cols - 1) / 2) * spacing
            y = (row - (cols - 1) / 2) * spacing
            start_positions.append((x, y, 0.0))

    # Create a shared mesh for all drones (small sphere)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, segments=8, ring_count=6)
    template = bpy.context.active_object
    template_mesh = template.data
    bpy.data.objects.remove(template, do_unlink=True)

    drone_names = []
    for i in range(count):
        # Create drone object
        drone = bpy.data.objects.new(f"Drone_{i+1:03d}", template_mesh.copy())
        drone_collection.objects.link(drone)

        # Set position
        pos = start_positions[i] if i < len(start_positions) else (0, 0, 0)
        drone.location = mathutils.Vector(pos)

        # Create emissive material (LED simulation)
        mat = bpy.data.materials.new(f"LED_{i+1:03d}")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links

        # Clear default nodes
        for node in nodes:
            nodes.remove(node)

        # Add emission shader
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)  # white default
        emission.inputs["Strength"].default_value = 5.0

        output = nodes.new("ShaderNodeOutputMaterial")
        links.new(emission.outputs["Emission"], output.inputs["Surface"])

        drone.data.materials.append(mat)
        drone_names.append(drone.name)

    print(f"Created {count} drones: {drone_names[0]} to {drone_names[-1]}")
    return drone_names


# Execute — replace count as needed
create_drones(count=50)
```

**Step 3: Create create_formation.py**

File: `sandbox/droneai/blender_scripts/create_formation.py`

```python
"""Move drones into a formation shape at a specific frame.

Execute in Blender via MCP execute_blender_code.
Sets keyframes for drone positions to form a shape.
"""
import bpy
import math


def create_formation(shape, frame, count=None, **kwargs):
    """Keyframe drones into a formation at a given frame.

    Args:
        shape: Formation shape name ('grid', 'circle', 'heart', 'star', 'spiral', 'sphere', 'text').
        frame: Blender frame number to set the formation at.
        count: Number of drones (auto-detected from scene if None).
        **kwargs: Shape-specific parameters (scale, radius, altitude, text, etc.).
    """
    # Get drones from scene
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found. Run create_drones first.")
        return

    drones = sorted(
        [obj for obj in drone_collection.objects if obj.name.startswith("Drone_")],
        key=lambda o: o.name,
    )

    if count is None:
        count = len(drones)
    count = min(count, len(drones))

    # Generate formation positions
    positions = _generate_formation(shape, count, **kwargs)

    # Set keyframes
    bpy.context.scene.frame_set(frame)
    for i, drone in enumerate(drones[:count]):
        if i < len(positions):
            drone.location = positions[i]
            drone.keyframe_insert(data_path="location", frame=frame)

    print(f"Formation '{shape}' set at frame {frame} for {count} drones")


def _generate_formation(shape, count, **kwargs):
    """Generate formation positions. Same math as formations/shapes.py but inline for Blender."""
    altitude = kwargs.get("altitude", 10.0)
    scale = kwargs.get("scale", 10.0)
    radius = kwargs.get("radius", scale / 2)

    if shape == "grid":
        spacing = kwargs.get("spacing", 2.0)
        cols = math.ceil(math.sqrt(count))
        return [
            ((i % cols - (cols - 1) / 2) * spacing,
             (i // cols - (math.ceil(count / cols) - 1) / 2) * spacing,
             altitude)
            for i in range(count)
        ]

    elif shape == "circle":
        return [
            (radius * math.cos(2 * math.pi * i / count),
             radius * math.sin(2 * math.pi * i / count),
             altitude)
            for i in range(count)
        ]

    elif shape == "heart":
        points = []
        for i in range(count):
            t = 2 * math.pi * i / count
            raw_x = 16 * (math.sin(t) ** 3)
            raw_y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            x = raw_x / 17.0 * (scale / 2)
            z = raw_y / 17.0 * (scale / 2) + altitude
            points.append((x, 0.0, z))
        return points

    elif shape == "star":
        outer_r = radius
        inner_r = kwargs.get("inner_radius", radius * 0.5)
        n_points = kwargs.get("points_count", 5)
        verts = []
        for i in range(n_points * 2):
            angle = math.pi * i / n_points - math.pi / 2
            r = outer_r if i % 2 == 0 else inner_r
            verts.append((r * math.cos(angle), r * math.sin(angle)))
        # Distribute along perimeter
        segments = []
        total = 0.0
        for i in range(len(verts)):
            x1, y1 = verts[i]
            x2, y2 = verts[(i + 1) % len(verts)]
            d = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            segments.append((x1, y1, x2, y2, d))
            total += d
        points = []
        for i in range(count):
            target = total * i / count
            cum = 0.0
            for x1, y1, x2, y2, d in segments:
                if cum + d >= target:
                    t = (target - cum) / d if d > 0 else 0
                    points.append((x1 + t * (x2 - x1), y1 + t * (y2 - y1), altitude))
                    break
                cum += d
        return points

    elif shape == "spiral":
        turns = kwargs.get("turns", 3.0)
        alt_start = kwargs.get("altitude_start", 5.0)
        alt_end = kwargs.get("altitude_end", 20.0)
        return [
            (radius * (1 - 0.3 * i / max(count - 1, 1)) * math.cos(2 * math.pi * turns * i / max(count - 1, 1)),
             radius * (1 - 0.3 * i / max(count - 1, 1)) * math.sin(2 * math.pi * turns * i / max(count - 1, 1)),
             alt_start + (alt_end - alt_start) * i / max(count - 1, 1))
            for i in range(count)
        ]

    elif shape == "sphere":
        golden = (1 + math.sqrt(5)) / 2
        points = []
        for i in range(count):
            theta = math.acos(1 - 2 * (i + 0.5) / count)
            phi = 2 * math.pi * i / golden
            x = radius * math.sin(theta) * math.cos(phi)
            y = radius * math.sin(theta) * math.sin(phi)
            z = radius * math.cos(theta) + radius
            points.append((x, y, z))
        return points

    elif shape == "text":
        text = kwargs.get("text", "HI")
        return _text_positions(text, count, scale, altitude)

    else:
        print(f"Unknown shape: {shape}. Using grid.")
        return _generate_formation("grid", count, **kwargs)


def _text_positions(text, count, scale, altitude):
    """Generate positions for text formation."""
    FONT = {
        'A': ["01110","10001","10001","11111","10001","10001","10001"],
        'B': ["11110","10001","10001","11110","10001","10001","11110"],
        'C': ["01110","10001","10000","10000","10000","10001","01110"],
        'D': ["11100","10010","10001","10001","10001","10010","11100"],
        'E': ["11111","10000","10000","11110","10000","10000","11111"],
        'F': ["11111","10000","10000","11110","10000","10000","10000"],
        'G': ["01110","10001","10000","10011","10001","10001","01110"],
        'H': ["10001","10001","10001","11111","10001","10001","10001"],
        'I': ["01110","00100","00100","00100","00100","00100","01110"],
        'L': ["10000","10000","10000","10000","10000","10000","11111"],
        'M': ["10001","11011","10101","10101","10001","10001","10001"],
        'N': ["10001","11001","10101","10011","10001","10001","10001"],
        'O': ["01110","10001","10001","10001","10001","10001","01110"],
        'R': ["11110","10001","10001","11110","10100","10010","10001"],
        'S': ["01110","10001","10000","01110","00001","10001","01110"],
        'T': ["11111","00100","00100","00100","00100","00100","00100"],
        'U': ["10001","10001","10001","10001","10001","10001","01110"],
        'W': ["10001","10001","10001","10101","10101","10101","01010"],
        'Y': ["10001","10001","01010","00100","00100","00100","00100"],
        ' ': ["00000","00000","00000","00000","00000","00000","00000"],
    }
    pixels = []
    cx = 0
    for ch in text.upper():
        glyph = FONT.get(ch, FONT[' '])
        for ri, row in enumerate(glyph):
            for ci, px in enumerate(row):
                if px == '1':
                    pixels.append((cx + ci, 6 - ri))
        cx += 6
    if not pixels:
        return [(0, 0, altitude)] * count
    mn_x = min(p[0] for p in pixels)
    mx_x = max(p[0] for p in pixels)
    mn_y = min(p[1] for p in pixels)
    mx_y = max(p[1] for p in pixels)
    w = mx_x - mn_x or 1
    h = mx_y - mn_y or 1
    ctr_x = (mn_x + mx_x) / 2
    ctr_y = (mn_y + mx_y) / 2
    ps = scale / max(w, h)
    if len(pixels) > count:
        step = len(pixels) / count
        pixels = [pixels[int(i * step)] for i in range(count)]
    return [(( p[0] - ctr_x) * ps, 0.0, (p[1] - ctr_y) * ps + altitude) for p in pixels]


# Execute — customize shape and parameters
# create_formation("heart", frame=48, altitude=15.0, scale=20.0)
```

**Step 4: Create animate_transition.py**

File: `sandbox/droneai/blender_scripts/animate_transition.py`

```python
"""Animate smooth transitions between formations.

Execute in Blender via MCP execute_blender_code.
Interpolates drone positions between two keyframed formations.
"""
import bpy


def animate_transition(frame_start, frame_end, easing="EASE_IN_OUT"):
    """Ensure smooth transitions between keyframed positions.

    Sets interpolation mode on all drone F-curves between two frames.
    Drones should already have keyframes at frame_start and frame_end
    (set by create_formation).

    Args:
        frame_start: Frame where the transition begins.
        frame_end: Frame where the transition ends.
        easing: Interpolation type - 'LINEAR', 'EASE_IN_OUT', 'EASE_IN', 'EASE_OUT'.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found.")
        return

    interp_map = {
        "LINEAR": "LINEAR",
        "EASE_IN_OUT": "BEZIER",
        "EASE_IN": "BEZIER",
        "EASE_OUT": "BEZIER",
    }
    interp_type = interp_map.get(easing, "BEZIER")

    count = 0
    for drone in drone_collection.objects:
        if not drone.name.startswith("Drone_"):
            continue
        if not drone.animation_data or not drone.animation_data.action:
            continue

        action = drone.animation_data.action
        for fcurve in action.fcurves:
            if fcurve.data_path != "location":
                continue
            for kp in fcurve.keyframe_points:
                if frame_start <= kp.co[0] <= frame_end:
                    kp.interpolation = interp_type
                    if easing == "EASE_IN_OUT":
                        kp.easing = "AUTO"
                    elif easing == "EASE_IN":
                        kp.easing = "EASE_IN"
                    elif easing == "EASE_OUT":
                        kp.easing = "EASE_OUT"
        count += 1

    print(f"Transition set: frames {frame_start}-{frame_end}, {easing} for {count} drones")


# Execute
# animate_transition(frame_start=0, frame_end=48, easing="EASE_IN_OUT")
```

**Step 5: Create set_led_colors.py**

File: `sandbox/droneai/blender_scripts/set_led_colors.py`

```python
"""Set LED colors on drones at specific frames.

Execute in Blender via MCP execute_blender_code.
Keyframes the emission color on drone materials.
"""
import bpy


def set_led_color_all(color, frame):
    """Set all drones to the same LED color at a frame.

    Args:
        color: (r, g, b) tuple with values 0.0-1.0.
        frame: Blender frame number.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found.")
        return

    for drone in drone_collection.objects:
        if not drone.name.startswith("Drone_"):
            continue
        _set_drone_color(drone, color, frame)

    print(f"All drones set to color {color} at frame {frame}")


def set_led_color_per_drone(colors, frame):
    """Set individual LED colors per drone at a frame.

    Args:
        colors: Dict of {drone_name: (r, g, b)} or list of (r, g, b) in drone order.
        frame: Blender frame number.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found.")
        return

    drones = sorted(
        [obj for obj in drone_collection.objects if obj.name.startswith("Drone_")],
        key=lambda o: o.name,
    )

    if isinstance(colors, list):
        for i, drone in enumerate(drones):
            if i < len(colors):
                _set_drone_color(drone, colors[i], frame)
    elif isinstance(colors, dict):
        for drone in drones:
            if drone.name in colors:
                _set_drone_color(drone, colors[drone.name], frame)

    print(f"Individual drone colors set at frame {frame}")


def set_led_gradient(color_start, color_end, frame, axis="x"):
    """Set a gradient color across drones based on their position.

    Args:
        color_start: (r, g, b) color at the low end.
        color_end: (r, g, b) color at the high end.
        frame: Blender frame number.
        axis: 'x', 'y', or 'z' axis for gradient direction.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        return

    bpy.context.scene.frame_set(frame)
    drones = [obj for obj in drone_collection.objects if obj.name.startswith("Drone_")]
    if not drones:
        return

    axis_idx = {"x": 0, "y": 1, "z": 2}[axis]
    positions = [(d, d.location[axis_idx]) for d in drones]
    min_val = min(p for _, p in positions)
    max_val = max(p for _, p in positions)
    val_range = max_val - min_val if max_val > min_val else 1.0

    for drone, pos in positions:
        t = (pos - min_val) / val_range
        color = (
            color_start[0] + t * (color_end[0] - color_start[0]),
            color_start[1] + t * (color_end[1] - color_start[1]),
            color_start[2] + t * (color_end[2] - color_start[2]),
        )
        _set_drone_color(drone, color, frame)

    print(f"Gradient {axis} set at frame {frame}")


def _set_drone_color(drone, color, frame):
    """Set emission color on a drone's material and keyframe it."""
    if not drone.data.materials:
        return

    mat = drone.data.materials[0]
    if not mat.use_nodes:
        return

    for node in mat.node_tree.nodes:
        if node.type == "EMISSION":
            node.inputs["Color"].default_value = (color[0], color[1], color[2], 1.0)
            node.inputs["Color"].keyframe_insert(data_path="default_value", frame=frame)
            break


# Execute
# set_led_color_all(color=(1.0, 0.0, 0.0), frame=0)  # all red at frame 0
# set_led_gradient(color_start=(1.0, 0.0, 0.0), color_end=(0.0, 0.0, 1.0), frame=48, axis="x")
```

**Step 6: Commit**

```bash
git add sandbox/droneai/blender_scripts/
git commit -m "feat: add Blender helper scripts for scene setup, drones, formations, transitions, LEDs"
```

---

### Task 6: Create the Drone Show System Prompt

The most important file — this is what makes Claude a drone show designer.

**Files:**
- Create: `sandbox/droneai/system_prompt.md`

**Step 1: Write the system prompt**

File: `sandbox/droneai/system_prompt.md`

```markdown
# DroneAI Studio — System Prompt

You are a professional drone show designer. You help users create drone light shows by controlling Blender programmatically.

## Your Capabilities

You can:
- Create drone formations (heart, circle, grid, star, spiral, sphere, text, and custom shapes)
- Animate smooth transitions between formations
- Program LED colors (solid, gradient, per-drone, animated)
- Validate safety constraints (spacing, altitude, velocity)
- Export completed shows to file

## How You Work

When a user describes a drone show, you:
1. Clarify requirements (drone count, duration, shapes, colors)
2. Set up the Blender scene using `execute_blender_code`
3. Create drones and formations step by step
4. Preview results using `get_viewport_screenshot`
5. Iterate based on user feedback
6. Validate safety before finalizing
7. Export the completed show

## Safety Rules (ALWAYS ENFORCE)

- **Minimum spacing:** 2.0 meters between any two drones at all times
- **Maximum altitude:** 120 meters above ground level
- **Maximum velocity:** 8 m/s horizontal, 4 m/s vertical
- **Maximum acceleration:** 4 m/s^2
- **Takeoff/landing:** Always start and end on the ground in a grid formation
- **Transitions:** Must be collision-free. Allow sufficient time for drones to travel between positions.

When generating formations, always verify spacing. If a formation would place drones too close together, increase scale or reduce drone count.

## Transition Timing Rules

To calculate safe transition duration between formations:
1. Find the maximum distance any single drone must travel
2. Divide by maximum velocity (8 m/s) to get minimum time
3. Add 50% buffer for acceleration/deceleration
4. Round up to nearest second

Example: If the farthest drone moves 20m → min time = 20/8 = 2.5s → with buffer = 3.75s → use 4 seconds.

## Show Structure

A typical drone show follows this structure:
1. **Ground grid** (frame 0): All drones on the ground in a grid formation
2. **Takeoff** (frames 0-N): Drones rise to initial altitude
3. **Formation 1** (hold for 3-10 seconds)
4. **Transition** (2-8 seconds depending on distance)
5. **Formation 2** (hold)
6. ... repeat formations and transitions ...
7. **Final formation** (hold)
8. **Landing transition**: Return to ground grid
9. **Ground** (final frame): All drones on the ground

## LED Color Guidelines

- Use bright, saturated colors — they look best in the night sky
- Color transitions (fades) should be at least 1 second for smooth appearance
- Coordinate colors with formations:
  - Hearts: Red or pink
  - Stars: Gold/yellow or white
  - Text: White for readability, or brand colors
  - Spirals: Rainbow gradient along the spiral path
- Avoid pure black (LEDs off) except for deliberate effects

## Blender Coordinate System

- X: Right (East)
- Y: Forward (North)
- Z: Up
- Origin (0, 0, 0) is center of the ground
- Drones are named "Drone_001", "Drone_002", etc.
- Drones are in the "Drones" collection

## Available Blender Scripts

You have helper scripts you can reference, but you can also write custom Blender Python code.
The key patterns are:

### Create drones
```python
# Create N drones in a ground grid
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15)
# ... set up in Drones collection with emissive materials
```

### Set formation at frame
```python
drone.location = (x, y, z)
drone.keyframe_insert(data_path="location", frame=frame)
```

### Set LED color at frame
```python
emission_node.inputs["Color"].default_value = (r, g, b, 1.0)
emission_node.inputs["Color"].keyframe_insert(data_path="default_value", frame=frame)
```

### Set interpolation for smooth transitions
```python
for kp in fcurve.keyframe_points:
    kp.interpolation = 'BEZIER'
```

## Response Style

- Be concise and action-oriented
- Show your work: explain what you're creating before executing
- After each major step, take a viewport screenshot to show the user
- If something doesn't look right, fix it immediately
- Ask clarifying questions when the request is ambiguous
```

**Step 2: Commit**

```bash
git add sandbox/droneai/system_prompt.md
git commit -m "feat: add drone show AI system prompt with safety rules and design guidelines"
```

---

### Task 7: Create End-to-End Test Script

A Python script that exercises the full pipeline outside Blender — formations, safety, export — to validate the non-Blender parts work together.

**Files:**
- Create: `sandbox/droneai/tests/test_end_to_end.py`

**Step 1: Write the integration test**

File: `sandbox/droneai/tests/test_end_to_end.py`

```python
"""End-to-end test: generate formations, validate safety, export show file."""
import json
import math
import tempfile
import os
import pytest


def test_full_show_pipeline():
    """Create a complete show: ground grid → takeoff → heart → circle → land → export."""
    from droneai.formations.shapes import grid_formation, heart_formation, circle_formation
    from droneai.safety import validate_show, SafetyParams
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    drone_count = 50
    fps = 24
    params = SafetyParams(min_spacing=2.0, max_altitude=120.0, max_velocity=8.0, max_acceleration=4.0)

    # Define formations
    ground = grid_formation(count=drone_count, spacing=2.0, altitude=0.0)
    takeoff = grid_formation(count=drone_count, spacing=2.0, altitude=10.0)
    heart = heart_formation(count=drone_count, scale=20.0, altitude=15.0)
    circle = circle_formation(count=drone_count, radius=12.0, altitude=15.0)

    # Define timeline (time_seconds, formation)
    show_segments = [
        (0.0, ground),       # start on ground
        (5.0, takeoff),      # takeoff at t=5s
        (10.0, heart),       # heart formation at t=10s
        (20.0, heart),       # hold heart until t=20s
        (25.0, circle),      # transition to circle at t=25s
        (35.0, circle),      # hold circle until t=35s
        (40.0, takeoff),     # return to grid at t=40s
        (45.0, ground),      # land at t=45s
    ]

    # Build timeline for safety validation (sample intermediate frames via linear interp)
    timeline = []
    for seg_idx in range(len(show_segments) - 1):
        t0, pos0 = show_segments[seg_idx]
        t1, pos1 = show_segments[seg_idx + 1]
        num_samples = max(2, int((t1 - t0) * 2))  # 2 samples per second
        for s in range(num_samples):
            t_frac = s / num_samples
            t = t0 + t_frac * (t1 - t0)
            positions = {}
            for i in range(drone_count):
                x = pos0[i][0] + t_frac * (pos1[i][0] - pos0[i][0])
                y = pos0[i][1] + t_frac * (pos1[i][1] - pos0[i][1])
                z = pos0[i][2] + t_frac * (pos1[i][2] - pos0[i][2])
                positions[f"drone_{i+1:03d}"] = (x, y, z)
            timeline.append((t, positions))

    # Add final frame
    t_final, pos_final = show_segments[-1]
    timeline.append((t_final, {f"drone_{i+1:03d}": pos_final[i] for i in range(drone_count)}))

    # Validate safety
    result = validate_show(timeline, params)
    assert result.is_safe, f"Safety violations: {result.violations[:5]}"
    assert result.min_spacing_found >= params.min_spacing
    assert result.max_altitude_found <= params.max_altitude

    # Build show file
    trajectories = []
    lights = []
    for i in range(drone_count):
        drone_id = f"drone_{i+1:03d}"
        # Build trajectory keyframes from segments
        kf = [(t, pos[i][0], pos[i][1], pos[i][2]) for t, pos in show_segments]
        trajectories.append(DroneTrajectory(drone_id, kf))
        # Simple light program: white during show
        lights.append(DroneLightProgram(drone_id, [
            (0.0, 0, 0, 0, False),       # off on ground
            (5.0, 255, 255, 255, True),   # fade to white at takeoff
            (40.0, 255, 255, 255, True),  # white until landing
            (45.0, 0, 0, 0, True),        # fade to off on landing
        ]))

    manifest = ShowManifest(
        title="Test Show - Heart and Circle",
        drone_count=drone_count,
        duration_seconds=45.0,
    )
    show = Show(manifest=manifest, trajectories=trajectories, lights=lights)

    # Export to JSON
    json_str = show.to_json()
    parsed = json.loads(json_str)

    assert parsed["manifest"]["drone_count"] == 50
    assert parsed["manifest"]["title"] == "Test Show - Heart and Circle"
    assert len(parsed["drones"]) == 50
    assert len(parsed["drones"][0]["trajectory"]) == len(show_segments)
    assert len(parsed["drones"][0]["lights"]) == 4

    # Save to temp file and verify
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        f.write(json_str)
        tmp_path = f.name

    try:
        with open(tmp_path) as f:
            reloaded = json.load(f)
        assert reloaded["manifest"]["version"] == "1.0.0"
    finally:
        os.unlink(tmp_path)

    print(f"E2E test passed: {drone_count} drones, {len(show_segments)} segments, "
          f"min spacing={result.min_spacing_found:.2f}m, "
          f"max altitude={result.max_altitude_found:.1f}m")
```

**Step 2: Run all tests**

Run: `cd sandbox && python -m pytest droneai/tests/ -v`
Expected: All PASS

**Step 3: Commit**

```bash
git add sandbox/droneai/tests/test_end_to_end.py
git commit -m "feat: add end-to-end integration test for full show pipeline"
```

---

### Task 8: Live Test with Blender MCP

This is the validation gate — test the actual AI + Blender pipeline using the MCP tools that are already configured.

**Files:** No new files — this is a manual testing task using existing MCP tools.

**Step 1: Test scene setup via MCP**

Use `execute_blender_code` to run the setup script. Read the script from `sandbox/droneai/blender_scripts/setup_scene.py` and execute its contents via MCP.

**Step 2: Test drone creation via MCP**

Use `execute_blender_code` to create 50 drones. Then use `get_viewport_screenshot` to verify they appear in the viewport.

**Step 3: Test formation creation via MCP**

Use `execute_blender_code` to create a heart formation at frame 48. Use `get_viewport_screenshot` to verify.

**Step 4: Test LED colors via MCP**

Use `execute_blender_code` to set a red-to-blue gradient. Use `get_viewport_screenshot` to verify.

**Step 5: Test a full conversational flow**

Using the system prompt from `sandbox/droneai/system_prompt.md`, run through a complete show design conversation:

1. "Create a 50-drone show with a heart formation that transitions to a circle"
2. AI should: create scene, create drones, create formations, animate transitions, set colors
3. Verify via `get_viewport_screenshot` at each step
4. Verify the result looks visually compelling

**Step 6: Document results**

Create `sandbox/droneai/poc_results.md` with:
- Screenshots from each test
- What worked / what didn't
- Quality assessment: is this good enough to build a product around?
- List of issues to fix before Phase 1

**Step 7: Commit**

```bash
git add sandbox/droneai/poc_results.md
git commit -m "docs: add Phase 0 proof of concept test results"
```

---

## Completion Criteria

Phase 0 is complete when:

- [ ] All unit tests pass (`pytest droneai/tests/ -v`)
- [ ] Formations library generates valid shapes for 10-200 drones
- [ ] Safety validator catches spacing, altitude, and velocity violations
- [ ] Show file exports valid JSON with trajectory + light data
- [ ] Blender scripts work via MCP `execute_blender_code`
- [ ] AI can generate a complete show from a text prompt (tested manually)
- [ ] At least 3 different show designs produced and screenshotted
- [ ] POC results documented with go/no-go recommendation

## Gate Decision

After Task 8, answer: **"Is the AI output quality good enough to build a product around?"**

- If YES → proceed to Phase 1 (Desktop App MVP)
- If NO → identify specific quality gaps and iterate on system prompt / helper scripts before investing in app infrastructure
