"""Blender startup script for DroneAI Studio.

Run as: blender --background --python blender_startup.py --addons addon

Sets up the scene and starts the MCP server.
Skips UI setup when running headless (--background).
"""
import bpy
import os
import sys


def _setup_droneai_path():
    """Ensure the droneai package is importable.

    In production builds, droneai is installed into Blender's site-packages
    by prepare-blender.sh.  In dev mode, add the resources/ directory
    (next to this startup script) to sys.path so 'import droneai' works.
    """
    try:
        import droneai  # noqa: F401 — already available
        return
    except ImportError:
        pass

    # Dev fallback: resources/ is next to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    resources_dir = os.path.join(script_dir, "resources")
    if os.path.isdir(os.path.join(resources_dir, "droneai")):
        sys.path.insert(0, resources_dir)


_setup_droneai_path()


def is_headless():
    """Return True when Blender is running with --background."""
    return bpy.app.background


def setup_minimal_ui():
    """Configure Blender to show only the 3D viewport."""
    # Set to fullscreen 3D viewport
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != 'VIEW_3D':
                area.type = 'VIEW_3D'

    # Switch to Material Preview for emissive materials
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'MATERIAL'


def setup_scene():
    """Set up a dark scene suitable for drone show preview."""
    # Dark background
    world = bpy.data.worlds.get("World")
    if world is None:
        world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.01, 0.01, 0.02, 1.0)

    # Create Drones collection if needed
    if "Drones" not in bpy.data.collections:
        drone_collection = bpy.data.collections.new("Drones")
        bpy.context.scene.collection.children.link(drone_collection)


def start_mcp_server():
    """Start the BlenderMCP server on port 9876 for the blender-mcp bridge."""
    if is_headless():
        # In --background mode bpy.ops operators lack a window context and
        # may fail.  Skip the operator path entirely and create the server
        # directly from the addon module.
        _start_mcp_server_direct()
        return

    try:
        # Enable the addon if not already enabled
        if "addon" not in bpy.context.preferences.addons:
            bpy.ops.preferences.addon_enable(module="addon")

        # Use the operator to start the server (handles instance management)
        bpy.ops.blendermcp.start_server()
        print("DroneAI Studio: MCP server started on port 9876")
    except Exception as e:
        print(f"DroneAI Studio: Failed to start MCP server via operator: {e}")
        _start_mcp_server_direct()


def _start_mcp_server_direct():
    """Start MCP server by importing the addon module directly (no operators)."""
    try:
        # --addons flag already loaded the module; try importing first.
        try:
            from addon import BlenderMCPServer
        except ImportError:
            sys.path.insert(0, bpy.utils.user_resource('SCRIPTS', path="addons"))
            from addon import BlenderMCPServer

        server = BlenderMCPServer(port=9876)
        bpy.types.blendermcp_server = server
        server.start()
        print("DroneAI Studio: MCP server started (direct) on port 9876")
    except Exception as e:
        print(f"DroneAI Studio: MCP server failed to start: {e}")


def main():
    if not is_headless():
        setup_minimal_ui()
    setup_scene()
    start_mcp_server()
    print("DroneAI Studio: Blender ready")


if is_headless():
    # In --background mode there is no GUI event loop, so bpy.app.timers
    # callbacks never fire.  The MCP addon relies on timers to run commands
    # on the "main" thread (addon.py line ~170).
    #
    # Fix: monkey-patch bpy.app.timers.register to execute callbacks
    # immediately on the calling thread.  In headless mode there is no UI
    # contention, so this is safe.
    _orig_timer_register = bpy.app.timers.register

    def _sync_timer_register(func, first_interval=0.0, persistent=False):
        try:
            func()
        except Exception as e:
            print(f"DroneAI Studio: timer callback error: {e}")

    bpy.app.timers.register = _sync_timer_register

    main()

    import time
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
else:
    # GUI mode: wait for Blender to finish initializing before touching the UI.
    bpy.app.timers.register(main, first_interval=1.0)
