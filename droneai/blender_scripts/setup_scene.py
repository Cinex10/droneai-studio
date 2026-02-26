"""Setup a clean Blender scene for drone show design.

Execute in Blender via MCP execute_blender_code.
Clears existing objects and configures the scene.
"""
import bpy


def setup_drone_show_scene(fps=24, duration_seconds=60):
    """Initialize a clean drone show scene.

    Args:
        fps: Frames per second for the animation.
        duration_seconds: Total show duration.
    """
    # Clear existing objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Clear orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)

    # Configure scene
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = 0
    scene.frame_end = int(fps * duration_seconds)
    scene.frame_current = 0

    # Set up world (dark background for drone show)
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.01, 0.01, 0.02, 1.0)  # near black

    # Create ground plane (optional reference)
    bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    mat = bpy.data.materials.new("Ground_Material")
    mat.diffuse_color = (0.1, 0.15, 0.1, 1.0)
    ground.data.materials.append(mat)

    # Create a collection for drones
    if "Drones" not in bpy.data.collections:
        drone_collection = bpy.data.collections.new("Drones")
        scene.collection.children.link(drone_collection)

    print(f"Scene ready: {fps}fps, {duration_seconds}s, {scene.frame_end} frames")


# Execute (only when run as standalone script, not on import)
if __name__ == "__main__":
    setup_drone_show_scene()
