"""Declarative show spec — describes a drone show as data, not code.

The spec format is:
{
    "version": "1.0",
    "drone_count": int,
    "fps": int,
    "timeline": [
        {
            "time": float (seconds),
            "formation": {"type": "parametric"|"positions", ...},
            "color": {"type": "solid"|"gradient", ...},
            "transition": {"easing": str} (optional, absent on first entry)
        }
    ]
}
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class FormationSpec:
    type: str  # "parametric" | "positions"
    shape: Optional[str] = None  # for "parametric"
    params: dict = field(default_factory=dict)  # for "parametric"
    positions: Optional[List[List[float]]] = None  # for "positions"

    @classmethod
    def from_dict(cls, d: dict) -> "FormationSpec":
        return cls(
            type=d["type"],
            shape=d.get("shape"),
            params=d.get("params", {}),
            positions=d.get("positions"),
        )

    def to_dict(self) -> dict:
        out: dict = {"type": self.type}
        if self.type == "parametric":
            if self.shape:
                out["shape"] = self.shape
            if self.params:
                out["params"] = self.params
        elif self.type == "positions":
            out["positions"] = self.positions
        return out


@dataclass
class ColorSpec:
    type: str  # "solid" | "gradient"
    value: Optional[List[float]] = None  # for "solid": [r, g, b]
    start: Optional[List[float]] = None  # for "gradient"
    end: Optional[List[float]] = None  # for "gradient"
    axis: str = "x"  # for "gradient"

    @classmethod
    def from_dict(cls, d: dict) -> "ColorSpec":
        return cls(
            type=d["type"],
            value=d.get("value"),
            start=d.get("start"),
            end=d.get("end"),
            axis=d.get("axis", "x"),
        )

    def to_dict(self) -> dict:
        out: dict = {"type": self.type}
        if self.type == "solid":
            out["value"] = self.value
        elif self.type == "gradient":
            out["start"] = self.start
            out["end"] = self.end
            out["axis"] = self.axis
        return out


@dataclass
class TransitionSpec:
    easing: str = "ease_in_out"

    @classmethod
    def from_dict(cls, d: dict) -> "TransitionSpec":
        return cls(easing=d.get("easing", "ease_in_out"))

    def to_dict(self) -> dict:
        return {"easing": self.easing}


@dataclass
class TimelineEntry:
    time: float  # seconds — when the formation is reached
    formation: FormationSpec
    color: ColorSpec
    transition: Optional[TransitionSpec] = None
    hold: float = 0.0  # seconds to hold before transitioning to next

    @classmethod
    def from_dict(cls, d: dict) -> "TimelineEntry":
        transition = TransitionSpec.from_dict(d["transition"]) if "transition" in d else None
        return cls(
            time=d["time"],
            formation=FormationSpec.from_dict(d["formation"]),
            color=ColorSpec.from_dict(d["color"]),
            transition=transition,
            hold=d.get("hold", 0.0),
        )

    def to_dict(self) -> dict:
        out: dict = {
            "time": self.time,
            "formation": self.formation.to_dict(),
            "color": self.color.to_dict(),
        }
        if self.transition:
            out["transition"] = self.transition.to_dict()
        if self.hold > 0:
            out["hold"] = self.hold
        return out


@dataclass
class ShowSpec:
    version: str
    drone_count: int
    fps: int
    timeline: List[TimelineEntry]

    @classmethod
    def from_dict(cls, d: dict) -> "ShowSpec":
        if "timeline" not in d or not d["timeline"]:
            raise ValueError("Show spec must have a non-empty 'timeline'")

        drone_count = d.get("drone_count", 0)
        if drone_count < 1:
            raise ValueError("drone_count must be positive")

        entries = [TimelineEntry.from_dict(e) for e in d["timeline"]]

        # Validate timeline is sorted
        for i in range(1, len(entries)):
            if entries[i].time < entries[i - 1].time:
                raise ValueError("Timeline entries must be sorted by time")

        # Validate positions formations match drone_count
        for entry in entries:
            if entry.formation.type == "positions":
                if entry.formation.positions is None or len(entry.formation.positions) != drone_count:
                    raise ValueError(
                        f"'positions' formation must have exactly {drone_count} positions, "
                        f"got {len(entry.formation.positions) if entry.formation.positions else 0}"
                    )

        return cls(
            version=d.get("version", "1.0"),
            drone_count=drone_count,
            fps=d.get("fps", 24),
            timeline=entries,
        )

    @classmethod
    def from_json(cls, s: str) -> "ShowSpec":
        return cls.from_dict(json.loads(s))

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "drone_count": self.drone_count,
            "fps": self.fps,
            "timeline": [e.to_dict() for e in self.timeline],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)
