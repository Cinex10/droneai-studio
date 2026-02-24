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
