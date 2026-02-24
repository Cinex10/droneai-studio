"""Spacing enforcement for drone formations."""
import math
import random
from abc import ABC, abstractmethod
from typing import List, Tuple

Position = Tuple[float, float, float]


class SpacingEnforcer(ABC):
    """Adjusts positions to maintain minimum spacing between drones."""

    @abstractmethod
    def enforce(self, positions: List[Position], min_spacing: float) -> List[Position]:
        """Adjust positions so all pairs are at least min_spacing apart.

        Args:
            positions: Current drone positions.
            min_spacing: Minimum distance in meters.

        Returns:
            Adjusted positions.
        """
        ...


class RepulsionEnforcer(SpacingEnforcer):
    """Iterative repulsion: push apart drones closer than min_spacing.

    Uses a simple physics-inspired approach: for each pair of drones that are
    too close, push them apart along the line connecting them. Repeats for
    multiple iterations until convergence or max_iterations reached.
    """

    def __init__(self, max_iterations: int = 200, strength: float = 0.5):
        self.max_iterations = max_iterations
        self.strength = strength

    def enforce(self, positions: List[Position], min_spacing: float) -> List[Position]:
        n = len(positions)
        if n <= 1:
            return list(positions)

        # Work with mutable lists
        pts = [list(p) for p in positions]

        for iteration in range(self.max_iterations):
            moved = False
            for i in range(n):
                for j in range(i + 1, n):
                    dx = pts[j][0] - pts[i][0]
                    dy = pts[j][1] - pts[i][1]
                    dz = pts[j][2] - pts[i][2]
                    dist = math.sqrt(dx * dx + dy * dy + dz * dz)

                    if dist < min_spacing:
                        if dist < 1e-6:
                            # Coincident points -- push in random direction
                            angle = random.uniform(0, 2 * math.pi)
                            dx = math.cos(angle)
                            dy = math.sin(angle)
                            dz = 0
                            dist = 1e-6

                        # Push apart along connecting line
                        overlap = min_spacing - dist
                        push = overlap * self.strength / 2
                        nx, ny, nz = dx / dist, dy / dist, dz / dist

                        pts[i][0] -= nx * push
                        pts[i][1] -= ny * push
                        pts[i][2] -= nz * push
                        pts[j][0] += nx * push
                        pts[j][1] += ny * push
                        pts[j][2] += nz * push
                        moved = True

            if not moved:
                break

        return [(p[0], p[1], p[2]) for p in pts]
