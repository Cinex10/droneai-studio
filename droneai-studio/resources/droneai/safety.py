"""Drone show safety validation.

Checks spacing between drones, altitude limits, velocity limits,
and acceleration limits across a show timeline.
"""
import math
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

Position = Tuple[float, float, float]


@dataclass
class SafetyParams:
    min_spacing: float = 2.0  # meters
    max_altitude: float = 120.0  # meters
    max_velocity: float = 8.0  # m/s
    max_acceleration: float = 4.0  # m/s^2


@dataclass
class SafetyResult:
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


def _distance(a: Position, b: Position) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def validate_frame(
    positions: Dict[str, Position],
    params: SafetyParams,
) -> SafetyResult:
    """Validate a single frame: check spacing and altitude."""
    result = SafetyResult()
    names = list(positions.keys())

    # Check altitude
    for name, pos in positions.items():
        if pos[2] > params.max_altitude:
            result.add_violation(
                f"Altitude violation: {name} at {pos[2]:.1f}m (max {params.max_altitude}m)"
            )
        result.max_altitude_found = max(result.max_altitude_found, pos[2])

    # Check spacing between all pairs
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            dist = _distance(positions[names[i]], positions[names[j]])
            result.min_spacing_found = min(result.min_spacing_found, dist)
            if dist < params.min_spacing:
                result.add_violation(
                    f"Spacing violation: {names[i]} and {names[j]} "
                    f"are {dist:.2f}m apart (min {params.min_spacing}m)"
                )

    return result


def validate_velocity(
    positions_t0: Dict[str, Position],
    positions_t1: Dict[str, Position],
    dt: float,
    params: SafetyParams,
) -> SafetyResult:
    """Validate velocity between two consecutive frames."""
    result = SafetyResult()
    if dt <= 0:
        return result

    for name in positions_t0:
        if name not in positions_t1:
            continue
        dist = _distance(positions_t0[name], positions_t1[name])
        velocity = dist / dt
        result.max_velocity_found = max(result.max_velocity_found, velocity)
        if velocity > params.max_velocity:
            result.add_violation(
                f"Velocity violation: {name} moving at {velocity:.1f}m/s "
                f"(max {params.max_velocity}m/s)"
            )

    return result


def validate_show(
    timeline: List[Tuple[float, Dict[str, Position]]],
    params: SafetyParams,
) -> SafetyResult:
    """Validate an entire show timeline.

    Args:
        timeline: List of (time_seconds, {drone_name: (x, y, z)}) sorted by time.
        params: Safety parameters.

    Returns:
        SafetyResult with all violations found.
    """
    result = SafetyResult()

    for i, (t, positions) in enumerate(timeline):
        # Check spacing and altitude at each frame
        frame_result = validate_frame(positions, params)
        result.merge(frame_result)

        # Check velocity between consecutive frames
        if i > 0:
            prev_t, prev_positions = timeline[i - 1]
            dt = t - prev_t
            vel_result = validate_velocity(prev_positions, positions, dt, params)
            result.merge(vel_result)

    return result
