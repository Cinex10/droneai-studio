"""Setup a clean Blender scene for drone show design.

Works in both GUI and headless (--background) mode by using
data-level API instead of bpy.ops operators.
"""
import bpy


def setup_drone_show_scene(fps=24, duration_seconds=60):
    """Initialize a clean drone show scene.

    Args:
        fps: Frames per second for the animation.
        duration_seconds: Total show duration.
    """
    # Remove all existing objects using data API (no bpy.ops needed)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

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
        bg.inputs[0].default_value = (0.01, 0.01, 0.02, 1.0)

    # Create ground plane using data API (no bpy.ops)
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=50.0)
    ground_mesh = bpy.data.meshes.new("GroundMesh")
    bm.to_mesh(ground_mesh)
    bm.free()

    ground = bpy.data.objects.new("Ground", ground_mesh)
    scene.collection.objects.link(ground)
    mat = bpy.data.materials.new("Ground_Material")
    mat.diffuse_color = (0.1, 0.15, 0.1, 1.0)
    ground.data.materials.append(mat)

    # Create a collection for drones
    if "Drones" not in bpy.data.collections:
        drone_collection = bpy.data.collections.new("Drones")
        scene.collection.children.link(drone_collection)

    print(f"Scene ready: {fps}fps, {duration_seconds}s, {scene.frame_end} frames")
