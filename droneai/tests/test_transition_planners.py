"""Tests for transition planner implementations."""
import math
import pytest
from typing import List, Tuple

Position = Tuple[float, float, float]


def test_linear_planner_identity_mapping():
    """LinearPlanner returns identity: source[i] -> target[i]."""
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


def test_hungarian_planner_avoids_crossing():
    """HungarianPlanner should swap assignments to minimize total distance.

    Source: A at (0,0,10), B at (10,0,10)
    Target: X at (10,0,10), Y at (0,0,10)

    Linear would give A->X (10m) + B->Y (10m) = 20m total.
    Hungarian should give A->Y (0m) + B->X (0m) = 0m total.
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
