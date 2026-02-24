"""Move drones into a formation shape at a specific frame.

Delegates to droneai.formations.shapes for position generation,
then keyframes drone locations in the Blender scene.
"""
import bpy

from droneai.formations.shapes import (
    grid_formation,
    circle_formation,
    heart_formation,
    star_formation,
    spiral_formation,
    sphere_formation,
    text_formation,
)

# Map shape names to generator functions and their parameter mappings
_SHAPE_MAP = {
    "grid": grid_formation,
    "circle": circle_formation,
    "heart": heart_formation,
    "star": star_formation,
    "spiral": spiral_formation,
    "sphere": sphere_formation,
    "text": text_formation,
}


def create_formation(shape, frame, count=None, **kwargs):
    """Keyframe drones into a formation at a given frame.

    Args:
        shape: Formation shape name ('grid', 'circle', 'heart', 'star',
               'spiral', 'sphere', 'text').
        frame: Blender frame number to set the formation at.
        count: Number of drones (auto-detected from scene if None).
        **kwargs: Shape-specific parameters (scale, radius, altitude, text, etc.).
    """
    # Get drones from scene
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found. Run create_drones first.")
        return

    drones = sorted(
        [obj for obj in drone_collection.objects if obj.name.startswith("Drone_")],
        key=lambda o: o.name,
    )

    if count is None:
        count = len(drones)
    count = min(count, len(drones))

    # Generate formation positions using the shapes library
    gen_fn = _SHAPE_MAP.get(shape)
    if gen_fn is None:
        print(f"Unknown shape: {shape}. Available: {list(_SHAPE_MAP.keys())}")
        return

    positions = gen_fn(count=count, **kwargs)

    # Set keyframes
    bpy.context.scene.frame_set(frame)
    for i, drone in enumerate(drones[:count]):
        if i < len(positions):
            drone.location = positions[i]
            drone.keyframe_insert(data_path="location", frame=frame)

    print(f"Formation '{shape}' set at frame {frame} for {count} drones")
