# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp", "scipy"]
# ///
"""DroneAI MCP Server — lightweight bridge between Claude Code and Blender.

Connects to Blender's MCP addon on TCP:9876 and exposes tools for
executing Python code, querying scene/object info, and taking screenshots.

Usage:
    uv run server.py                     # default localhost:9876
    uv run server.py --port 9876         # explicit port
    uv run server.py --host 127.0.0.1    # explicit host
"""
import socket
import json
import sys
import os
import logging
import tempfile
import argparse
from mcp.server.fastmcp import FastMCP, Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("droneai-mcp")

# ---------------------------------------------------------------------------
# Blender TCP connection
# ---------------------------------------------------------------------------

BLENDER_HOST = os.environ.get("BLENDER_MCP_HOST", "localhost")
BLENDER_PORT = int(os.environ.get("BLENDER_MCP_PORT", "9876"))

_sock: socket.socket | None = None


def _connect() -> socket.socket:
    """Return a connected socket to Blender, reconnecting if needed."""
    global _sock
    if _sock is not None:
        return _sock
    _sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    _sock.connect((BLENDER_HOST, BLENDER_PORT))
    _sock.settimeout(180.0)
    logger.info("Connected to Blender at %s:%d", BLENDER_HOST, BLENDER_PORT)
    return _sock


def _disconnect():
    global _sock
    if _sock:
        try:
            _sock.close()
        except OSError:
            pass
        _sock = None


def _send_command(command_type: str, params: dict | None = None) -> dict:
    """Send a JSON command to Blender and return the parsed response."""
    payload = json.dumps({"type": command_type, "params": params or {}})

    for attempt in range(2):
        try:
            sock = _connect()
            sock.sendall(payload.encode())

            # Accumulate chunks until we have valid JSON
            chunks: list[bytes] = []
            while True:
                chunk = sock.recv(8192)
                if not chunk:
                    break
                chunks.append(chunk)
                try:
                    return json.loads(b"".join(chunks))
                except json.JSONDecodeError:
                    continue

            # Try final parse with everything we got
            data = b"".join(chunks)
            if data:
                return json.loads(data)
            raise ConnectionError("No data received")

        except (ConnectionError, BrokenPipeError, OSError, json.JSONDecodeError) as exc:
            logger.warning("Attempt %d failed: %s", attempt + 1, exc)
            _disconnect()
            if attempt == 1:
                raise

    raise ConnectionError("Failed to communicate with Blender")


# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------

mcp = FastMCP("droneai-blender", instructions="Control Blender for drone show design")

# Derive droneai library path from this script's location.
# server.py is in mcp-server/, droneai is in resources/droneai,
# so the parent containing droneai is ../resources/ relative to mcp-server/.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_RESOURCES_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "resources"))

# Make droneai importable in the MCP server process itself.
# The engine is pure Python (no Blender dependency) — it runs here, not in Blender.
sys.path.insert(0, _RESOURCES_DIR)
from droneai.engine.show_spec import ShowSpec  # noqa: E402
from droneai.engine.show_builder import ShowBuilder, BuildResult  # noqa: E402

# Preamble injected into every execute_blender_code call to ensure
# `import droneai` works. Blender's embedded Python often ignores PYTHONPATH.
_SYS_PATH_PREAMBLE = (
    f"import sys as __sys; "
    f"__p = r'{_RESOURCES_DIR}'; "
    f"__p in __sys.path or __sys.path.insert(0, __p)\n"
)


@mcp.tool()
def execute_blender_code(code: str) -> str:
    """Execute Python code in Blender. Use this to create drones, set formations,
    animate transitions, and program LED colors.

    Parameters:
        code: Python code to execute in Blender's environment (has access to bpy)
    """
    try:
        resp = _send_command("execute_code", {"code": _SYS_PATH_PREAMBLE + code})
        if resp.get("status") == "error":
            return f"Error: {resp.get('message', 'Unknown error')}"
        result = resp.get("result", {})
        if isinstance(result, dict):
            return f"Code executed successfully: {result.get('result', '')}"
        return f"Code executed successfully: {result}"
    except Exception as e:
        return f"Error executing code: {e}"


@mcp.tool()
def get_scene_info() -> str:
    """Get information about the current Blender scene including objects,
    collections, frame range, and render settings."""
    try:
        resp = _send_command("get_scene_info")
        result = resp.get("result", resp)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"Error getting scene info: {e}"


@mcp.tool()
def get_object_info(object_name: str) -> str:
    """Get detailed information about a specific Blender object.

    Parameters:
        object_name: Name of the object (e.g. "Drone_001")
    """
    try:
        resp = _send_command("get_object_info", {"name": object_name})
        result = resp.get("result", resp)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"Error getting object info: {e}"


@mcp.tool()
def get_viewport_screenshot(max_size: int = 800) -> Image:
    """Capture a screenshot of the Blender 3D viewport.

    Parameters:
        max_size: Maximum dimension in pixels (default 800)
    """
    temp_path = os.path.join(tempfile.gettempdir(), f"droneai_screenshot_{os.getpid()}.png")
    try:
        resp = _send_command("get_viewport_screenshot", {
            "max_size": max_size,
            "filepath": temp_path,
            "format": "png",
        })
        if resp.get("status") == "error":
            raise Exception(resp.get("message", "Screenshot failed"))

        if not os.path.exists(temp_path):
            raise FileNotFoundError("Screenshot file was not created")

        with open(temp_path, "rb") as f:
            data = f.read()
        os.remove(temp_path)
        return Image(data=data, format="png")
    except Exception as e:
        raise Exception(f"Screenshot failed: {e}")


# ---------------------------------------------------------------------------
# Blender rendering script template
# ---------------------------------------------------------------------------
# This script runs inside Blender's Python. It reads show data from a _DATA
# dict that is embedded at the top by _generate_blender_script(). It uses
# ONLY bpy/bmesh — zero droneai imports, so there are no path or dependency
# issues in Blender's environment.

_RENDER_SCRIPT_BODY = '''
fps = _DATA["fps"]
drone_count = _DATA["drone_count"]
formations = _DATA["formations"]
frames = _DATA["frames"]
hold_frames = _DATA.get("hold_frames", frames)
colors = _DATA["colors"]
easings = _DATA["easings"]

# --- Clear scene ---
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for block in list(bpy.data.meshes):
    if block.users == 0:
        bpy.data.meshes.remove(block)
for block in list(bpy.data.materials):
    if block.users == 0:
        bpy.data.materials.remove(block)

scene = bpy.context.scene
scene.render.fps = fps
scene.frame_start = 0
scene.frame_end = frames[-1]
scene.frame_current = 0

# Dark background
world = bpy.data.worlds.get("World")
if world is None:
    world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get("Background")
if bg_node:
    bg_node.inputs[0].default_value = (0.01, 0.01, 0.02, 1.0)

# Ground plane (mesh API, no bpy.ops)
gnd_mesh = bpy.data.meshes.new("Ground_Mesh")
gnd_mesh.from_pydata(
    [(-50, -50, 0), (50, -50, 0), (50, 50, 0), (-50, 50, 0)], [], [(0, 1, 2, 3)]
)
gnd_obj = bpy.data.objects.new("Ground", gnd_mesh)
scene.collection.objects.link(gnd_obj)
gnd_mat = bpy.data.materials.new("Ground_Material")
gnd_mat.diffuse_color = (0.1, 0.15, 0.1, 1.0)
gnd_obj.data.materials.append(gnd_mat)

# --- Create drones ---
drone_coll = bpy.data.collections.new("Drones")
scene.collection.children.link(drone_coll)

# Shared sphere mesh via bmesh (no bpy.ops needed)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.15)
template_mesh = bpy.data.meshes.new("Drone_Mesh")
bm.to_mesh(template_mesh)
bm.free()

drone_objs = []
for i in range(drone_count):
    name = f"Drone_{i + 1:03d}"
    obj = bpy.data.objects.new(name, template_mesh.copy())
    drone_coll.objects.link(obj)
    p = formations[0][i]
    obj.location = (p[0], p[1], p[2])

    # Emissive material (LED)
    mat = bpy.data.materials.new(f"LED_{i + 1:03d}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    em.inputs["Strength"].default_value = 5.0
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(em.outputs["Emission"], out.inputs["Surface"])
    obj.data.materials.append(mat)
    drone_objs.append(obj)

# --- Keyframe positions & colors ---
for entry_idx in range(len(formations)):
    pos_list = formations[entry_idx]
    frame = frames[entry_idx]
    color_spec = colors[entry_idx]

    # Keyframe positions
    for di, drone in enumerate(drone_objs):
        p = pos_list[di]
        drone.location = (p[0], p[1], p[2])
        drone.keyframe_insert(data_path="location", frame=frame)

    # Hold keyframe: duplicate positions at hold_frame to freeze drones
    hf = hold_frames[entry_idx]
    if hf > frame:
        for di, drone in enumerate(drone_objs):
            p = pos_list[di]
            drone.location = (p[0], p[1], p[2])
            drone.keyframe_insert(data_path="location", frame=hf)

    # Keyframe colors
    if color_spec["type"] == "solid":
        c = color_spec["value"]
        for drone in drone_objs:
            for node in drone.data.materials[0].node_tree.nodes:
                if node.type == "EMISSION":
                    node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                    node.inputs["Color"].keyframe_insert(
                        data_path="default_value", frame=frame
                    )
                    break

    elif color_spec["type"] == "gradient":
        ax = {"x": 0, "y": 1, "z": 2}[color_spec.get("axis", "x")]
        sc, ec = color_spec["start"], color_spec["end"]
        vals = [pos_list[j][ax] for j in range(len(drone_objs))]
        lo, hi = min(vals), max(vals)
        span = hi - lo if hi > lo else 1.0
        for di, drone in enumerate(drone_objs):
            t = (pos_list[di][ax] - lo) / span
            c = (
                sc[0] + t * (ec[0] - sc[0]),
                sc[1] + t * (ec[1] - sc[1]),
                sc[2] + t * (ec[2] - sc[2]),
            )
            for node in drone.data.materials[0].node_tree.nodes:
                if node.type == "EMISSION":
                    node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                    node.inputs["Color"].keyframe_insert(
                        data_path="default_value", frame=frame
                    )
                    break

    elif color_spec["type"] == "program":
        for seq in color_spec["sequences"]:
            # Resolve drone targets
            target = seq["drones"]
            if target == "all":
                indices = list(range(len(drone_objs)))
            elif isinstance(target, list) and len(target) > 0 and isinstance(target[0], int):
                indices = target
            elif isinstance(target, dict) and "range" in target:
                r = target["range"]
                indices = list(range(r[0], min(r[1] + 1, len(drone_objs))))
            else:
                indices = list(range(len(drone_objs)))

            # Insert per-drone keyframes
            for kf in seq["keyframes"]:
                kf_frame = frame + int(kf["t"] * fps)
                c = kf["color"]
                for di in indices:
                    if di < len(drone_objs):
                        drone = drone_objs[di]
                        for node in drone.data.materials[0].node_tree.nodes:
                            if node.type == "EMISSION":
                                node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                                node.inputs["Color"].keyframe_insert(
                                    data_path="default_value", frame=kf_frame
                                )
                                break

    # Hold keyframe for color: duplicate last color at hold_frame to prevent
    # premature interpolation during position holds
    hf = hold_frames[entry_idx]
    if hf > frame:
        if color_spec["type"] == "solid":
            c = color_spec["value"]
            for drone in drone_objs:
                for node in drone.data.materials[0].node_tree.nodes:
                    if node.type == "EMISSION":
                        node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                        node.inputs["Color"].keyframe_insert(
                            data_path="default_value", frame=hf
                        )
                        break
        elif color_spec["type"] == "gradient":
            ax = {"x": 0, "y": 1, "z": 2}[color_spec.get("axis", "x")]
            sc, ec = color_spec["start"], color_spec["end"]
            vals = [pos_list[j][ax] for j in range(len(drone_objs))]
            lo, hi = min(vals), max(vals)
            span = hi - lo if hi > lo else 1.0
            for di, drone in enumerate(drone_objs):
                t = (pos_list[di][ax] - lo) / span
                c = (
                    sc[0] + t * (ec[0] - sc[0]),
                    sc[1] + t * (ec[1] - sc[1]),
                    sc[2] + t * (ec[2] - sc[2]),
                )
                for node in drone.data.materials[0].node_tree.nodes:
                    if node.type == "EMISSION":
                        node.inputs["Color"].default_value = (c[0], c[1], c[2], 1.0)
                        node.inputs["Color"].keyframe_insert(
                            data_path="default_value", frame=hf
                        )
                        break
        elif color_spec["type"] == "program":
            # For program, the last keyframe in each sequence serves as the hold value.
            # Insert it at hold_frame to freeze the final state.
            for seq in color_spec["sequences"]:
                target = seq["drones"]
                if target == "all":
                    indices = list(range(len(drone_objs)))
                elif isinstance(target, list) and len(target) > 0 and isinstance(target[0], int):
                    indices = target
                elif isinstance(target, dict) and "range" in target:
                    r = target["range"]
                    indices = list(range(r[0], min(r[1] + 1, len(drone_objs))))
                else:
                    indices = list(range(len(drone_objs)))

                if seq["keyframes"]:
                    last_c = seq["keyframes"][-1]["color"]
                    for di in indices:
                        if di < len(drone_objs):
                            drone = drone_objs[di]
                            for node in drone.data.materials[0].node_tree.nodes:
                                if node.type == "EMISSION":
                                    node.inputs["Color"].default_value = (last_c[0], last_c[1], last_c[2], 1.0)
                                    node.inputs["Color"].keyframe_insert(
                                        data_path="default_value", frame=hf
                                    )
                                    break

# --- Transition interpolation ---
interp_map = {
    "LINEAR": "LINEAR",
    "EASE_IN_OUT": "BEZIER",
    "EASE_IN": "BEZIER",
    "EASE_OUT": "BEZIER",
}
for i in range(len(easings)):
    easing = easings[i]
    # Transition starts after hold ends (hold_frames[i]), arrives at frames[i+1]
    f_start = hold_frames[i]
    f_end = frames[i + 1]
    interp = interp_map.get(easing, "BEZIER")
    for drone in drone_objs:
        if not drone.animation_data or not drone.animation_data.action:
            continue
        for fcurve in drone.animation_data.action.fcurves:
            if fcurve.data_path != "location":
                continue
            for kp in fcurve.keyframe_points:
                if f_start <= kp.co[0] <= f_end:
                    kp.interpolation = interp
                    if easing == "EASE_IN_OUT":
                        kp.easing = "AUTO"
                    elif easing == "EASE_IN":
                        kp.easing = "EASE_IN"
                    elif easing == "EASE_OUT":
                        kp.easing = "EASE_OUT"

scene.frame_set(0)
summary = (
    f"Show rendered: {drone_count} drones, "
    f"{len(formations)} formations, "
    f"{frames[-1]} frames ({frames[-1] / fps:.1f}s)"
)
print(json.dumps({"status": "ok", "summary": summary}))
'''


def _generate_blender_script(result: BuildResult) -> str:
    """Generate a self-contained bpy script from a BuildResult.

    All show data is embedded as Python literals — zero droneai imports
    in Blender. This eliminates all path/dependency issues.
    """
    spec = result.spec

    # Round positions to 4 decimals to keep the script compact
    formations_data = [
        [tuple(round(c, 4) for c in pos) for pos in formation]
        for formation in result.formations
    ]

    color_data = [entry.color.to_dict() for entry in spec.timeline]

    easings = []
    for i in range(1, len(spec.timeline)):
        entry = spec.timeline[i]
        easings.append(
            entry.transition.easing.upper().replace("-", "_")
            if entry.transition
            else "EASE_IN_OUT"
        )

    data_dict = {
        "fps": spec.fps,
        "drone_count": spec.drone_count,
        "formations": formations_data,
        "frames": result.frames,
        "hold_frames": result.hold_frames,
        "colors": color_data,
        "easings": easings,
    }

    script = "import bpy, json, bmesh\n"
    script += f"_DATA = {repr(data_dict)}\n"
    script += _RENDER_SCRIPT_BODY
    return script


# --- Show state (persisted in memory for the session) ---
_current_spec: dict | None = None


@mcp.tool()
def build_show(spec: str) -> str:
    """Build a drone show from a declarative spec. The spec describes formations,
    timing, and colors. The engine validates safety before rendering to Blender.

    Parameters:
        spec: JSON string with the show spec. Format:
            {
                "drone_count": int,
                "fps": int (default 24),
                "timeline": [
                    {
                        "time": float (seconds),
                        "hold": float (seconds, optional, default 0) — hold formation before transitioning,
                        "formation": {"type": "parametric", "shape": "grid", "params": {...}}
                                  or {"type": "positions", "positions": [[x,y,z], ...]},
                        "color": {"type": "solid", "value": [r,g,b]}
                              or {"type": "gradient", "start": [r,g,b], "end": [r,g,b], "axis": "x"},
                        "transition": {"easing": "ease_in_out"} (optional, absent on first entry)
                    }
                ]
            }
    """
    global _current_spec
    try:
        # 1. Parse and validate spec locally (in MCP server process)
        spec_dict = json.loads(spec)
        show_spec = ShowSpec.from_dict(spec_dict)

        # 2. Run the build pipeline locally (pure Python, no Blender needed)
        builder = ShowBuilder()
        result = builder.build(show_spec)

        safety_warning = ""
        if not result.is_safe:
            safety_warning = (
                f"\n\nSafety warnings ({len(result.safety_report.violations)} issues):\n"
                f"  Min spacing found: {round(result.safety_report.min_spacing_found, 2)}m (target >= 2.0m)\n"
                f"  These are transition-path warnings and may be acceptable for preview."
            )

        # 3. Generate a self-contained bpy script with embedded data
        blender_script = _generate_blender_script(result)

        # 4. Send ONLY the rendering script to Blender (no droneai imports)
        resp = _send_command("execute_code", {"code": blender_script})

        if resp.get("status") == "error":
            return f"Error rendering in Blender: {resp.get('message', 'Unknown error')}"

        # Check for errors in Blender's output
        result_str = resp.get("result", {}).get("result", "")
        if result_str.strip():
            try:
                render_result = json.loads(result_str.strip())
                if render_result.get("status") == "error":
                    return (
                        f"Error rendering in Blender: {render_result.get('message', 'Unknown')}\n\n"
                        f"Traceback:\n{render_result.get('traceback', 'N/A')}"
                    )
            except json.JSONDecodeError:
                pass  # Non-JSON output is fine

        # 5. Store spec for update_show + persist in Blender for timeline
        _current_spec = spec_dict

        # Store spec and safety in Blender scene for get_show_info extraction
        show_info_data = {
            "spec": spec_dict,
            "safety": {
                "is_safe": result.is_safe,
                "min_spacing_found": round(result.safety_report.min_spacing_found, 2),
                "max_velocity_found": round(result.safety_report.max_velocity_found, 2),
                "max_altitude_found": round(result.safety_report.max_altitude_found, 2),
                "violations": len(result.safety_report.violations),
            },
        }
        show_info_json = json.dumps(show_info_data)
        store_code = (
            "import bpy\n"
            f"bpy.context.scene['droneai_show_info'] = {repr(show_info_json)}"
        )
        try:
            _send_command("execute_code", {"code": store_code})
        except Exception:
            pass  # Non-critical — timeline just won't populate

        return (
            f"Show built successfully!\n\n"
            f"Show rendered: {show_spec.drone_count} drones, "
            f"{len(show_spec.timeline)} formations, "
            f"{result.frames[-1]} frames ({result.frames[-1] / show_spec.fps:.1f}s)\n\n"
            f"Safety report:\n"
            f"  Min spacing: {round(result.safety_report.min_spacing_found, 2)}m (safe >= 2.0m)\n"
            f"  Max velocity: {round(result.safety_report.max_velocity_found, 2)} m/s (safe <= 8.0 m/s)\n"
            f"  Max altitude: {round(result.safety_report.max_altitude_found, 2)}m (safe <= 120m)"
            f"{safety_warning}"
        )

    except ValueError as e:
        return f"Invalid spec: {e}"
    except Exception as e:
        return f"Error building show: {e}"


@mcp.tool()
def update_show(changes: str) -> str:
    """Update the current show by patching the spec and re-rendering.

    Parameters:
        changes: JSON string with changes to apply:
            {
                "changes": [
                    {"action": "update", "index": 0, "formation": {...}, "color": {...}},
                    {"action": "add", "time": 5, "formation": {...}, "color": {...}},
                    {"action": "remove", "index": 2}
                ]
            }
            Fields in "update" are merged — only specified fields change.
    """
    global _current_spec
    if _current_spec is None:
        return "Error: No current show. Use build_show first."

    try:
        import copy

        changes_data = json.loads(changes)
        spec = copy.deepcopy(_current_spec)
        timeline = spec["timeline"]

        for change in changes_data.get("changes", []):
            action = change["action"]

            if action == "remove":
                idx = change["index"]
                if 0 <= idx < len(timeline):
                    timeline.pop(idx)

            elif action == "update":
                idx = change["index"]
                if 0 <= idx < len(timeline):
                    entry = timeline[idx]
                    if "formation" in change:
                        entry["formation"].update(change["formation"])
                    if "color" in change:
                        entry["color"].update(change["color"])
                    if "time" in change:
                        entry["time"] = change["time"]
                    if "transition" in change:
                        entry["transition"] = change["transition"]

            elif action == "add":
                new_entry = {
                    "time": change["time"],
                    "formation": change["formation"],
                    "color": change["color"],
                }
                if "transition" in change:
                    new_entry["transition"] = change["transition"]
                else:
                    new_entry["transition"] = {"easing": "ease_in_out"}
                timeline.append(new_entry)
                timeline.sort(key=lambda e: e["time"])

        # Re-build with patched spec
        return build_show(json.dumps(spec))

    except Exception as e:
        return f"Error updating show: {e}"


def main():
    global BLENDER_HOST, BLENDER_PORT

    parser = argparse.ArgumentParser(description="DroneAI MCP Server")
    parser.add_argument("--host", default=BLENDER_HOST, help="Blender addon host")
    parser.add_argument("--port", type=int, default=BLENDER_PORT, help="Blender addon port")
    args = parser.parse_args()

    BLENDER_HOST = args.host
    BLENDER_PORT = args.port

    logger.info("Starting DroneAI MCP server (Blender at %s:%d)", BLENDER_HOST, BLENDER_PORT)
    mcp.run()


if __name__ == "__main__":
    main()
