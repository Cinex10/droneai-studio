"""Tests for drone show file format."""
import json
import pytest


def test_create_show_manifest():
    from droneai.show_format.schema import ShowManifest
    m = ShowManifest(title="Test Show", drone_count=50, duration_seconds=120.0)
    d = m.to_dict()
    assert d["title"] == "Test Show"
    assert d["drone_count"] == 50
    assert d["duration_seconds"] == 120.0
    assert "version" in d


def test_create_drone_trajectory():
    from droneai.show_format.schema import DroneTrajectory
    keyframes = [
        (0.0, 0.0, 0.0, 0.0),    # t, x, y, z
        (5.0, 0.0, 0.0, 10.0),   # takeoff
        (10.0, 5.0, 0.0, 10.0),  # move
    ]
    traj = DroneTrajectory(drone_id="drone_001", keyframes=keyframes)
    d = traj.to_dict()
    assert d["drone_id"] == "drone_001"
    assert len(d["keyframes"]) == 3
    assert d["keyframes"][0] == {"t": 0.0, "x": 0.0, "y": 0.0, "z": 0.0}


def test_create_drone_light_program():
    from droneai.show_format.schema import DroneLightProgram
    keyframes = [
        (0.0, 255, 0, 0, True),   # t, r, g, b, is_fade
        (5.0, 0, 0, 255, True),   # fade to blue
    ]
    lp = DroneLightProgram(drone_id="drone_001", keyframes=keyframes)
    d = lp.to_dict()
    assert d["drone_id"] == "drone_001"
    assert len(d["keyframes"]) == 2
    assert d["keyframes"][0]["color"] == [255, 0, 0]


def test_create_full_show():
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram
    manifest = ShowManifest(title="My Show", drone_count=2, duration_seconds=10.0)
    trajectories = [
        DroneTrajectory("d1", [(0.0, 0.0, 0.0, 0.0), (5.0, 0.0, 0.0, 10.0)]),
        DroneTrajectory("d2", [(0.0, 3.0, 0.0, 0.0), (5.0, 3.0, 0.0, 10.0)]),
    ]
    lights = [
        DroneLightProgram("d1", [(0.0, 255, 0, 0, True)]),
        DroneLightProgram("d2", [(0.0, 0, 255, 0, True)]),
    ]
    show = Show(manifest=manifest, trajectories=trajectories, lights=lights)
    d = show.to_dict()
    assert d["manifest"]["drone_count"] == 2
    assert len(d["drones"]) == 2


def test_show_to_json_roundtrip():
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram
    manifest = ShowManifest(title="Roundtrip Test", drone_count=1, duration_seconds=5.0)
    show = Show(
        manifest=manifest,
        trajectories=[DroneTrajectory("d1", [(0.0, 0.0, 0.0, 0.0)])],
        lights=[DroneLightProgram("d1", [(0.0, 255, 255, 255, True)])],
    )
    json_str = show.to_json()
    parsed = json.loads(json_str)
    assert parsed["manifest"]["title"] == "Roundtrip Test"
