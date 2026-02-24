"""Hungarian algorithm transition planner -- optimal assignment."""
import math
from typing import List, Tuple

try:
    from scipy.optimize import linear_sum_assignment
except ImportError:
    linear_sum_assignment = None

from droneai.engine.transitions.base import TransitionPlanner, Position


class HungarianPlanner(TransitionPlanner):
    """Optimal assignment using the Hungarian algorithm.

    Minimizes total travel distance across all drones, which prevents
    path crossings and reduces collision risk during transitions.
    Uses scipy.optimize.linear_sum_assignment on the Euclidean distance matrix.
    """

    def plan(self, source: List[Position], target: List[Position]) -> List[int]:
        if linear_sum_assignment is None:
            raise ImportError(
                "scipy is required for HungarianPlanner. "
                "Use LinearPlanner as a fallback."
            )
        if len(source) != len(target):
            raise ValueError(
                f"Source ({len(source)}) and target ({len(target)}) must have same count"
            )
        n = len(source)
        if n == 0:
            return []

        # Build cost matrix: cost[i][j] = distance from source[i] to target[j]
        cost = []
        for i in range(n):
            row = []
            for j in range(n):
                dist = math.sqrt(
                    (source[i][0] - target[j][0]) ** 2
                    + (source[i][1] - target[j][1]) ** 2
                    + (source[i][2] - target[j][2]) ** 2
                )
                row.append(dist)
            cost.append(row)

        # Solve assignment problem
        row_ind, col_ind = linear_sum_assignment(cost)

        # Build mapping: source[i] -> target[mapping[i]]
        mapping = [0] * n
        for r, c in zip(row_ind, col_ind):
            mapping[r] = c

        return mapping
