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
        ("heart", heart_formation(count=10, scale=30.0, altitude=10.0)),
    ]:
        for i in range(len(points)):
            for j in range(i + 1, len(points)):
                dx = points[i][0] - points[j][0]
                dy = points[i][1] - points[j][1]
                dz = points[i][2] - points[j][2]
                dist = math.sqrt(dx * dx + dy * dy + dz * dz)
                assert dist >= 1.5, f"{name}: drones {i} and {j} too close: {dist:.2f}m"
