"""
Simple Drone Show — 3 Drones
Duration: 24 seconds (576 frames @ 24fps)
Formations: Triangle → Horizontal Line → Vertical Stack
Colors: White → Red → Blue → Green → White
"""

import bpy
import math

# ─── Configuration ───────────────────────────────────────────────────
FPS = 24
DRONE_COUNT = 3
DRONE_RADIUS = 0.15  # visual size of each drone sphere

# ─── Clear Scene ─────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Remove all existing collections except Scene Collection
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)

# Clean up orphan data
for block in bpy.data.meshes:
    if block.users == 0:
        bpy.data.meshes.remove(block)
for block in bpy.data.materials:
    if block.users == 0:
        bpy.data.materials.remove(block)

# ─── Scene Setup ─────────────────────────────────────────────────────
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start = 0
scene.frame_end = 576
scene.frame_set(0)

# Dark background for night sky
bpy.context.scene.world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
world = bpy.context.scene.world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs["Color"].default_value = (0.01, 0.01, 0.03, 1.0)

# ─── Create Drones Collection ───────────────────────────────────────
drones_collection = bpy.data.collections.new("Drones")
bpy.context.scene.collection.children.link(drones_collection)

# ─── Create Emissive Material for Each Drone ─────────────────────────
def create_drone_material(name):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in nodes:
        nodes.remove(node)

    emission = nodes.new(type='ShaderNodeEmission')
    emission.location = (0, 0)
    emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    emission.inputs["Strength"].default_value = 5.0

    output = nodes.new(type='ShaderNodeOutputMaterial')
    output.location = (200, 0)

    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return mat, emission

# ─── Create Drone Objects ────────────────────────────────────────────
drones = []
materials = []
emission_nodes = []

for i in range(DRONE_COUNT):
    name = f"Drone_{i+1:03d}"
    bpy.ops.mesh.primitive_uv_sphere_add(radius=DRONE_RADIUS, location=(0, 0, 0))
    drone = bpy.context.active_object
    drone.name = name

    for col in drone.users_collection:
        col.objects.unlink(drone)
    drones_collection.objects.link(drone)

    mat, emission = create_drone_material(f"LED_{name}")
    drone.data.materials.append(mat)

    drones.append(drone)
    materials.append(mat)
    emission_nodes.append(emission)

print(f"Created {DRONE_COUNT} drones")

# ─── Formation Definitions ───────────────────────────────────────────

# Ground: line on the ground, 3m spacing
GROUND = [
    (-3.0, 0.0, 0.0),
    ( 0.0, 0.0, 0.0),
    ( 3.0, 0.0, 0.0),
]

# Triangle at 10m altitude (equilateral, ~6m sides)
TRIANGLE = [
    ( 0.0,  2.0, 10.0),   # top
    (-3.0, -1.5, 10.0),   # bottom-left
    ( 3.0, -1.5, 10.0),   # bottom-right
]

# Horizontal line at 12m altitude, 4m spacing
LINE = [
    (-4.0, 0.0, 12.0),
    ( 0.0, 0.0, 12.0),
    ( 4.0, 0.0, 12.0),
]

# Vertical stack, 4m spacing, 10m–18m
STACK = [
    (0.0, 0.0, 10.0),
    (0.0, 0.0, 14.0),
    (0.0, 0.0, 18.0),
]

# ─── Color Definitions (R, G, B, A) ─────────────────────────────────
WHITE  = (1.0, 1.0, 1.0, 1.0)
RED    = (1.0, 0.1, 0.1, 1.0)
BLUE   = (0.1, 0.3, 1.0, 1.0)
GREEN  = (0.1, 1.0, 0.3, 1.0)

# ─── Keyframe Helpers ────────────────────────────────────────────────
def set_position(drone_idx, frame, position):
    drone = drones[drone_idx]
    drone.location = position
    drone.keyframe_insert(data_path="location", frame=frame)

def set_color(drone_idx, frame, color):
    emission = emission_nodes[drone_idx]
    emission.inputs["Color"].default_value = color
    emission.inputs["Color"].keyframe_insert(data_path="default_value", frame=frame)

def set_formation(frame, positions):
    for i, pos in enumerate(positions):
        set_position(i, frame, pos)

def set_all_colors(frame, color):
    for i in range(DRONE_COUNT):
        set_color(i, frame, color)

# ─── Animate the Show ────────────────────────────────────────────────
# ┌──────────────────────────────────────────────────────────────────┐
# │ Timeline (24 seconds @ 24fps = 576 frames)                      │
# │                                                                  │
# │ 0s     3s      7s     10s     14s     17s     21s     24s       │
# │ |------|--------|-------|--------|-------|--------|------|       │
# │ takeoff  TRIANGLE  trans   LINE    trans   STACK   land         │
# │ f0  f72  f168  f240  f336  f408  f504  f576                     │
# └──────────────────────────────────────────────────────────────────┘

# Phase 1: Ground (frame 0)
set_formation(0, GROUND)
set_all_colors(0, WHITE)

# Phase 2: Takeoff → Triangle (0→72, 0s–3s)
set_formation(72, TRIANGLE)
set_all_colors(48, WHITE)
set_all_colors(72, RED)

# Phase 3: Hold Triangle (72→168, 3s–7s)
set_formation(168, TRIANGLE)
set_all_colors(168, RED)

# Phase 4: Transition → Line (168→240, 7s–10s)
set_formation(240, LINE)
set_all_colors(216, RED)
set_all_colors(240, BLUE)

# Phase 5: Hold Line (240→336, 10s–14s)
set_formation(336, LINE)
set_all_colors(336, BLUE)

# Phase 6: Transition → Stack (336→408, 14s–17s)
set_formation(408, STACK)
set_all_colors(384, BLUE)
set_all_colors(408, GREEN)

# Phase 7: Hold Stack (408→504, 17s–21s)
set_formation(504, STACK)
set_all_colors(504, GREEN)

# Phase 8: Landing (504→576, 21s–24s)
set_formation(576, GROUND)
set_all_colors(552, GREEN)
set_all_colors(576, WHITE)

# ─── Smooth Bezier Interpolation ────────────────────────────────────
for drone in drones:
    if drone.animation_data and drone.animation_data.action:
        for fcurve in drone.animation_data.action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.interpolation = 'BEZIER'
                kp.handle_left_type = 'AUTO_CLAMPED'
                kp.handle_right_type = 'AUTO_CLAMPED'

for mat in materials:
    if mat.node_tree.animation_data and mat.node_tree.animation_data.action:
        for fcurve in mat.node_tree.animation_data.action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.interpolation = 'BEZIER'
                kp.handle_left_type = 'AUTO_CLAMPED'
                kp.handle_right_type = 'AUTO_CLAMPED'

# ─── Safety Validation ───────────────────────────────────────────────
def validate_spacing(name, positions, min_spacing=2.0):
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            dx = positions[i][0] - positions[j][0]
            dy = positions[i][1] - positions[j][1]
            dz = positions[i][2] - positions[j][2]
            dist = math.sqrt(dx*dx + dy*dy + dz*dz)
            if dist < min_spacing:
                print(f"  WARNING: {name} Drone {i+1}<>{j+1} = {dist:.1f}m < {min_spacing}m")
                return False
    return True

def validate_altitude(name, positions, max_alt=120.0):
    max_z = max(p[2] for p in positions)
    return max_z <= max_alt

print("\n--- Safety Validation ---")
all_ok = True
for name, pos in [("Ground", GROUND), ("Triangle", TRIANGLE),
                   ("Line", LINE), ("Stack", STACK)]:
    spacing_ok = validate_spacing(name, pos)
    alt_ok = validate_altitude(name, pos)
    status = "PASS" if (spacing_ok and alt_ok) else "FAIL"
    print(f"  {name}: {status}")
    all_ok &= spacing_ok and alt_ok

print(f"\n{'All safety checks passed!' if all_ok else 'Safety violations detected!'}")

# ─── Camera for Preview ─────────────────────────────────────────────
bpy.ops.object.camera_add(location=(0, -30, 15))
camera = bpy.context.active_object
camera.name = "ShowCamera"
camera.rotation_euler = (math.radians(65), 0, 0)
scene.camera = camera

# Ground plane
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.01))
ground = bpy.context.active_object
ground.name = "Ground"
ground_mat = bpy.data.materials.new("GroundMat")
ground_mat.use_nodes = True
ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1.0)
ground.data.materials.append(ground_mat)

# ─── Summary ─────────────────────────────────────────────────────────
print("\n=== DRONE SHOW READY ===")
print(f"  Drones:       {DRONE_COUNT}")
print(f"  Duration:     24s (576 frames @ 24fps)")
print(f"  Formations:   Triangle -> Line -> Vertical Stack")
print(f"  Colors:       White -> Red -> Blue -> Green -> White")
print(f"  Max altitude: 18m")
print(f"  Min spacing:  3.0m")
print("  Press Play to preview!")
