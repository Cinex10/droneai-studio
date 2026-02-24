"""Integration test: full pipeline using ABC-based engine components."""
import json
import math
import os
import tempfile
import pytest


def test_full_pipeline_with_abcs():
    """Generate formations -> plan transitions -> enforce spacing -> validate -> export.

    Uses grid->circle->grid transitions with enough spacing and transition time
    to avoid mid-transition violations. Tests the complete engine pipeline:
    ParametricFormation, HungarianPlanner, RepulsionEnforcer, StandardValidator, JsonExporter.
    """
    from droneai.engine.formations.parametric import ParametricFormation
    from droneai.engine.transitions.hungarian import HungarianPlanner
    from droneai.engine.formations.spacing import RepulsionEnforcer
    from droneai.engine.safety.base import SafetyParams
    from droneai.engine.safety.standard import StandardValidator
    from droneai.engine.exporters.json_exporter import JsonExporter
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    # Configuration
    drone_count = 9

    # Initialize engine components
    formation_gen = ParametricFormation()
    planner = HungarianPlanner()
    spacer = RepulsionEnforcer()
    validator = StandardValidator()
    exporter = JsonExporter()
    safety_params = SafetyParams(min_spacing=1.5, max_altitude=120.0, max_velocity=8.0)

    # Generate formations — grids at different altitudes/spacings provide
    # safe linear transitions because the topology is preserved
    ground = formation_gen.generate(drone_count, shape="grid", spacing=3.0, altitude=0.0)
    wide_grid = formation_gen.generate(drone_count, shape="grid", spacing=5.0, altitude=15.0)
    high_grid = formation_gen.generate(drone_count, shape="grid", spacing=4.0, altitude=25.0)

    # Enforce spacing
    wide_grid = spacer.enforce(wide_grid, min_spacing=2.0)
    high_grid = spacer.enforce(high_grid, min_spacing=2.0)

    # Plan transitions (optimal assignment)
    ground_to_wide = planner.plan(ground, wide_grid)
    wide_to_high = planner.plan(wide_grid, high_grid)
    high_to_ground = planner.plan(high_grid, ground)

    # Reorder targets based on assignment
    wide_ordered = [wide_grid[ground_to_wide[i]] for i in range(drone_count)]
    high_ordered = [high_grid[wide_to_high[i]] for i in range(drone_count)]
    ground_final = [ground[high_to_ground[i]] for i in range(drone_count)]

    # Build show timeline
    show_segments = [
        (0.0, ground),
        (5.0, ground),            # hold on ground
        (15.0, wide_ordered),     # transition to wide grid (10s)
        (25.0, wide_ordered),     # hold
        (35.0, high_ordered),     # transition to high grid (10s)
        (45.0, high_ordered),     # hold
        (55.0, ground_final),     # transition to ground (10s)
        (60.0, ground_final),     # hold on ground
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
            (55.0, 255, 255, 255, True),
            (60.0, 0, 0, 0, True),
        ]))

    show = Show(
        manifest=ShowManifest(
            title="ABC Pipeline Test",
            drone_count=drone_count,
            duration_seconds=60.0,
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
          f"3 formations (grid->wide_grid->high_grid), "
          f"min spacing={result.min_spacing_found:.2f}m")
