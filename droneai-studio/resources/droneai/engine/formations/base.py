"""Abstract base class for formation generation."""
from abc import ABC, abstractmethod
from typing import List, Tuple

Position = Tuple[float, float, float]


class FormationGenerator(ABC):
    """Generates drone positions for a given shape."""

    @abstractmethod
    def generate(self, count: int, **params) -> List[Position]:
        """Generate positions for count drones.

        Args:
            count: Number of drones.
            **params: Shape-specific parameters (shape, radius, altitude, etc.)

        Returns:
            List of (x, y, z) positions.
        """
        ...

    @abstractmethod
    def available_shapes(self) -> List[str]:
        """Return list of supported shape names."""
        ...
