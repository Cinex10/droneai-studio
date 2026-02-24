"""Standard safety validator -- wraps Phase 0 validation logic."""
from droneai.engine.safety.base import (
    SafetyValidator,
    SafetyParams,
    SafetyResult,
    ShowTimeline,
)
from droneai.safety import (
    validate_show as _validate_show,
    SafetyParams as _LegacyParams,
)


class StandardValidator(SafetyValidator):
    """Safety validator using Phase 0 validation logic.

    Checks spacing between drones, altitude limits, and velocity limits
    at each frame of the timeline.
    """

    def validate(self, timeline: ShowTimeline, params: SafetyParams) -> SafetyResult:
        legacy_params = _LegacyParams(
            min_spacing=params.min_spacing,
            max_altitude=params.max_altitude,
            max_velocity=params.max_velocity,
            max_acceleration=params.max_acceleration,
        )
        legacy_result = _validate_show(timeline, legacy_params)

        result = SafetyResult(
            is_safe=legacy_result.is_safe,
            violations=list(legacy_result.violations),
            min_spacing_found=legacy_result.min_spacing_found,
            max_velocity_found=legacy_result.max_velocity_found,
            max_altitude_found=legacy_result.max_altitude_found,
        )
        return result
