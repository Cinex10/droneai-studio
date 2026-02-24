"""Abstract base class for transition planning."""
from abc import ABC, abstractmethod
from typing import List, Tuple

Position = Tuple[float, float, float]


class TransitionPlanner(ABC):
    """Determines how to assign drones from source positions to target positions.

    Returns a mapping where source[i] should move to target[result[i]].
    """

    @abstractmethod
    def plan(self, source: List[Position], target: List[Position]) -> List[int]:
        """Compute assignment mapping from source to target positions.

        Args:
            source: Current drone positions.
            target: Target formation positions.

        Returns:
            List of indices: source[i] moves to target[result[i]].
        """
        ...
