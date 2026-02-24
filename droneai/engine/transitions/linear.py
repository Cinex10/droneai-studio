"""Linear (identity) transition planner -- Phase 0 behavior."""
from typing import List, Tuple

from droneai.engine.transitions.base import TransitionPlanner, Position


class LinearPlanner(TransitionPlanner):
    """Identity mapping: source[i] -> target[i].

    Fast but causes path crossings when formations differ significantly.
    Only safe for same-ordering formations (e.g., grid->grid with same layout).
    """

    def plan(self, source: List[Position], target: List[Position]) -> List[int]:
        if len(source) != len(target):
            raise ValueError(
                f"Source ({len(source)}) and target ({len(target)}) must have same count"
            )
        return list(range(len(source)))
