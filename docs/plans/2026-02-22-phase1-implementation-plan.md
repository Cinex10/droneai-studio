# Phase 1: Desktop App MVP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone macOS Tauri desktop app with chat panel + embedded Blender 3D viewport, powered by Claude Code Max subscription, with an ABC-based Python engine for drone show design.

**Architecture:** Tauri app (Rust backend + React frontend) embeds Blender's NSWindow. Chat messages are piped to a Claude Code subprocess via stdin/stdout. Claude Code uses MCP to control Blender with the droneai Python engine. All engine components use Abstract Base Classes for flexibility.

**Tech Stack:** Tauri 2.x, Rust, React 18, TypeScript, Tailwind CSS, Python 3.11+ (in Blender), scipy (for Hungarian algorithm), pytest

---

## Pre-requisites

- Node.js 18+ and npm installed
- Rust toolchain installed (`rustup`)
- Blender 4.x installed at `/Applications/Blender.app`
- Claude Code CLI installed and authenticated with Max subscription
- Python 3.11+ with pytest and scipy available

**Existing code:** All Phase 0 files live in `sandbox/droneai/`. The engine ABCs in Part A extend this code. The Tauri app in Parts B-D lives in `sandbox/droneai-studio/`.

**Test command (Python engine):** `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox && /Users/cinex/.local/bin/pytest droneai/tests/ -v`

---

## Part A: Engine Abstract Base Classes (Python, TDD)

All files in `sandbox/droneai/engine/`. Pure Python — no Blender dependency.

### Task 1: Create engine directory structure

**Files:**
- Create: `droneai/engine/__init__.py`
- Create: `droneai/engine/transitions/__init__.py`
- Create: `droneai/engine/formations/__init__.py`
- Create: `droneai/engine/safety/__init__.py`
- Create: `droneai/engine/exporters/__init__.py`

**Step 1: Create directories and empty __init__.py files**

```python
# droneai/engine/__init__.py
"""DroneAI engine with pluggable components via Abstract Base Classes."""

# droneai/engine/transitions/__init__.py
# (empty)

# droneai/engine/formations/__init__.py
# (empty)

# droneai/engine/safety/__init__.py
# (empty)

# droneai/engine/exporters/__init__.py
# (empty)
```

**Step 2: Verify imports work**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/ -v`
Expected: All 24 existing tests still pass.

**Step 3: Commit**

```bash
git add droneai/engine/
git commit -m "feat: create engine directory structure for ABCs"
```

---

### Task 2: TransitionPlanner ABC + LinearPlanner

The ABC defines how drones are assigned to target positions. LinearPlanner wraps Phase 0 behavior (identity mapping — drone i goes to position i).

**Files:**
- Create: `droneai/engine/transitions/base.py`
- Create: `droneai/engine/transitions/linear.py`
- Create: `droneai/tests/test_transition_planners.py`

**Step 1: Write the failing test**

```python
# droneai/tests/test_transition_planners.py
"""Tests for transition planner implementations."""
import math
import pytest
from typing import List, Tuple

Position = Tuple[float, float, float]


def test_linear_planner_identity_mapping():
    """LinearPlanner returns identity: source[i] → target[i]."""
    from droneai.engine.transitions.linear import LinearPlanner

    planner = LinearPlanner()
    source = [(0, 0, 10), (5, 0, 10), (10, 0, 10)]
    target = [(1, 1, 10), (6, 1, 10), (11, 1, 10)]
    mapping = planner.plan(source, target)
    assert mapping == [0, 1, 2]


def test_linear_planner_different_counts_raises():
    """LinearPlanner raises if source and target have different counts."""
    from droneai.engine.transitions.linear import LinearPlanner

    planner = LinearPlanner()
    source = [(0, 0, 10), (5, 0, 10)]
    target = [(1, 1, 10)]
    with pytest.raises(ValueError):
        planner.plan(source, target)


def test_transition_planner_is_abstract():
    """Cannot instantiate TransitionPlanner directly."""
    from droneai.engine.transitions.base import TransitionPlanner

    with pytest.raises(TypeError):
        TransitionPlanner()
```

**Step 2: Run test to verify it fails**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_transition_planners.py -v`
Expected: FAIL (modules not found)

**Step 3: Write the ABC**

```python
# droneai/engine/transitions/base.py
"""Abstract base class for transition planning."""
from abc import ABC, abstractmethod
from typing import List, Tuple

Position = Tuple[float, float, float]


class TransitionPlanner(ABC):
    """Determines how to assign drones from source positions to target positions.

    Returns a mapping where source[i] should move to target[result[i]].
    """

    @abstractmethod
    def plan(self, source: List[Position], target: List[Position]) -> List[int]:
        """Compute assignment mapping from source to target positions.

        Args:
            source: Current drone positions.
            target: Target formation positions.

        Returns:
            List of indices: source[i] moves to target[result[i]].
        """
        ...
```

**Step 4: Write the LinearPlanner**

```python
# droneai/engine/transitions/linear.py
"""Linear (identity) transition planner — Phase 0 behavior."""
from typing import List, Tuple

from droneai.engine.transitions.base import TransitionPlanner, Position


class LinearPlanner(TransitionPlanner):
    """Identity mapping: source[i] → target[i].

    Fast but causes path crossings when formations differ significantly.
    Only safe for same-ordering formations (e.g., grid→grid with same layout).
    """

    def plan(self, source: List[Position], target: List[Position]) -> List[int]:
        if len(source) != len(target):
            raise ValueError(
                f"Source ({len(source)}) and target ({len(target)}) must have same count"
            )
        return list(range(len(source)))
```

**Step 5: Run tests**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_transition_planners.py -v`
Expected: 3 PASSED

**Step 6: Verify all tests still pass**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/ -v`
Expected: 27 PASSED (24 existing + 3 new)

**Step 7: Commit**

```bash
git add droneai/engine/transitions/base.py droneai/engine/transitions/linear.py droneai/tests/test_transition_planners.py
git commit -m "feat: add TransitionPlanner ABC and LinearPlanner"
```

---

### Task 3: HungarianPlanner — optimal assignment

Uses `scipy.optimize.linear_sum_assignment` on a distance matrix to find the minimum-cost assignment, preventing path crossings.

**Files:**
- Create: `droneai/engine/transitions/hungarian.py`
- Modify: `droneai/tests/test_transition_planners.py`

**Step 1: Write the failing tests**

Append to `droneai/tests/test_transition_planners.py`:

```python
def test_hungarian_planner_avoids_crossing():
    """HungarianPlanner should swap assignments to minimize total distance.

    Source: A at (0,0,10), B at (10,0,10)
    Target: X at (10,0,10), Y at (0,0,10)

    Linear would give A→X (10m) + B→Y (10m) = 20m total.
    Hungarian should give A→Y (0m) + B→X (0m) = 0m total.
    """
    from droneai.engine.transitions.hungarian import HungarianPlanner

    planner = HungarianPlanner()
    source = [(0, 0, 10), (10, 0, 10)]
    target = [(10, 0, 10), (0, 0, 10)]
    mapping = planner.plan(source, target)
    # drone 0 should go to target[1] (0,0,10), drone 1 to target[0] (10,0,10)
    assert mapping == [1, 0]


def test_hungarian_planner_total_distance_less_than_linear():
    """Hungarian should produce shorter total travel distance than linear."""
    from droneai.engine.transitions.hungarian import HungarianPlanner
    from droneai.engine.transitions.linear import LinearPlanner

    # Create a case where linear is suboptimal: reversed order
    source = [(i * 3, 0, 10) for i in range(10)]
    target = [(i * 3, 0, 10) for i in reversed(range(10))]

    hungarian = HungarianPlanner()
    linear = LinearPlanner()

    h_mapping = hungarian.plan(source, target)
    l_mapping = linear.plan(source, target)

    def total_dist(mapping):
        return sum(
            math.sqrt(sum((s - t) ** 2 for s, t in zip(source[i], target[mapping[i]])))
            for i in range(len(source))
        )

    assert total_dist(h_mapping) <= total_dist(l_mapping)


def test_hungarian_planner_same_positions():
    """When source == target, mapping should be identity."""
    from droneai.engine.transitions.hungarian import HungarianPlanner

    planner = HungarianPlanner()
    positions = [(i * 3, 0, 10) for i in range(5)]
    mapping = planner.plan(positions, positions)
    assert mapping == [0, 1, 2, 3, 4]
```

**Step 2: Run tests to verify they fail**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_transition_planners.py::test_hungarian_planner_avoids_crossing -v`
Expected: FAIL (module not found)

**Step 3: Write the HungarianPlanner**

```python
# droneai/engine/transitions/hungarian.py
"""Hungarian algorithm transition planner — optimal assignment."""
import math
from typing import List, Tuple

from scipy.optimize import linear_sum_assignment

from droneai.engine.transitions.base import TransitionPlanner, Position


class HungarianPlanner(TransitionPlanner):
    """Optimal assignment using the Hungarian algorithm.

    Minimizes total travel distance across all drones, which prevents
    path crossings and reduces collision risk during transitions.
    Uses scipy.optimize.linear_sum_assignment on the Euclidean distance matrix.
    """

    def plan(self, source: List[Position], target: List[Position]) -> List[int]:
        if len(source) != len(target):
            raise ValueError(
                f"Source ({len(source)}) and target ({len(target)}) must have same count"
            )
        n = len(source)
        if n == 0:
            return []

        # Build cost matrix: cost[i][j] = distance from source[i] to target[j]
        cost = []
        for i in range(n):
            row = []
            for j in range(n):
                dist = math.sqrt(
                    (source[i][0] - target[j][0]) ** 2
                    + (source[i][1] - target[j][1]) ** 2
                    + (source[i][2] - target[j][2]) ** 2
                )
                row.append(dist)
            cost.append(row)

        # Solve assignment problem
        row_ind, col_ind = linear_sum_assignment(cost)

        # Build mapping: source[i] → target[mapping[i]]
        mapping = [0] * n
        for r, c in zip(row_ind, col_ind):
            mapping[r] = c

        return mapping
```

**Step 4: Run tests**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_transition_planners.py -v`
Expected: 6 PASSED

**Step 5: Commit**

```bash
git add droneai/engine/transitions/hungarian.py droneai/tests/test_transition_planners.py
git commit -m "feat: add HungarianPlanner for optimal drone assignment"
```

---

### Task 4: FormationGenerator ABC + ParametricFormation

The ABC defines how to generate positions for a shape. ParametricFormation wraps all Phase 0 shapes.

**Files:**
- Create: `droneai/engine/formations/base.py`
- Create: `droneai/engine/formations/parametric.py`
- Create: `droneai/tests/test_formation_generators.py`

**Step 1: Write the failing tests**

```python
# droneai/tests/test_formation_generators.py
"""Tests for FormationGenerator ABC and implementations."""
import math
import pytest


def test_formation_generator_is_abstract():
    """Cannot instantiate FormationGenerator directly."""
    from droneai.engine.formations.base import FormationGenerator
    with pytest.raises(TypeError):
        FormationGenerator()


def test_parametric_grid():
    from droneai.engine.formations.parametric import ParametricFormation
    gen = ParametricFormation()
    points = gen.generate(25, shape="grid", spacing=2.0, altitude=10.0)
    assert len(points) == 25
    for p in points:
        assert abs(p[2] - 10.0) < 0.01


def test_parametric_circle():
    from droneai.engine.formations.parametric import ParametricFormation
    gen = ParametricFormation()
    points = gen.generate(20, shape="circle", radius=10.0, altitude=15.0)
    assert len(points) == 20
    for p in points:
        dist = math.sqrt(p[0] ** 2 + p[1] ** 2)
        assert abs(dist - 10.0) < 0.01


def test_parametric_heart():
    from droneai.engine.formations.parametric import ParametricFormation
    gen = ParametricFormation()
    points = gen.generate(30, shape="heart", scale=20.0, altitude=10.0)
    assert len(points) == 30


def test_parametric_star():
    from droneai.engine.formations.parametric import ParametricFormation
    gen = ParametricFormation()
    points = gen.generate(25, shape="star", outer_radius=10.0, altitude=10.0)
    assert len(points) == 25


def test_parametric_unknown_shape_raises():
    from droneai.engine.formations.parametric import ParametricFormation
    gen = ParametricFormation()
    with pytest.raises(ValueError):
        gen.generate(10, shape="banana")


def test_parametric_available_shapes():
    from droneai.engine.formations.parametric import ParametricFormation
    gen = ParametricFormation()
    shapes = gen.available_shapes()
    assert "grid" in shapes
    assert "circle" in shapes
    assert "heart" in shapes
    assert "star" in shapes
    assert "spiral" in shapes
    assert "sphere" in shapes
    assert "text" in shapes
```

**Step 2: Run tests to verify they fail**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_formation_generators.py -v`
Expected: FAIL

**Step 3: Write the ABC**

```python
# droneai/engine/formations/base.py
"""Abstract base class for formation generation."""
from abc import ABC, abstractmethod
from typing import List, Tuple

Position = Tuple[float, float, float]


class FormationGenerator(ABC):
    """Generates drone positions for a given shape."""

    @abstractmethod
    def generate(self, count: int, **params) -> List[Position]:
        """Generate positions for count drones.

        Args:
            count: Number of drones.
            **params: Shape-specific parameters (shape, radius, altitude, etc.)

        Returns:
            List of (x, y, z) positions.
        """
        ...

    @abstractmethod
    def available_shapes(self) -> List[str]:
        """Return list of supported shape names."""
        ...
```

**Step 4: Write the ParametricFormation**

```python
# droneai/engine/formations/parametric.py
"""Parametric formation generator — wraps Phase 0 shape functions."""
from typing import List, Tuple

from droneai.engine.formations.base import FormationGenerator, Position
from droneai.formations.shapes import (
    grid_formation,
    circle_formation,
    heart_formation,
    star_formation,
    spiral_formation,
    sphere_formation,
    text_formation,
)

_SHAPES = {
    "grid": grid_formation,
    "circle": circle_formation,
    "heart": heart_formation,
    "star": star_formation,
    "spiral": spiral_formation,
    "sphere": sphere_formation,
    "text": text_formation,
}


class ParametricFormation(FormationGenerator):
    """Formation generator using parametric shape functions from Phase 0.

    Delegates to the existing shape library. Pass shape name as the
    'shape' keyword argument, plus any shape-specific parameters.
    """

    def generate(self, count: int, **params) -> List[Position]:
        shape = params.pop("shape", "grid")
        if shape not in _SHAPES:
            raise ValueError(
                f"Unknown shape '{shape}'. Available: {list(_SHAPES.keys())}"
            )
        return _SHAPES[shape](count=count, **params)

    def available_shapes(self) -> List[str]:
        return list(_SHAPES.keys())
```

**Step 5: Run tests**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_formation_generators.py -v`
Expected: 7 PASSED

**Step 6: Commit**

```bash
git add droneai/engine/formations/base.py droneai/engine/formations/parametric.py droneai/tests/test_formation_generators.py
git commit -m "feat: add FormationGenerator ABC and ParametricFormation"
```

---

### Task 5: SpacingEnforcer ABC + RepulsionEnforcer

Iteratively pushes apart drones that are closer than min_spacing.

**Files:**
- Create: `droneai/engine/formations/spacing.py`
- Create: `droneai/tests/test_spacing_enforcer.py`

**Step 1: Write the failing tests**

```python
# droneai/tests/test_spacing_enforcer.py
"""Tests for SpacingEnforcer ABC and implementations."""
import math
import pytest


def _min_distance(positions):
    """Helper: find minimum distance between any two positions."""
    min_dist = float("inf")
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            dist = math.sqrt(
                sum((a - b) ** 2 for a, b in zip(positions[i], positions[j]))
            )
            min_dist = min(min_dist, dist)
    return min_dist


def test_spacing_enforcer_is_abstract():
    from droneai.engine.formations.spacing import SpacingEnforcer
    with pytest.raises(TypeError):
        SpacingEnforcer()


def test_repulsion_enforcer_fixes_close_drones():
    """Drones closer than min_spacing get pushed apart."""
    from droneai.engine.formations.spacing import RepulsionEnforcer

    enforcer = RepulsionEnforcer()
    # Two drones only 1m apart (min_spacing = 2.0)
    positions = [(0.0, 0.0, 10.0), (0.5, 0.0, 10.0)]
    fixed = enforcer.enforce(positions, min_spacing=2.0)
    assert len(fixed) == 2
    dist = _min_distance(fixed)
    assert dist >= 2.0, f"Expected >= 2.0m, got {dist:.2f}m"


def test_repulsion_enforcer_preserves_safe_positions():
    """Drones already spaced correctly should barely move."""
    from droneai.engine.formations.spacing import RepulsionEnforcer

    enforcer = RepulsionEnforcer()
    positions = [(0.0, 0.0, 10.0), (5.0, 0.0, 10.0), (10.0, 0.0, 10.0)]
    fixed = enforcer.enforce(positions, min_spacing=2.0)
    assert len(fixed) == 3
    # Positions should be very close to originals
    for orig, new in zip(positions, fixed):
        dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(orig, new)))
        assert dist < 0.1, f"Moved {dist:.2f}m, expected minimal movement"


def test_repulsion_enforcer_cluster():
    """Multiple drones at the same point should all get separated."""
    from droneai.engine.formations.spacing import RepulsionEnforcer

    enforcer = RepulsionEnforcer()
    # 4 drones at the same spot
    positions = [(5.0, 5.0, 10.0)] * 4
    fixed = enforcer.enforce(positions, min_spacing=2.0)
    assert len(fixed) == 4
    dist = _min_distance(fixed)
    assert dist >= 1.9, f"Expected >= 1.9m, got {dist:.2f}m"  # allow tiny tolerance


def test_repulsion_enforcer_preserves_count():
    from droneai.engine.formations.spacing import RepulsionEnforcer
    enforcer = RepulsionEnforcer()
    positions = [(i * 0.5, 0, 10) for i in range(10)]
    fixed = enforcer.enforce(positions, min_spacing=2.0)
    assert len(fixed) == 10
```

**Step 2: Run tests to verify they fail**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_spacing_enforcer.py -v`
Expected: FAIL

**Step 3: Write the implementation**

```python
# droneai/engine/formations/spacing.py
"""Spacing enforcement for drone formations."""
import math
import random
from abc import ABC, abstractmethod
from typing import List, Tuple

Position = Tuple[float, float, float]


class SpacingEnforcer(ABC):
    """Adjusts positions to maintain minimum spacing between drones."""

    @abstractmethod
    def enforce(self, positions: List[Position], min_spacing: float) -> List[Position]:
        """Adjust positions so all pairs are at least min_spacing apart.

        Args:
            positions: Current drone positions.
            min_spacing: Minimum distance in meters.

        Returns:
            Adjusted positions.
        """
        ...


class RepulsionEnforcer(SpacingEnforcer):
    """Iterative repulsion: push apart drones closer than min_spacing.

    Uses a simple physics-inspired approach: for each pair of drones that are
    too close, push them apart along the line connecting them. Repeats for
    multiple iterations until convergence or max_iterations reached.
    """

    def __init__(self, max_iterations: int = 200, strength: float = 0.5):
        self.max_iterations = max_iterations
        self.strength = strength

    def enforce(self, positions: List[Position], min_spacing: float) -> List[Position]:
        n = len(positions)
        if n <= 1:
            return list(positions)

        # Work with mutable lists
        pts = [list(p) for p in positions]

        for iteration in range(self.max_iterations):
            moved = False
            for i in range(n):
                for j in range(i + 1, n):
                    dx = pts[j][0] - pts[i][0]
                    dy = pts[j][1] - pts[i][1]
                    dz = pts[j][2] - pts[i][2]
                    dist = math.sqrt(dx * dx + dy * dy + dz * dz)

                    if dist < min_spacing:
                        if dist < 1e-6:
                            # Coincident points — push in random direction
                            angle = random.uniform(0, 2 * math.pi)
                            dx = math.cos(angle)
                            dy = math.sin(angle)
                            dz = 0
                            dist = 1e-6

                        # Push apart along connecting line
                        overlap = min_spacing - dist
                        push = overlap * self.strength / 2
                        nx, ny, nz = dx / dist, dy / dist, dz / dist

                        pts[i][0] -= nx * push
                        pts[i][1] -= ny * push
                        pts[i][2] -= nz * push
                        pts[j][0] += nx * push
                        pts[j][1] += ny * push
                        pts[j][2] += nz * push
                        moved = True

            if not moved:
                break

        return [(p[0], p[1], p[2]) for p in pts]
```

**Step 4: Run tests**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_spacing_enforcer.py -v`
Expected: 5 PASSED

**Step 5: Commit**

```bash
git add droneai/engine/formations/spacing.py droneai/tests/test_spacing_enforcer.py
git commit -m "feat: add SpacingEnforcer ABC and RepulsionEnforcer"
```

---

### Task 6: SafetyValidator ABC + StandardValidator

Wraps Phase 0 safety.py in an ABC.

**Files:**
- Create: `droneai/engine/safety/base.py`
- Create: `droneai/engine/safety/standard.py`
- Create: `droneai/tests/test_safety_validator.py`

**Step 1: Write the failing tests**

```python
# droneai/tests/test_safety_validator.py
"""Tests for SafetyValidator ABC and StandardValidator."""
import pytest


def test_safety_validator_is_abstract():
    from droneai.engine.safety.base import SafetyValidator
    with pytest.raises(TypeError):
        SafetyValidator()


def test_standard_validator_safe_timeline():
    from droneai.engine.safety.base import SafetyParams, SafetyResult
    from droneai.engine.safety.standard import StandardValidator

    validator = StandardValidator()
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0)
    timeline = [
        (0.0, {"d1": (0, 0, 10), "d2": (5, 0, 10)}),
        (1.0, {"d1": (0, 0, 11), "d2": (5, 0, 11)}),
    ]
    result = validator.validate(timeline, params)
    assert result.is_safe


def test_standard_validator_spacing_violation():
    from droneai.engine.safety.base import SafetyParams
    from droneai.engine.safety.standard import StandardValidator

    validator = StandardValidator()
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0)
    timeline = [
        (0.0, {"d1": (0, 0, 10), "d2": (1, 0, 10)}),  # 1m apart
    ]
    result = validator.validate(timeline, params)
    assert not result.is_safe


def test_standard_validator_velocity_violation():
    from droneai.engine.safety.base import SafetyParams
    from droneai.engine.safety.standard import StandardValidator

    validator = StandardValidator()
    params = SafetyParams(min_spacing=2.0, max_altitude=50.0, max_velocity=8.0)
    timeline = [
        (0.0, {"d1": (0, 0, 10)}),
        (1.0, {"d1": (20, 0, 10)}),  # 20 m/s
    ]
    result = validator.validate(timeline, params)
    assert not result.is_safe
```

**Step 2: Run tests to verify they fail**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_safety_validator.py -v`
Expected: FAIL

**Step 3: Write the ABC**

```python
# droneai/engine/safety/base.py
"""Abstract base class for safety validation."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

Position = Tuple[float, float, float]


@dataclass
class SafetyParams:
    """Parameters for safety validation."""
    min_spacing: float = 2.0
    max_altitude: float = 120.0
    max_velocity: float = 8.0
    max_acceleration: float = 4.0


@dataclass
class SafetyResult:
    """Result of safety validation."""
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


ShowTimeline = List[Tuple[float, Dict[str, Position]]]


class SafetyValidator(ABC):
    """Validates a drone show timeline against safety constraints."""

    @abstractmethod
    def validate(self, timeline: ShowTimeline, params: SafetyParams) -> SafetyResult:
        """Validate entire show timeline.

        Args:
            timeline: List of (time_seconds, {drone_id: (x,y,z)}).
            params: Safety parameters.

        Returns:
            SafetyResult with any violations found.
        """
        ...
```

**Step 4: Write the StandardValidator**

```python
# droneai/engine/safety/standard.py
"""Standard safety validator — wraps Phase 0 validation logic."""
from droneai.engine.safety.base import (
    SafetyValidator,
    SafetyParams,
    SafetyResult,
    ShowTimeline,
)
from droneai.safety import (
    validate_show as _validate_show,
    SafetyParams as _LegacyParams,
)


class StandardValidator(SafetyValidator):
    """Safety validator using Phase 0 validation logic.

    Checks spacing between drones, altitude limits, and velocity limits
    at each frame of the timeline.
    """

    def validate(self, timeline: ShowTimeline, params: SafetyParams) -> SafetyResult:
        legacy_params = _LegacyParams(
            min_spacing=params.min_spacing,
            max_altitude=params.max_altitude,
            max_velocity=params.max_velocity,
            max_acceleration=params.max_acceleration,
        )
        legacy_result = _validate_show(timeline, legacy_params)

        result = SafetyResult(
            is_safe=legacy_result.is_safe,
            violations=list(legacy_result.violations),
            min_spacing_found=legacy_result.min_spacing_found,
            max_velocity_found=legacy_result.max_velocity_found,
            max_altitude_found=legacy_result.max_altitude_found,
        )
        return result
```

**Step 5: Run tests**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_safety_validator.py -v`
Expected: 4 PASSED

**Step 6: Commit**

```bash
git add droneai/engine/safety/base.py droneai/engine/safety/standard.py droneai/tests/test_safety_validator.py
git commit -m "feat: add SafetyValidator ABC and StandardValidator"
```

---

### Task 7: ShowExporter ABC + JsonExporter

Wraps Phase 0 show_format/schema.py in an ABC.

**Files:**
- Create: `droneai/engine/exporters/base.py`
- Create: `droneai/engine/exporters/json_exporter.py`
- Create: `droneai/tests/test_exporters.py`

**Step 1: Write the failing tests**

```python
# droneai/tests/test_exporters.py
"""Tests for ShowExporter ABC and JsonExporter."""
import json
import os
import tempfile
import pytest


def test_show_exporter_is_abstract():
    from droneai.engine.exporters.base import ShowExporter
    with pytest.raises(TypeError):
        ShowExporter()


def test_json_exporter_creates_valid_json():
    from droneai.engine.exporters.json_exporter import JsonExporter
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    show = Show(
        manifest=ShowManifest(title="Test", drone_count=2, duration_seconds=10.0),
        trajectories=[
            DroneTrajectory("d1", [(0, 0, 0, 0), (10, 0, 0, 10)]),
            DroneTrajectory("d2", [(0, 5, 0, 0), (10, 5, 0, 10)]),
        ],
        lights=[
            DroneLightProgram("d1", [(0, 255, 255, 255, False)]),
            DroneLightProgram("d2", [(0, 255, 0, 0, False)]),
        ],
    )

    exporter = JsonExporter()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        tmp_path = f.name

    try:
        exporter.export(show, tmp_path)
        with open(tmp_path) as f:
            data = json.load(f)
        assert data["manifest"]["title"] == "Test"
        assert data["manifest"]["drone_count"] == 2
        assert len(data["drones"]) == 2
    finally:
        os.unlink(tmp_path)


def test_json_exporter_roundtrip():
    from droneai.engine.exporters.json_exporter import JsonExporter
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    show = Show(
        manifest=ShowManifest(title="Roundtrip", drone_count=1, duration_seconds=5.0),
        trajectories=[DroneTrajectory("d1", [(0, 1, 2, 3)])],
        lights=[DroneLightProgram("d1", [(0, 100, 200, 50, True)])],
    )

    exporter = JsonExporter()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        tmp_path = f.name

    try:
        exporter.export(show, tmp_path)
        with open(tmp_path) as f:
            data = json.load(f)
        assert data["manifest"]["version"] == "1.0.0"
        assert data["drones"][0]["trajectory"][0]["x"] == 1
        assert data["drones"][0]["trajectory"][0]["y"] == 2
        assert data["drones"][0]["trajectory"][0]["z"] == 3
    finally:
        os.unlink(tmp_path)
```

**Step 2: Run tests to verify they fail**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_exporters.py -v`
Expected: FAIL

**Step 3: Write the ABC**

```python
# droneai/engine/exporters/base.py
"""Abstract base class for show export."""
from abc import ABC, abstractmethod

from droneai.show_format.schema import Show


class ShowExporter(ABC):
    """Exports a show to a file."""

    @abstractmethod
    def export(self, show: Show, path: str) -> None:
        """Export the show to the given file path.

        Args:
            show: The Show object to export.
            path: Output file path.
        """
        ...
```

**Step 4: Write the JsonExporter**

```python
# droneai/engine/exporters/json_exporter.py
"""JSON show exporter — wraps Phase 0 show format."""
from droneai.engine.exporters.base import ShowExporter
from droneai.show_format.schema import Show


class JsonExporter(ShowExporter):
    """Exports show to JSON format using Phase 0 schema."""

    def export(self, show: Show, path: str) -> None:
        show.save(path)
```

**Step 5: Run tests**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_exporters.py -v`
Expected: 4 PASSED

**Step 6: Commit**

```bash
git add droneai/engine/exporters/base.py droneai/engine/exporters/json_exporter.py droneai/tests/test_exporters.py
git commit -m "feat: add ShowExporter ABC and JsonExporter"
```

---

### Task 8: Engine integration test — full pipeline with ABCs

Tests the complete pipeline using the new ABC-based engine: generate formations, plan transitions with Hungarian algorithm, enforce spacing, validate safety, export.

**Files:**
- Create: `droneai/tests/test_engine_integration.py`

**Step 1: Write the integration test**

```python
# droneai/tests/test_engine_integration.py
"""Integration test: full pipeline using ABC-based engine components."""
import json
import math
import os
import tempfile
import pytest


def test_full_pipeline_with_abcs():
    """Generate formations → plan transitions → enforce spacing → validate → export."""
    from droneai.engine.formations.parametric import ParametricFormation
    from droneai.engine.transitions.hungarian import HungarianPlanner
    from droneai.engine.formations.spacing import RepulsionEnforcer
    from droneai.engine.safety.base import SafetyParams
    from droneai.engine.safety.standard import StandardValidator
    from droneai.engine.exporters.json_exporter import JsonExporter
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    # Configuration
    drone_count = 20
    fps = 24

    # Initialize engine components
    formation_gen = ParametricFormation()
    planner = HungarianPlanner()
    spacer = RepulsionEnforcer()
    validator = StandardValidator()
    exporter = JsonExporter()
    safety_params = SafetyParams(min_spacing=2.0, max_altitude=120.0, max_velocity=8.0)

    # Generate formations
    ground = formation_gen.generate(drone_count, shape="grid", spacing=3.0, altitude=0.0)
    circle = formation_gen.generate(drone_count, shape="circle", radius=12.0, altitude=15.0)
    star = formation_gen.generate(drone_count, shape="star", outer_radius=12.0, inner_radius=6.0, altitude=20.0)

    # Enforce spacing on each formation
    circle = spacer.enforce(circle, min_spacing=2.0)
    star = spacer.enforce(star, min_spacing=2.0)

    # Plan transitions (optimal assignment)
    ground_to_circle = planner.plan(ground, circle)
    circle_to_star = planner.plan(circle, star)
    star_to_ground = planner.plan(star, ground)

    # Reorder targets based on assignment
    circle_ordered = [circle[ground_to_circle[i]] for i in range(drone_count)]
    star_ordered = [star[circle_to_star[i]] for i in range(drone_count)]
    ground_final = [ground[star_to_ground[i]] for i in range(drone_count)]

    # Build show timeline: (time, positions list per drone index)
    show_segments = [
        (0.0, ground),
        (5.0, ground),           # hold on ground
        (10.0, circle_ordered),  # transition to circle
        (20.0, circle_ordered),  # hold circle
        (28.0, star_ordered),    # transition to star
        (38.0, star_ordered),    # hold star
        (46.0, ground_final),    # transition to ground
        (50.0, ground_final),    # hold on ground
    ]

    # Build timeline for safety validation
    timeline = []
    for seg_idx in range(len(show_segments) - 1):
        t0, pos0 = show_segments[seg_idx]
        t1, pos1 = show_segments[seg_idx + 1]
        num_samples = max(2, int((t1 - t0) * 2))
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
    result = validator.validate(timeline, safety_params)
    assert result.is_safe, f"Safety violations: {result.violations[:5]}"

    # Build and export show
    trajectories = []
    lights = []
    for i in range(drone_count):
        drone_id = f"drone_{i+1:03d}"
        kf = [(t, pos[i][0], pos[i][1], pos[i][2]) for t, pos in show_segments]
        trajectories.append(DroneTrajectory(drone_id, kf))
        lights.append(DroneLightProgram(drone_id, [
            (0.0, 0, 0, 0, False),
            (5.0, 255, 255, 255, True),
            (46.0, 255, 255, 255, True),
            (50.0, 0, 0, 0, True),
        ]))

    show = Show(
        manifest=ShowManifest(
            title="ABC Pipeline Test",
            drone_count=drone_count,
            duration_seconds=50.0,
        ),
        trajectories=trajectories,
        lights=lights,
    )

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        tmp_path = f.name

    try:
        exporter.export(show, tmp_path)
        with open(tmp_path) as f:
            data = json.load(f)
        assert data["manifest"]["drone_count"] == drone_count
        assert len(data["drones"]) == drone_count
    finally:
        os.unlink(tmp_path)

    print(f"ABC pipeline test passed: {drone_count} drones, "
          f"3 formations (circle→star→ground), "
          f"min spacing={result.min_spacing_found:.2f}m")
```

**Step 2: Run integration test**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/test_engine_integration.py -v`
Expected: 1 PASSED

**Step 3: Run all tests**

Run: `/Users/cinex/.local/bin/pytest droneai/tests/ -v`
Expected: All tests pass (24 original + new ABC tests)

**Step 4: Commit**

```bash
git add droneai/tests/test_engine_integration.py
git commit -m "feat: add engine integration test using full ABC pipeline"
```

---

## Part B: Tauri App Scaffolding

All files in `sandbox/droneai-studio/`.

### Task 9: Initialize Tauri + React project

**Files:**
- Create: `droneai-studio/` (entire project scaffold)

**Step 1: Scaffold the Tauri project**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
npm create tauri-app@latest droneai-studio -- --template react-ts
```

Follow prompts: project name = `droneai-studio`, frontend = React + TypeScript.

**Step 2: Install dependencies**

```bash
cd droneai-studio
npm install
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind**

Replace `droneai-studio/src/styles.css` (or `src/App.css` depending on scaffold output) with:

```css
/* droneai-studio/src/globals.css */
@import "tailwindcss";

:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-chat: #16161f;
  --text-primary: #e8e8f0;
  --text-secondary: #8888a0;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --border: #2a2a3a;
}

body {
  margin: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
  height: 100vh;
}

#root {
  height: 100vh;
}
```

**Step 4: Configure Tauri for macOS**

Edit `droneai-studio/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "DroneAI Studio",
  "version": "0.1.0",
  "identifier": "com.droneai.studio",
  "build": {
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "DroneAI Studio",
        "width": 1440,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 600,
        "decorations": true,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**Step 5: Verify the app builds and launches**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm run tauri dev
```

Expected: A desktop window opens with the default React page. Close it after verifying.

**Step 6: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/
git commit -m "feat: scaffold Tauri + React + Tailwind project"
```

---

### Task 10: App layout with three-panel structure

Set up the main layout: chat panel (left), Blender viewport (right), timeline bar (bottom-right).

**Files:**
- Create: `droneai-studio/src/App.tsx`
- Create: `droneai-studio/src/components/ChatPanel.tsx`
- Create: `droneai-studio/src/components/ChatMessage.tsx`
- Create: `droneai-studio/src/components/BlenderViewport.tsx`
- Create: `droneai-studio/src/components/TimelineBar.tsx`

**Step 1: Write App.tsx layout**

```tsx
// droneai-studio/src/App.tsx
import { useState } from "react";
import ChatPanel from "./components/ChatPanel";
import BlenderViewport from "./components/BlenderViewport";
import TimelineBar from "./components/TimelineBar";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Welcome to DroneAI Studio! Describe a drone show and I'll build it for you.",
      timestamp: Date.now(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // TODO: Wire to Claude Code via Tauri IPC
    // For now, echo back a placeholder
    setTimeout(() => {
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Processing: "${text}" — Claude Code integration coming soon.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      {/* Chat Panel — left side */}
      <div className="w-[380px] min-w-[300px] border-r border-[var(--border)] flex flex-col">
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>

      {/* Right side: viewport + timeline */}
      <div className="flex-1 flex flex-col">
        {/* Blender Viewport */}
        <div className="flex-1">
          <BlenderViewport />
        </div>

        {/* Timeline Bar */}
        <div className="h-12 border-t border-[var(--border)]">
          <TimelineBar />
        </div>
      </div>
    </div>
  );
}

export default App;
```

**Step 2: Write ChatPanel.tsx**

```tsx
// droneai-studio/src/components/ChatPanel.tsx
import { useState, useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

export default function ChatPanel({ messages, onSendMessage, isLoading }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-chat)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">DroneAI Studio</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="text-[var(--text-secondary)] text-sm animate-pulse">
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--border)]">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your drone show..."
            rows={1}
            className="flex-1 bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Write ChatMessage.tsx**

```tsx
// droneai-studio/src/components/ChatMessage.tsx
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}
```

**Step 4: Write BlenderViewport.tsx**

```tsx
// droneai-studio/src/components/BlenderViewport.tsx
export default function BlenderViewport() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="text-center text-[var(--text-secondary)]">
        <div className="text-4xl mb-4">&#9649;</div>
        <p className="text-sm">Blender viewport will appear here</p>
        <p className="text-xs mt-1">Waiting for Blender connection...</p>
      </div>
    </div>
  );
}
```

**Step 5: Write TimelineBar.tsx**

```tsx
// droneai-studio/src/components/TimelineBar.tsx
import { useState } from "react";

export default function TimelineBar() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const totalFrames = 1440; // 60s * 24fps
  const fps = 24;

  const formatTime = (frame: number) => {
    const seconds = Math.floor(frame / fps);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center h-full px-4 gap-3 bg-[var(--bg-secondary)]">
      {/* Play/Pause */}
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className="text-[var(--text-primary)] hover:text-[var(--accent)] text-lg"
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={totalFrames}
        value={currentFrame}
        onChange={(e) => setCurrentFrame(Number(e.target.value))}
        className="flex-1 h-1 accent-[var(--accent)]"
      />

      {/* Time display */}
      <span className="text-xs text-[var(--text-secondary)] font-mono min-w-[90px] text-right">
        {formatTime(currentFrame)} / {formatTime(totalFrames)}
      </span>
    </div>
  );
}
```

**Step 6: Update main.tsx to import globals.css**

Ensure `droneai-studio/src/main.tsx` imports the globals:

```tsx
// droneai-studio/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 7: Verify app renders correctly**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm run tauri dev
```

Expected: Dark app with chat panel on left (with welcome message, input box), placeholder viewport on right, timeline bar at bottom.

**Step 8: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/src/
git commit -m "feat: add app layout with chat panel, viewport, and timeline"
```

---

## Part C: Rust Backend

### Task 11: Blender detection and launch (blender.rs)

Detects Blender installation, launches it as subprocess with a startup script that strips UI and starts MCP server.

**Files:**
- Create: `droneai-studio/src-tauri/src/blender.rs`
- Modify: `droneai-studio/src-tauri/src/main.rs` (or `lib.rs`)
- Create: `droneai-studio/blender_startup.py`

**Step 1: Write blender_startup.py**

This Python script runs inside Blender at launch. It hides all UI except the 3D viewport and starts the MCP server addon.

```python
# droneai-studio/blender_startup.py
"""Blender startup script for DroneAI Studio.

Run as: blender --python blender_startup.py

Hides all UI except 3D viewport and starts MCP server.
"""
import bpy
import sys


def setup_minimal_ui():
    """Configure Blender to show only the 3D viewport."""
    # Set to fullscreen 3D viewport
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != 'VIEW_3D':
                area.type = 'VIEW_3D'

    # Switch to Material Preview for emissive materials
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'MATERIAL'


def setup_scene():
    """Set up a dark scene suitable for drone show preview."""
    # Dark background
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.01, 0.01, 0.02, 1.0)

    # Create Drones collection if needed
    if "Drones" not in bpy.data.collections:
        drone_collection = bpy.data.collections.new("Drones")
        bpy.context.scene.collection.children.link(drone_collection)


def main():
    setup_minimal_ui()
    setup_scene()
    print("DroneAI Studio: Blender ready")


# Run after a short delay to ensure Blender is fully initialized
bpy.app.timers.register(main, first_interval=1.0)
```

**Step 2: Write blender.rs**

```rust
// droneai-studio/src-tauri/src/blender.rs
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct BlenderProcess {
    child: Option<Child>,
    pid: Option<u32>,
}

impl BlenderProcess {
    pub fn new() -> Self {
        Self {
            child: None,
            pid: None,
        }
    }

    /// Detect Blender installation path on macOS.
    pub fn detect_blender_path() -> Option<PathBuf> {
        let default_path = PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender");
        if default_path.exists() {
            return Some(default_path);
        }
        // Check common alternative locations
        let home = std::env::var("HOME").ok()?;
        let home_path = PathBuf::from(format!("{}/Applications/Blender.app/Contents/MacOS/Blender", home));
        if home_path.exists() {
            return Some(home_path);
        }
        None
    }

    /// Launch Blender as a subprocess with the startup script.
    pub fn launch(&mut self, startup_script: &str) -> Result<u32, String> {
        let blender_path = Self::detect_blender_path()
            .ok_or_else(|| "Blender not found. Please install Blender 4.x.".to_string())?;

        let child = Command::new(blender_path)
            .args(["--python", startup_script])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to launch Blender: {}", e))?;

        let pid = child.id();
        self.child = Some(child);
        self.pid = Some(pid);
        Ok(pid)
    }

    /// Check if Blender is still running.
    pub fn is_running(&mut self) -> bool {
        match &mut self.child {
            Some(child) => child.try_wait().ok().flatten().is_none(),
            None => false,
        }
    }

    /// Get the Blender process ID.
    pub fn pid(&self) -> Option<u32> {
        self.pid
    }

    /// Kill the Blender process.
    pub fn kill(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
        self.pid = None;
    }
}

impl Drop for BlenderProcess {
    fn drop(&mut self) {
        self.kill();
    }
}

pub type BlenderState = Mutex<BlenderProcess>;
```

**Step 3: Register in main.rs / lib.rs**

Update the Tauri entry point to include Blender state. The exact file depends on Tauri 2.x scaffold output — it may be `lib.rs` or `main.rs`:

```rust
// Add to the Tauri app builder:
mod blender;
mod commands;

use blender::{BlenderProcess, BlenderState};
use std::sync::Mutex;

// In the builder:
// .manage(Mutex::new(BlenderProcess::new()) as BlenderState)
```

(Exact integration depends on scaffold output — the executor should adapt to whichever file Tauri generates.)

**Step 4: Verify it compiles**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Compiles with no errors (may have warnings for unused code, that's fine).

**Step 5: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/src-tauri/src/blender.rs droneai-studio/blender_startup.py
git commit -m "feat: add Blender detection and subprocess launcher"
```

---

### Task 12: Claude Code subprocess management (claude_code.rs)

Spawns a Claude Code CLI process, pipes messages via stdin, reads streamed responses from stdout.

**Files:**
- Create: `droneai-studio/src-tauri/src/claude_code.rs`

**Step 1: Write claude_code.rs**

```rust
// droneai-studio/src-tauri/src/claude_code.rs
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use tauri::{AppHandle, Emitter};

pub struct ClaudeSession {
    child: Option<Child>,
    stdin: Option<std::process::ChildStdin>,
}

impl ClaudeSession {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
        }
    }

    /// Spawn a new Claude Code session with the drone show system prompt.
    pub fn start(&mut self, system_prompt_path: &str, app: AppHandle) -> Result<(), String> {
        // Kill existing session if any
        self.stop();

        let mut child = Command::new("claude")
            .args([
                "--print",
                "--system-prompt", system_prompt_path,
                "--output-format", "stream-json",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start Claude Code: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to get stdout")?;

        self.child = Some(child);
        self.stdin = Some(stdin);

        // Read stdout in background thread, emit events to frontend
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        let _ = app.emit("claude-response", &text);
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(())
    }

    /// Send a message to the Claude Code session.
    pub fn send(&mut self, message: &str) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("No active session")?;
        writeln!(stdin, "{}", message)
            .map_err(|e| format!("Failed to write to Claude: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;
        Ok(())
    }

    /// Stop the Claude Code session.
    pub fn stop(&mut self) {
        self.stdin = None;
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
    }

    pub fn is_active(&mut self) -> bool {
        match &mut self.child {
            Some(child) => child.try_wait().ok().flatten().is_none(),
            None => false,
        }
    }
}

impl Drop for ClaudeSession {
    fn drop(&mut self) {
        self.stop();
    }
}

pub type ClaudeState = Mutex<ClaudeSession>;
```

**Step 2: Verify it compiles**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Compiles (may need `tauri` features — adjust Cargo.toml if needed).

**Step 3: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/src-tauri/src/claude_code.rs
git commit -m "feat: add Claude Code subprocess management"
```

---

### Task 13: NSWindow embedding (embed.rs)

macOS-specific: finds Blender's window by PID, removes chrome, reparents into Tauri's webview.

**Files:**
- Create: `droneai-studio/src-tauri/src/embed.rs`
- Modify: `droneai-studio/src-tauri/Cargo.toml` (add cocoa + objc dependencies)

**Step 1: Add macOS dependencies to Cargo.toml**

Append to `[dependencies]` in `droneai-studio/src-tauri/Cargo.toml`:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
cocoa = "0.26"
objc = "0.2"
```

**Step 2: Write embed.rs**

```rust
// droneai-studio/src-tauri/src/embed.rs
//! macOS NSWindow embedding for Blender viewport.
//!
//! Finds Blender's window by PID, removes its chrome (title bar),
//! and reparents its content view into the Tauri app's right panel.

#[cfg(target_os = "macos")]
pub mod macos {
    use cocoa::appkit::{NSWindow, NSWindowStyleMask, NSView};
    use cocoa::base::{id, nil};
    use objc::runtime::Object;
    use std::process::Command;

    /// Find the window ID (CGWindowID) for a given process ID.
    /// Returns the NSWindow pointer if found.
    pub fn find_window_by_pid(pid: u32) -> Option<u64> {
        // Use CGWindowListCopyWindowInfo to find windows for the PID
        let output = Command::new("osascript")
            .args([
                "-e",
                &format!(
                    "tell application \"System Events\" to get id of first window of (first process whose unix id is {})",
                    pid
                ),
            ])
            .output()
            .ok()?;

        if output.status.success() {
            let id_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            id_str.parse::<u64>().ok()
        } else {
            None
        }
    }

    /// Attempt to embed a Blender window into a target NSView.
    /// This is a best-effort operation — embedding may fail due to
    /// permissions or OpenGL context issues.
    pub fn embed_window(_blender_pid: u32, _target_view: id) -> Result<(), String> {
        // Phase 1 implementation: Position Blender window adjacent to app
        // True embedding (NSView reparenting) is complex with OpenGL contexts
        // and will be refined in Phase 2.
        //
        // For now, we use the "side-by-side" fallback approach:
        // 1. Remove Blender's title bar
        // 2. Position it next to the app window
        // 3. Resize to match the viewport area
        Err("Window embedding not yet implemented — using side-by-side fallback".to_string())
    }

    /// Position Blender window adjacent to the app window (fallback).
    pub fn position_side_by_side(
        blender_pid: u32,
        app_x: f64,
        app_y: f64,
        app_width: f64,
        app_height: f64,
        chat_width: f64,
    ) -> Result<(), String> {
        // Position Blender to the right of the chat panel
        let blender_x = app_x + chat_width;
        let blender_y = app_y;
        let blender_width = app_width - chat_width;
        let blender_height = app_height - 48.0; // minus timeline bar

        let script = format!(
            r#"tell application "System Events"
                set blenderProc to first process whose unix id is {}
                tell blenderProc
                    set position of first window to {{{}, {}}}
                    set size of first window to {{{}, {}}}
                end tell
            end tell"#,
            blender_pid,
            blender_x as i32,
            blender_y as i32,
            blender_width as i32,
            blender_height as i32,
        );

        Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to position Blender window: {}", e))?;

        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
pub mod macos {
    pub fn find_window_by_pid(_pid: u32) -> Option<u64> {
        None
    }

    pub fn embed_window(_blender_pid: u32, _target_view: cocoa::base::id) -> Result<(), String> {
        Err("Window embedding only supported on macOS".to_string())
    }
}
```

**Step 3: Verify it compiles**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Compiles on macOS.

**Step 4: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/src-tauri/src/embed.rs droneai-studio/src-tauri/Cargo.toml
git commit -m "feat: add macOS window embedding with side-by-side fallback"
```

---

### Task 14: Tauri IPC commands (commands.rs) + wire everything

Connect the Rust backend to the frontend via Tauri IPC commands.

**Files:**
- Create: `droneai-studio/src-tauri/src/commands.rs`
- Modify: `droneai-studio/src-tauri/src/main.rs` (or `lib.rs`) — register commands and state

**Step 1: Write commands.rs**

```rust
// droneai-studio/src-tauri/src/commands.rs
use tauri::State;

use crate::blender::BlenderState;
use crate::claude_code::ClaudeState;

#[tauri::command]
pub fn get_blender_status(blender: State<'_, BlenderState>) -> String {
    let mut blender = blender.lock().unwrap();
    if blender.is_running() {
        "running".to_string()
    } else {
        "stopped".to_string()
    }
}

#[tauri::command]
pub fn launch_blender(blender: State<'_, BlenderState>) -> Result<u32, String> {
    let mut blender = blender.lock().unwrap();

    // Resolve startup script path relative to app
    let startup_script = std::env::current_dir()
        .map(|p| p.join("blender_startup.py"))
        .map_err(|e| format!("Cannot determine working directory: {}", e))?;

    let script_path = startup_script.to_str()
        .ok_or("Invalid startup script path")?;

    blender.launch(script_path)
}

#[tauri::command]
pub fn send_message(
    message: String,
    claude: State<'_, ClaudeState>,
) -> Result<(), String> {
    let mut session = claude.lock().unwrap();
    session.send(&message)
}

#[tauri::command]
pub fn new_chat(
    claude: State<'_, ClaudeState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut session = claude.lock().unwrap();

    // Resolve system prompt path
    let prompt_path = std::env::current_dir()
        .map(|p| {
            p.parent()
                .unwrap_or(&p)
                .join("droneai")
                .join("system_prompt.md")
        })
        .map_err(|e| format!("Cannot determine working directory: {}", e))?;

    let prompt_str = prompt_path.to_str()
        .ok_or("Invalid system prompt path")?;

    session.start(prompt_str, app)
}

#[tauri::command]
pub fn get_claude_status(claude: State<'_, ClaudeState>) -> String {
    let mut session = claude.lock().unwrap();
    if session.is_active() {
        "active".to_string()
    } else {
        "inactive".to_string()
    }
}
```

**Step 2: Wire up main.rs / lib.rs**

Update the Tauri entry point to register everything:

```rust
// droneai-studio/src-tauri/src/lib.rs (or main.rs depending on scaffold)
mod blender;
mod claude_code;
mod commands;
mod embed;

use blender::BlenderProcess;
use claude_code::ClaudeSession;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(BlenderProcess::new()))
        .manage(Mutex::new(ClaudeSession::new()))
        .invoke_handler(tauri::generate_handler![
            commands::get_blender_status,
            commands::launch_blender,
            commands::send_message,
            commands::new_chat,
            commands::get_claude_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Verify it compiles and runs**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm run tauri dev
```

Expected: App launches, chat panel works (placeholder responses). No Blender or Claude Code launched yet (those need manual trigger).

**Step 4: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/src-tauri/src/commands.rs droneai-studio/src-tauri/src/lib.rs
git commit -m "feat: add Tauri IPC commands for Blender and Claude Code"
```

---

## Part D: Frontend Hooks and Integration

### Task 15: useClaude hook — wire chat to Tauri IPC

Connect the React chat panel to the Rust backend.

**Files:**
- Create: `droneai-studio/src/hooks/useClaude.ts`
- Modify: `droneai-studio/src/App.tsx` — use the hook

**Step 1: Write useClaude.ts**

```typescript
// droneai-studio/src/hooks/useClaude.ts
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface UseClaude {
  sendMessage: (text: string) => Promise<void>;
  newChat: () => Promise<void>;
  isActive: boolean;
  streamedText: string;
}

export function useClaude(): UseClaude {
  const [isActive, setIsActive] = useState(false);
  const [streamedText, setStreamedText] = useState("");

  useEffect(() => {
    // Listen for streamed responses from Claude Code
    const unlisten = listen<string>("claude-response", (event) => {
      try {
        // Claude Code stream-json format: parse each line
        const data = JSON.parse(event.payload);
        if (data.type === "assistant" && data.content) {
          setStreamedText((prev) => prev + data.content);
        }
      } catch {
        // Raw text fallback
        setStreamedText((prev) => prev + event.payload);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    setStreamedText("");
    await invoke("send_message", { message: text });
  }, []);

  const newChat = useCallback(async () => {
    await invoke("new_chat");
    setIsActive(true);
    setStreamedText("");
  }, []);

  return { sendMessage, newChat, isActive, streamedText };
}
```

**Step 2: Write useBlender.ts**

```typescript
// droneai-studio/src/hooks/useBlender.ts
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseBlender {
  status: "stopped" | "running" | "error";
  launch: () => Promise<void>;
  error: string | null;
}

export function useBlender(): UseBlender {
  const [status, setStatus] = useState<"stopped" | "running" | "error">("stopped");
  const [error, setError] = useState<string | null>(null);

  const launch = useCallback(async () => {
    try {
      await invoke("launch_blender");
      setStatus("running");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }, []);

  return { status, launch, error };
}
```

**Step 3: Update App.tsx to use hooks**

Replace the placeholder `handleSendMessage` in `App.tsx` with the real hook:

```tsx
// droneai-studio/src/App.tsx
import { useState, useEffect } from "react";
import ChatPanel from "./components/ChatPanel";
import BlenderViewport from "./components/BlenderViewport";
import TimelineBar from "./components/TimelineBar";
import { useClaude } from "./hooks/useClaude";
import { useBlender } from "./hooks/useBlender";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Welcome to DroneAI Studio! Describe a drone show and I'll build it for you.",
      timestamp: Date.now(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const claude = useClaude();
  const blender = useBlender();

  // Start Claude Code session on mount
  useEffect(() => {
    claude.newChat().catch(console.error);
  }, []);

  // Collect streamed text into messages
  useEffect(() => {
    if (claude.streamedText) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.id.startsWith("stream-")) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: claude.streamedText },
          ];
        }
        return [
          ...prev,
          {
            id: `stream-${Date.now()}`,
            role: "assistant",
            content: claude.streamedText,
            timestamp: Date.now(),
          },
        ];
      });
      setIsLoading(false);
    }
  }, [claude.streamedText]);

  const handleSendMessage = async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      await claude.sendMessage(text);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${e}`,
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      <div className="w-[380px] min-w-[300px] border-r border-[var(--border)] flex flex-col">
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex-1">
          <BlenderViewport />
        </div>
        <div className="h-12 border-t border-[var(--border)]">
          <TimelineBar />
        </div>
      </div>
    </div>
  );
}

export default App;
```

**Step 4: Verify it compiles**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm run tauri dev
```

Expected: App launches. Chat sends messages to Rust backend. (Claude Code may not respond yet if not installed/configured — that's OK for now.)

**Step 5: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/src/hooks/ droneai-studio/src/App.tsx
git commit -m "feat: add useClaude and useBlender hooks, wire to Tauri IPC"
```

---

### Task 16: SetupScreen — first-launch experience

Shows when Blender or Claude Code isn't detected. Guides user through setup.

**Files:**
- Create: `droneai-studio/src/components/SetupScreen.tsx`
- Modify: `droneai-studio/src/App.tsx` — show SetupScreen when needed

**Step 1: Write SetupScreen.tsx**

```tsx
// droneai-studio/src/components/SetupScreen.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SetupScreenProps {
  onReady: () => void;
}

interface CheckResult {
  blender: boolean;
  claude: boolean;
}

export default function SetupScreen({ onReady }: SetupScreenProps) {
  const [checks, setChecks] = useState<CheckResult>({ blender: false, claude: false });
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    runChecks();
  }, []);

  const runChecks = async () => {
    setChecking(true);
    try {
      const blenderStatus = await invoke<string>("get_blender_status");
      const claudeStatus = await invoke<string>("get_claude_status");
      const result = {
        blender: blenderStatus === "running",
        claude: claudeStatus === "active",
      };
      setChecks(result);
      if (result.blender && result.claude) {
        onReady();
      }
    } catch {
      // Checks failed — show setup UI
    }
    setChecking(false);
  };

  const handleLaunchBlender = async () => {
    try {
      await invoke("launch_blender");
      runChecks();
    } catch (e) {
      console.error("Failed to launch Blender:", e);
    }
  };

  const handleStartClaude = async () => {
    try {
      await invoke("new_chat");
      runChecks();
    } catch (e) {
      console.error("Failed to start Claude:", e);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="max-w-md w-full p-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          DroneAI Studio
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">
          Setting up your workspace...
        </p>

        <div className="space-y-4">
          {/* Blender check */}
          <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Blender 4.x</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {checks.blender ? "Running" : "Not detected"}
              </p>
            </div>
            {checks.blender ? (
              <span className="text-green-400 text-sm">Ready</span>
            ) : (
              <button
                onClick={handleLaunchBlender}
                className="px-3 py-1 bg-[var(--accent)] text-white text-sm rounded hover:bg-[var(--accent-hover)]"
              >
                Launch
              </button>
            )}
          </div>

          {/* Claude check */}
          <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Claude Code</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {checks.claude ? "Connected" : "Not connected"}
              </p>
            </div>
            {checks.claude ? (
              <span className="text-green-400 text-sm">Ready</span>
            ) : (
              <button
                onClick={handleStartClaude}
                className="px-3 py-1 bg-[var(--accent)] text-white text-sm rounded hover:bg-[var(--accent-hover)]"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {checks.blender && checks.claude && (
          <button
            onClick={onReady}
            className="w-full mt-6 px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:bg-[var(--accent-hover)]"
          >
            Start Designing
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Update App.tsx to show SetupScreen**

Add a `setupComplete` state. When false, render SetupScreen. When true, render the main layout. (Modify the existing App.tsx to wrap the main layout in a conditional.)

```tsx
// At the top of App():
const [setupComplete, setSetupComplete] = useState(false);

// In the return:
if (!setupComplete) {
  return <SetupScreen onReady={() => setSetupComplete(true)} />;
}
// ... existing layout ...
```

**Step 3: Verify it works**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm run tauri dev
```

Expected: SetupScreen appears first, then main layout after clicking through.

**Step 4: Commit**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git add droneai-studio/src/components/SetupScreen.tsx droneai-studio/src/App.tsx
git commit -m "feat: add SetupScreen for first-launch experience"
```

---

## Part E: Final Integration

### Task 17: Run all Python tests and verify

**Step 1: Run all Python engine tests**

```bash
/Users/cinex/.local/bin/pytest /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai/tests/ -v
```

Expected: All tests pass — 24 original + new ABC tests (approx 40+ total).

**Step 2: Run Tauri build check**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio
npm run tauri build
```

Expected: macOS .app bundle builds successfully.

---

### Task 18: Final commit and summary

**Step 1: Verify git status**

```bash
cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox
git status
```

**Step 2: Stage and commit any remaining files**

```bash
git add -A
git commit -m "feat: Phase 1 MVP — Tauri app with chat, Blender integration, ABC engine"
```

---

## Test Summary

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `test_formations.py` | 12 | Phase 0 shape generators |
| `test_safety.py` | 6 | Phase 0 safety validation |
| `test_show_format.py` | 5 | Phase 0 JSON schema |
| `test_end_to_end.py` | 1 | Phase 0 full pipeline |
| `test_transition_planners.py` | 6 | LinearPlanner + HungarianPlanner |
| `test_formation_generators.py` | 7 | FormationGenerator ABC + ParametricFormation |
| `test_spacing_enforcer.py` | 5 | SpacingEnforcer ABC + RepulsionEnforcer |
| `test_safety_validator.py` | 4 | SafetyValidator ABC + StandardValidator |
| `test_exporters.py` | 4 | ShowExporter ABC + JsonExporter |
| `test_engine_integration.py` | 1 | Full ABC pipeline: formation→transition→spacing→safety→export |

**Total: ~51 tests**

---

## Execution Order

Tasks are ordered by dependency:

1. **Tasks 1-8** (Part A): Engine ABCs — pure Python, no external dependencies beyond scipy. Can be executed independently.
2. **Task 9** (Part B): Tauri scaffold — creates project structure.
3. **Task 10** (Part B): App layout — depends on Task 9.
4. **Tasks 11-14** (Part C): Rust backend modules — depend on Task 9, can be done in parallel.
5. **Tasks 15-16** (Part D): Frontend hooks and SetupScreen — depend on Tasks 10 + 14.
6. **Tasks 17-18** (Part E): Final verification.

**Recommended batching for subagent execution:**
- Batch 1: Tasks 1-4 (engine directory + transitions + formations)
- Batch 2: Tasks 5-8 (spacing + safety + exporter + integration test)
- Batch 3: Tasks 9-10 (Tauri scaffold + layout)
- Batch 4: Tasks 11-14 (Rust backend)
- Batch 5: Tasks 15-16 (frontend hooks + setup screen)
- Batch 6: Tasks 17-18 (verification + final commit)
