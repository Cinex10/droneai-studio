"""Tests for show spec parsing and validation."""
import pytest
import json


def test_parse_minimal_spec():
    """Minimal valid spec: 1 formation, solid color."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.0, "altitude": 0}},
                "color": {"type": "solid", "value": [1.0, 1.0, 1.0]},
            }
        ],
    }
    spec = ShowSpec.from_dict(raw)
    assert spec.drone_count == 5
    assert spec.fps == 24
    assert len(spec.timeline) == 1
    assert spec.timeline[0].time == 0
    assert spec.timeline[0].formation.type == "parametric"
    assert spec.timeline[0].formation.shape == "grid"
    assert spec.timeline[0].color.type == "solid"


def test_parse_full_spec():
    """Full spec with multiple formations, transitions, different color types."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 25,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.5, "altitude": 0}},
                "color": {"type": "solid", "value": [0.2, 0.2, 1.0]},
            },
            {
                "time": 3,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 12, "altitude": 15}},
                "color": {"type": "gradient", "start": [0, 0.8, 1], "end": [0, 0.2, 1], "axis": "x"},
                "transition": {"easing": "ease_in_out"},
            },
            {
                "time": 7,
                "formation": {"type": "positions", "positions": [[i, 0, 20] for i in range(25)]},
                "color": {"type": "solid", "value": [1, 0.1, 0.3]},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    }
    spec = ShowSpec.from_dict(raw)
    assert spec.drone_count == 25
    assert len(spec.timeline) == 3
    assert spec.timeline[1].transition.easing == "ease_in_out"
    assert spec.timeline[2].formation.type == "positions"
    assert len(spec.timeline[2].formation.positions) == 25


def test_parse_from_json_string():
    """Parse from JSON string (as MCP tool would receive)."""
    from droneai.engine.show_spec import ShowSpec

    raw = json.dumps({
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 5}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            }
        ],
    })
    spec = ShowSpec.from_json(raw)
    assert spec.drone_count == 5


def test_invalid_spec_missing_timeline():
    """Spec without timeline raises ValueError."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="timeline"):
        ShowSpec.from_dict({"version": "1.0", "drone_count": 5, "fps": 24})


def test_invalid_spec_zero_drones():
    """drone_count must be positive."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="drone_count"):
        ShowSpec.from_dict({
            "version": "1.0", "drone_count": 0, "fps": 24,
            "timeline": [{"time": 0, "formation": {"type": "parametric", "shape": "grid"}, "color": {"type": "solid", "value": [1,1,1]}}],
        })


def test_invalid_positions_count_mismatch():
    """positions formation must have exactly drone_count positions."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="positions"):
        ShowSpec.from_dict({
            "version": "1.0", "drone_count": 5, "fps": 24,
            "timeline": [
                {
                    "time": 0,
                    "formation": {"type": "positions", "positions": [[0,0,0], [1,0,0]]},
                    "color": {"type": "solid", "value": [1,1,1]},
                }
            ],
        })


def test_timeline_sorted_by_time():
    """Timeline entries must be sorted by time."""
    from droneai.engine.show_spec import ShowSpec

    with pytest.raises(ValueError, match="sorted"):
        ShowSpec.from_dict({
            "version": "1.0", "drone_count": 5, "fps": 24,
            "timeline": [
                {"time": 5, "formation": {"type": "parametric", "shape": "grid"}, "color": {"type": "solid", "value": [1,1,1]}},
                {"time": 2, "formation": {"type": "parametric", "shape": "circle"}, "color": {"type": "solid", "value": [1,1,1]}},
            ],
        })


def test_spec_to_dict_roundtrip():
    """to_dict() output can be re-parsed."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 10,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.0}},
                "color": {"type": "solid", "value": [1, 1, 1]},
            },
            {
                "time": 5,
                "formation": {"type": "parametric", "shape": "heart", "params": {"scale": 15}},
                "color": {"type": "gradient", "start": [1, 0, 0], "end": [0, 0, 1], "axis": "z"},
                "transition": {"easing": "ease_in_out"},
            },
        ],
    }
    spec = ShowSpec.from_dict(raw)
    roundtripped = ShowSpec.from_dict(spec.to_dict())
    assert roundtripped.drone_count == spec.drone_count
    assert len(roundtripped.timeline) == len(spec.timeline)
    assert roundtripped.timeline[1].formation.shape == "heart"


def test_parse_program_color_spec():
    """ColorSpec type='program' parses sequences correctly."""
    from droneai.engine.show_spec import ColorSpec

    raw = {
        "type": "program",
        "sequences": [
            {
                "drones": "all",
                "keyframes": [
                    {"t": 0.0, "color": [1, 0, 0]},
                    {"t": 0.5, "color": [0, 0, 1]},
                ],
            }
        ],
    }
    cs = ColorSpec.from_dict(raw)
    assert cs.type == "program"
    assert cs.sequences is not None
    assert len(cs.sequences) == 1
    assert cs.sequences[0]["drones"] == "all"
    assert len(cs.sequences[0]["keyframes"]) == 2
    assert cs.sequences[0]["keyframes"][0]["color"] == [1, 0, 0]


def test_program_color_roundtrip():
    """program ColorSpec survives to_dict() -> from_dict() roundtrip."""
    from droneai.engine.show_spec import ColorSpec

    raw = {
        "type": "program",
        "sequences": [
            {
                "drones": [0, 1, 2],
                "keyframes": [
                    {"t": 0.0, "color": [1, 0, 0]},
                    {"t": 1.0, "color": [0, 1, 0]},
                ],
            },
            {
                "drones": "all",
                "keyframes": [
                    {"t": 0.0, "color": [0, 0, 1]},
                ],
            },
        ],
    }
    cs = ColorSpec.from_dict(raw)
    d = cs.to_dict()
    assert d["type"] == "program"
    assert len(d["sequences"]) == 2
    cs2 = ColorSpec.from_dict(d)
    assert cs2.sequences == cs.sequences


def test_program_in_full_spec():
    """Full ShowSpec with a program color entry parses and roundtrips."""
    from droneai.engine.show_spec import ShowSpec

    raw = {
        "version": "1.0",
        "drone_count": 5,
        "fps": 24,
        "timeline": [
            {
                "time": 0,
                "hold": 2,
                "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.0}},
                "color": {"type": "solid", "value": [0.2, 0.2, 1.0]},
            },
            {
                "time": 5,
                "hold": 3,
                "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 10}},
                "color": {
                    "type": "program",
                    "sequences": [
                        {
                            "drones": "all",
                            "keyframes": [
                                {"t": 0.0, "color": [1, 0, 0]},
                                {"t": 1.0, "color": [0.2, 0, 0]},
                                {"t": 2.0, "color": [1, 0, 0]},
                            ],
                        }
                    ],
                },
                "transition": {"easing": "ease_in_out"},
            },
        ],
    }
    spec = ShowSpec.from_dict(raw)
    assert spec.timeline[1].color.type == "program"
    assert len(spec.timeline[1].color.sequences) == 1

    # Roundtrip
    roundtripped = ShowSpec.from_dict(spec.to_dict())
    assert roundtripped.timeline[1].color.type == "program"
    assert roundtripped.timeline[1].color.sequences == spec.timeline[1].color.sequences
