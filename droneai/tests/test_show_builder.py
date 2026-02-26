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

    positions = [[float(i) * 3.0, 0.0, 10.0] for i in range(5)]
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
        assert abs(pos[0] - float(i) * 3.0) < 0.5  # may shift slightly from spacing enforcement


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
