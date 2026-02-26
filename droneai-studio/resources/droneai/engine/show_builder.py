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
        # Use a small buffer above min_spacing so floating-point imprecision
        # doesn't cause the safety validator to flag near-exact-threshold pairs.
        enforce_spacing = self.min_spacing + 0.05
        for i in range(len(formations)):
            formations[i] = self.enforcer.enforce(formations[i], enforce_spacing)

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
