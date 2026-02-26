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


@mcp.tool()
def execute_blender_code(code: str) -> str:
    """Execute Python code in Blender. Use this to create drones, set formations,
    animate transitions, and program LED colors.

    Parameters:
        code: Python code to execute in Blender's environment (has access to bpy)
    """
    try:
        resp = _send_command("execute_code", {"code": code})
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
