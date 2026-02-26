# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp"]
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

# Preamble injected into every execute_blender_code call to ensure
# `import droneai` works. Blender's embedded Python often ignores PYTHONPATH.
# Also clears cached droneai modules so re-imports use this path, not a
# stale version loaded by the Blender startup script.
_SYS_PATH_PREAMBLE = (
    f"import sys as __sys; "
    f"__p = r'{_RESOURCES_DIR}'; "
    f"__p in __sys.path and __sys.path.remove(__p); "
    f"__sys.path.insert(0, __p); "
    f"[__sys.modules.pop(__k, None) for __k in list(__sys.modules) if __k == 'droneai' or __k.startswith('droneai.')]\n"
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


# --- Show state (persisted in memory for the session) ---
_current_spec: dict | None = None
_current_build_result_json: str | None = None


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
                        "formation": {"type": "parametric", "shape": "grid", "params": {...}}
                                  or {"type": "positions", "positions": [[x,y,z], ...]},
                        "color": {"type": "solid", "value": [r,g,b]}
                              or {"type": "gradient", "start": [r,g,b], "end": [r,g,b], "axis": "x"},
                        "transition": {"easing": "ease_in_out"} (optional, absent on first entry)
                    }
                ]
            }
    """
    global _current_spec, _current_build_result_json
    try:
        import json as _json
        import base64

        # Parse and validate spec (basic check before sending to Blender)
        spec_dict = _json.loads(spec)

        # Encode the spec as base64 to avoid string escaping issues
        spec_b64 = base64.b64encode(spec.encode()).decode()

        # Build + validate + render inside Blender where droneai is available
        build_code = _SYS_PATH_PREAMBLE + f"""
import json
import base64
import traceback

try:
    spec_json = base64.b64decode('{spec_b64}').decode()

    from droneai.engine.show_spec import ShowSpec
    from droneai.engine.show_builder import ShowBuilder
    from droneai.engine.show_renderer import render_to_blender

    spec = ShowSpec.from_json(spec_json)
    builder = ShowBuilder()
    result = builder.build(spec)

    if not result.is_safe:
        violations = "; ".join(result.safety_report.violations[:10])
        print(json.dumps({{"safe": False, "violations": violations}}))
    else:
        summary = render_to_blender(result)
        report = {{
            "safe": True,
            "summary": summary,
            "min_spacing": round(result.safety_report.min_spacing_found, 2),
            "max_velocity": round(result.safety_report.max_velocity_found, 2),
            "max_altitude": round(result.safety_report.max_altitude_found, 2),
        }}
        print(json.dumps(report))
except Exception as __e:
    print(json.dumps({{"safe": False, "error": str(__e), "traceback": traceback.format_exc()}}))
"""
        resp = _send_command("execute_code", {"code": build_code})

        if resp.get("status") == "error":
            return f"Error: {resp.get('message', 'Unknown error')}"

        result_str = resp.get("result", {}).get("result", "")
        if not result_str.strip():
            return f"Error: No output from build pipeline. Response: {resp}"

        result_data = _json.loads(result_str.strip())

        if result_data.get("error"):
            return f"Error in Blender: {result_data['error']}\n\nTraceback:\n{result_data.get('traceback', 'N/A')}"

        if not result_data.get("safe"):
            return f"Safety validation FAILED:\n{result_data.get('violations', 'Unknown')}\n\nAdjust the spec and try again."

        # Store spec for update_show
        _current_spec = spec_dict
        _current_build_result_json = result_str.strip()

        report = result_data
        return (
            f"Show built successfully!\n\n"
            f"{report.get('summary', '')}\n\n"
            f"Safety report:\n"
            f"  Min spacing: {report.get('min_spacing', '?')}m (safe >= 2.0m)\n"
            f"  Max velocity: {report.get('max_velocity', '?')} m/s (safe <= 8.0 m/s)\n"
            f"  Max altitude: {report.get('max_altitude', '?')}m (safe <= 120m)"
        )

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
        import json as _json
        import copy

        changes_data = _json.loads(changes)
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
        return build_show(_json.dumps(spec))

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
