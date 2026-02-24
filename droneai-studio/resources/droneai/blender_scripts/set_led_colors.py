"""Set LED colors on drones at specific frames.

Keyframes the emission color on drone materials.
"""
import bpy


def set_led_color_all(color, frame):
    """Set all drones to the same LED color at a frame.

    Args:
        color: (r, g, b) tuple with values 0.0-1.0.
        frame: Blender frame number.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found.")
        return

    for drone in drone_collection.objects:
        if not drone.name.startswith("Drone_"):
            continue
        _set_drone_color(drone, color, frame)

    print(f"All drones set to color {color} at frame {frame}")


def set_led_color_per_drone(colors, frame):
    """Set individual LED colors per drone at a frame.

    Args:
        colors: Dict of {drone_name: (r, g, b)} or list of (r, g, b) in drone order.
        frame: Blender frame number.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found.")
        return

    drones = sorted(
        [obj for obj in drone_collection.objects if obj.name.startswith("Drone_")],
        key=lambda o: o.name,
    )

    if isinstance(colors, list):
        for i, drone in enumerate(drones):
            if i < len(colors):
                _set_drone_color(drone, colors[i], frame)
    elif isinstance(colors, dict):
        for drone in drones:
            if drone.name in colors:
                _set_drone_color(drone, colors[drone.name], frame)

    print(f"Individual drone colors set at frame {frame}")


def set_led_gradient(color_start, color_end, frame, axis="x"):
    """Set a gradient color across drones based on their position.

    Args:
        color_start: (r, g, b) color at the low end.
        color_end: (r, g, b) color at the high end.
        frame: Blender frame number.
        axis: 'x', 'y', or 'z' axis for gradient direction.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        return

    bpy.context.scene.frame_set(frame)
    drones = [obj for obj in drone_collection.objects if obj.name.startswith("Drone_")]
    if not drones:
        return

    axis_idx = {"x": 0, "y": 1, "z": 2}[axis]
    positions = [(d, d.location[axis_idx]) for d in drones]
    min_val = min(p for _, p in positions)
    max_val = max(p for _, p in positions)
    val_range = max_val - min_val if max_val > min_val else 1.0

    for drone, pos in positions:
        t = (pos - min_val) / val_range
        color = (
            color_start[0] + t * (color_end[0] - color_start[0]),
            color_start[1] + t * (color_end[1] - color_start[1]),
            color_start[2] + t * (color_end[2] - color_start[2]),
        )
        _set_drone_color(drone, color, frame)

    print(f"Gradient {axis} set at frame {frame}")


def _set_drone_color(drone, color, frame):
    """Set emission color on a drone's material and keyframe it."""
    if not drone.data.materials:
        return

    mat = drone.data.materials[0]
    if not mat.use_nodes:
        return

    for node in mat.node_tree.nodes:
        if node.type == "EMISSION":
            node.inputs["Color"].default_value = (color[0], color[1], color[2], 1.0)
            node.inputs["Color"].keyframe_insert(data_path="default_value", frame=frame)
            break
