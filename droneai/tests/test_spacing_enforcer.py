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
