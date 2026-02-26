"""Create drone objects in Blender scene.

Execute in Blender via MCP execute_blender_code.
Creates N drone objects as small spheres with emissive materials.
"""
import bpy
import mathutils


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
    import math

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

    # Create a shared mesh for all drones (small sphere)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, segments=8, ring_count=6)
    template = bpy.context.active_object
    template_mesh = template.data
    bpy.data.objects.remove(template, do_unlink=True)

    drone_names = []
    for i in range(count):
        # Create drone object
        drone = bpy.data.objects.new(f"Drone_{i+1:03d}", template_mesh.copy())
        drone_collection.objects.link(drone)

        # Set position
        pos = start_positions[i] if i < len(start_positions) else (0, 0, 0)
        drone.location = mathutils.Vector(pos)

        # Create emissive material (LED simulation)
        mat = bpy.data.materials.new(f"LED_{i+1:03d}")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links

        # Clear default nodes
        for node in nodes:
            nodes.remove(node)

        # Add emission shader
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)  # white default
        emission.inputs["Strength"].default_value = 5.0

        output = nodes.new("ShaderNodeOutputMaterial")
        links.new(emission.outputs["Emission"], output.inputs["Surface"])

        drone.data.materials.append(mat)
        drone_names.append(drone.name)

    print(f"Created {count} drones: {drone_names[0]} to {drone_names[-1]}")
    return drone_names


# Execute (only when run as standalone script, not on import)
if __name__ == "__main__":
    create_drones(count=50)
