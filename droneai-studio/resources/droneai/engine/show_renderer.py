"""ShowRenderer — renders a BuildResult into a Blender scene.

This module requires Blender's Python environment (bpy).
It uses the existing blender_scripts helpers for all Blender operations.
"""
from __future__ import annotations

from droneai.engine.show_builder import BuildResult
from droneai.engine.show_spec import ShowSpec


def render_to_blender(result: BuildResult) -> str:
    """Render a validated BuildResult into the Blender scene.

    Clears the scene and creates everything from scratch (atomic).
    Returns a summary string.
    """
    from droneai.blender_scripts.setup_scene import setup_drone_show_scene
    from droneai.blender_scripts.create_drones import create_drones
    from droneai.blender_scripts.set_led_colors import set_led_color_all, set_led_gradient
    from droneai.blender_scripts.animate_transition import animate_transition
    import bpy

    spec = result.spec

    # Calculate total duration from last timeline entry
    last_time = spec.timeline[-1].time
    # Add a few seconds after the last formation for hold
    duration = last_time + 3.0

    # 1. Setup clean scene
    setup_drone_show_scene(fps=spec.fps, duration_seconds=duration)

    # 2. Create drones at first formation positions
    create_drones(count=spec.drone_count, start_positions=result.formations[0])

    # 3. Keyframe each formation's positions and colors
    drones_collection = bpy.data.collections.get("Drones")
    if not drones_collection:
        return "Error: Drones collection not found after create_drones()"

    drone_objects = sorted(
        [obj for obj in drones_collection.objects if obj.type == "MESH"],
        key=lambda o: o.name,
    )

    for entry_idx, (entry, positions, frame) in enumerate(
        zip(spec.timeline, result.formations, result.frames)
    ):
        # Set positions
        for drone_idx, drone in enumerate(drone_objects):
            pos = positions[drone_idx]
            drone.location = (pos[0], pos[1], pos[2])
            drone.keyframe_insert(data_path="location", frame=frame)

        # Set colors
        _apply_color(entry.color, drone_objects, frame)

    # 4. Set interpolation for transitions
    for i in range(1, len(result.frames)):
        easing = spec.timeline[i].transition.easing if spec.timeline[i].transition else "EASE_IN_OUT"
        blender_easing = easing.upper().replace("-", "_")
        animate_transition(result.frames[i - 1], result.frames[i], easing=blender_easing)

    # 5. Set frame range
    bpy.context.scene.frame_end = result.frames[-1]
    bpy.context.scene.frame_set(0)

    summary = (
        f"Show rendered: {spec.drone_count} drones, "
        f"{len(spec.timeline)} formations, "
        f"{result.frames[-1]} frames ({result.frames[-1] / spec.fps:.1f}s)"
    )
    return summary


def _apply_color(color_spec, drone_objects, frame):
    """Apply a ColorSpec to drone objects at a frame."""
    from droneai.blender_scripts.set_led_colors import (
        set_led_color_all,
        set_led_gradient,
    )

    if color_spec.type == "solid":
        set_led_color_all(tuple(color_spec.value), frame=frame)
    elif color_spec.type == "gradient":
        set_led_gradient(
            tuple(color_spec.start),
            tuple(color_spec.end),
            frame=frame,
            axis=color_spec.axis,
        )
