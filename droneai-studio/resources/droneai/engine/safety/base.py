"""Abstract base class for safety validation."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

Position = Tuple[float, float, float]


@dataclass
class SafetyParams:
    """Parameters for safety validation."""
    min_spacing: float = 2.0
    max_altitude: float = 120.0
    max_velocity: float = 8.0
    max_acceleration: float = 4.0


@dataclass
class SafetyResult:
    """Result of safety validation."""
    is_safe: bool = True
    violations: List[str] = field(default_factory=list)
    min_spacing_found: float = float("inf")
    max_velocity_found: float = 0.0
    max_altitude_found: float = 0.0

    def add_violation(self, msg: str):
        self.is_safe = False
        self.violations.append(msg)

    def merge(self, other: "SafetyResult"):
        if not other.is_safe:
            self.is_safe = False
        self.violations.extend(other.violations)
        self.min_spacing_found = min(self.min_spacing_found, other.min_spacing_found)
        self.max_velocity_found = max(self.max_velocity_found, other.max_velocity_found)
        self.max_altitude_found = max(self.max_altitude_found, other.max_altitude_found)


ShowTimeline = List[Tuple[float, Dict[str, Position]]]


class SafetyValidator(ABC):
    """Validates a drone show timeline against safety constraints."""

    @abstractmethod
    def validate(self, timeline: ShowTimeline, params: SafetyParams) -> SafetyResult:
        """Validate entire show timeline.

        Args:
            timeline: List of (time_seconds, {drone_id: (x,y,z)}).
            params: Safety parameters.

        Returns:
            SafetyResult with any violations found.
        """
        ...
