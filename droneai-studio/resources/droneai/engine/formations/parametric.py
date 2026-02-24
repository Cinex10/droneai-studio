"""Parametric formation generator -- wraps Phase 0 shape functions."""
from typing import List, Tuple

from droneai.engine.formations.base import FormationGenerator, Position
from droneai.formations.shapes import (
    grid_formation,
    circle_formation,
    heart_formation,
    star_formation,
    spiral_formation,
    sphere_formation,
    text_formation,
)

_SHAPES = {
    "grid": grid_formation,
    "circle": circle_formation,
    "heart": heart_formation,
    "star": star_formation,
    "spiral": spiral_formation,
    "sphere": sphere_formation,
    "text": text_formation,
}


class ParametricFormation(FormationGenerator):
    """Formation generator using parametric shape functions from Phase 0.

    Delegates to the existing shape library. Pass shape name as the
    'shape' keyword argument, plus any shape-specific parameters.
    """

    def generate(self, count: int, **params) -> List[Position]:
        shape = params.pop("shape", "grid")
        if shape not in _SHAPES:
            raise ValueError(
                f"Unknown shape '{shape}'. Available: {list(_SHAPES.keys())}"
            )
        return _SHAPES[shape](count=count, **params)

    def available_shapes(self) -> List[str]:
        return list(_SHAPES.keys())
