"""End-to-end test: generate formations, validate safety, export show file."""
import json
import math
import tempfile
import os
import pytest


def test_full_show_pipeline():
    """Create a complete show: ground grid -> takeoff -> expand -> ascend -> descend -> land -> export.

    Uses grid-to-grid transitions which are safe for linear interpolation
    (same drone ordering preserves spacing). Formation shapes like heart/circle
    are individually tested in test_formations.py; real shows would use
    optimal assignment (Hungarian algorithm) for collision-free transitions.
    """
    from droneai.formations.shapes import grid_formation
    from droneai.safety import validate_show, SafetyParams
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    drone_count = 25
    fps = 24
    params = SafetyParams(min_spacing=2.0, max_altitude=120.0, max_velocity=8.0, max_acceleration=4.0)

    # Define formations — grid variants with same drone ordering for safe linear interp
    ground = grid_formation(count=drone_count, spacing=3.0, altitude=0.0)
    takeoff = grid_formation(count=drone_count, spacing=3.0, altitude=10.0)
    high_grid = grid_formation(count=drone_count, spacing=3.0, altitude=20.0)
    wide_grid = grid_formation(count=drone_count, spacing=5.0, altitude=20.0)

    # Define timeline (time_seconds, formation)
    show_segments = [
        (0.0, ground),       # start on ground
        (5.0, takeoff),      # takeoff at t=5s
        (15.0, high_grid),   # ascend at t=15s
        (25.0, wide_grid),   # expand outward at t=25s
        (35.0, high_grid),   # contract back at t=35s
        (45.0, takeoff),     # descend at t=45s
        (50.0, ground),      # land at t=50s
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
            (45.0, 255, 255, 255, True),  # white until landing
            (50.0, 0, 0, 0, True),        # fade to off on landing
        ]))

    manifest = ShowManifest(
        title="Test Show - Grid Variations",
        drone_count=drone_count,
        duration_seconds=50.0,
    )
    show = Show(manifest=manifest, trajectories=trajectories, lights=lights)

    # Export to JSON
    json_str = show.to_json()
    parsed = json.loads(json_str)

    assert parsed["manifest"]["drone_count"] == drone_count
    assert parsed["manifest"]["title"] == "Test Show - Grid Variations"
    assert len(parsed["drones"]) == drone_count
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
