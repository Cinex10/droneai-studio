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
