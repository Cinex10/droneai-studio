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
