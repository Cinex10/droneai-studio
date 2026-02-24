"""DroneAI Studio show file format.

A show file is a JSON document containing:
- manifest: metadata (title, drone count, duration, version)
- drones: list of drone data, each with trajectory and light program
"""
import json
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

FORMAT_VERSION = "1.0.0"


@dataclass
class ShowManifest:
    title: str
    drone_count: int
    duration_seconds: float
    version: str = FORMAT_VERSION

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "drone_count": self.drone_count,
            "duration_seconds": self.duration_seconds,
            "version": self.version,
        }


@dataclass
class DroneTrajectory:
    """Drone flight path as a list of (t, x, y, z) keyframes."""
    drone_id: str
    keyframes: List[Tuple[float, float, float, float]]  # (t, x, y, z)

    def to_dict(self) -> dict:
        return {
            "drone_id": self.drone_id,
            "keyframes": [
                {"t": kf[0], "x": kf[1], "y": kf[2], "z": kf[3]}
                for kf in self.keyframes
            ],
        }


@dataclass
class DroneLightProgram:
    """Drone LED color sequence as a list of (t, r, g, b, is_fade) keyframes."""
    drone_id: str
    keyframes: List[Tuple[float, int, int, int, bool]]  # (t, r, g, b, is_fade)

    def to_dict(self) -> dict:
        return {
            "drone_id": self.drone_id,
            "keyframes": [
                {"t": kf[0], "color": [kf[1], kf[2], kf[3]], "fade": kf[4]}
                for kf in self.keyframes
            ],
        }


@dataclass
class Show:
    manifest: ShowManifest
    trajectories: List[DroneTrajectory]
    lights: List[DroneLightProgram]

    def to_dict(self) -> dict:
        traj_by_id = {t.drone_id: t for t in self.trajectories}
        light_by_id = {l.drone_id: l for l in self.lights}
        all_ids = list(traj_by_id.keys())

        drones = []
        for drone_id in all_ids:
            drone = {"id": drone_id}
            if drone_id in traj_by_id:
                drone["trajectory"] = traj_by_id[drone_id].to_dict()["keyframes"]
            if drone_id in light_by_id:
                drone["lights"] = light_by_id[drone_id].to_dict()["keyframes"]
            drones.append(drone)

        return {
            "manifest": self.manifest.to_dict(),
            "drones": drones,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    def save(self, path: str):
        with open(path, "w") as f:
            f.write(self.to_json())
