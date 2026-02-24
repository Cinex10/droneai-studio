"""Tests for ShowExporter ABC and JsonExporter."""
import json
import os
import tempfile
import pytest


def test_show_exporter_is_abstract():
    from droneai.engine.exporters.base import ShowExporter
    with pytest.raises(TypeError):
        ShowExporter()


def test_json_exporter_creates_valid_json():
    from droneai.engine.exporters.json_exporter import JsonExporter
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    show = Show(
        manifest=ShowManifest(title="Test", drone_count=2, duration_seconds=10.0),
        trajectories=[
            DroneTrajectory("d1", [(0, 0, 0, 0), (10, 0, 0, 10)]),
            DroneTrajectory("d2", [(0, 5, 0, 0), (10, 5, 0, 10)]),
        ],
        lights=[
            DroneLightProgram("d1", [(0, 255, 255, 255, False)]),
            DroneLightProgram("d2", [(0, 255, 0, 0, False)]),
        ],
    )

    exporter = JsonExporter()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        tmp_path = f.name

    try:
        exporter.export(show, tmp_path)
        with open(tmp_path) as f:
            data = json.load(f)
        assert data["manifest"]["title"] == "Test"
        assert data["manifest"]["drone_count"] == 2
        assert len(data["drones"]) == 2
    finally:
        os.unlink(tmp_path)


def test_json_exporter_roundtrip():
    from droneai.engine.exporters.json_exporter import JsonExporter
    from droneai.show_format.schema import Show, ShowManifest, DroneTrajectory, DroneLightProgram

    show = Show(
        manifest=ShowManifest(title="Roundtrip", drone_count=1, duration_seconds=5.0),
        trajectories=[DroneTrajectory("d1", [(0, 1, 2, 3)])],
        lights=[DroneLightProgram("d1", [(0, 100, 200, 50, True)])],
    )

    exporter = JsonExporter()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        tmp_path = f.name

    try:
        exporter.export(show, tmp_path)
        with open(tmp_path) as f:
            data = json.load(f)
        assert data["manifest"]["version"] == "1.0.0"
        assert data["drones"][0]["trajectory"][0]["x"] == 1
        assert data["drones"][0]["trajectory"][0]["y"] == 2
        assert data["drones"][0]["trajectory"][0]["z"] == 3
    finally:
        os.unlink(tmp_path)
