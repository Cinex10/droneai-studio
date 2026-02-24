"""Create drone objects in Blender scene.

Works in both GUI and headless (--background) mode by using
bmesh + data API instead of bpy.ops operators.
"""
import bpy
import math


def create_drones(count, start_positions=None, spacing=2.0):
    """Create drone objects in the scene.

    Args:
        count: Number of drones to create.
        start_positions: Optional list of (x, y, z) starting positions.
            If None, creates a ground-level grid.
        spacing: Grid spacing if no positions provided.

    Returns:
        List of created drone object names.
    """
    # Get or create Drones collection
    if "Drones" not in bpy.data.collections:
        drone_collection = bpy.data.collections.new("Drones")
        bpy.context.scene.collection.children.link(drone_collection)
    drone_collection = bpy.data.collections["Drones"]

    # Generate grid positions if none provided
    if start_positions is None:
        cols = math.ceil(math.sqrt(count))
        start_positions = []
        for i in range(count):
            row = i // cols
            col = i % cols
            x = (col - (cols - 1) / 2) * spacing
            y = (row - (cols - 1) / 2) * spacing
            start_positions.append((x, y, 0.0))

    # Create a shared low-poly sphere mesh using bmesh (headless-compatible)
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.15)
    template_mesh = bpy.data.meshes.new("DroneMesh")
    bm.to_mesh(template_mesh)
    bm.free()

    drone_names = []
    for i in range(count):
        # Create drone object with its own mesh copy
        drone = bpy.data.objects.new(f"Drone_{i+1:03d}", template_mesh.copy())
        drone_collection.objects.link(drone)

        # Set position
        pos = start_positions[i] if i < len(start_positions) else (0, 0, 0)
        drone.location = pos

        # Create emissive material (LED simulation)
        mat = bpy.data.materials.new(f"LED_{i+1:03d}")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links

        # Clear default nodes
        for node in list(nodes):
            nodes.remove(node)

        # Add emission shader
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        emission.inputs["Strength"].default_value = 5.0

        output = nodes.new("ShaderNodeOutputMaterial")
        links.new(emission.outputs["Emission"], output.inputs["Surface"])

        drone.data.materials.append(mat)
        drone_names.append(drone.name)

    print(f"Created {count} drones: {drone_names[0]} to {drone_names[-1]}")
    return drone_names
