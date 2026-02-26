# Replace blender-mcp with DroneAI MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the third-party `uvx blender-mcp` bridge with our own lightweight MCP server that connects to Blender's TCP:9876 addon, exposing only the tools Claude needs for drone show design.

**Architecture:** A single Python file (`mcp-server/server.py`) using FastMCP that opens a persistent TCP socket to Blender's addon on port 9876. It exposes 4 MCP tools (`execute_blender_code`, `get_scene_info`, `get_object_info`, `get_viewport_screenshot`). Claude Code spawns it as a subprocess via `mcp_config.json`.

**Tech Stack:** Python 3.11+, `mcp` (FastMCP SDK), TCP sockets, JSON

---

## Pre-requisites

- Blender 4.x with MCP addon running on TCP:9876 (existing `launch_blender` flow)
- Python 3.11+ (`python3` on PATH)
- `mcp` package installed: `pip install mcp`

**Test command:** Start app normally, type a message in chat, verify Claude can execute Blender code and viewport updates.

**Existing code to understand:**
- `droneai-studio/mcp_config.json` — current config pointing to `uvx blender-mcp`
- `droneai-studio/src-tauri/src/commands.rs` — `resolve_resource()` and `dev_resolve()` (lines 16-41) for resource path resolution
- `droneai-studio/src-tauri/src/claude_code.rs` — `ClaudeSession::start()` (lines 23-60) for how Claude Code is spawned with `--mcp-config` and `--allowedTools`
- `droneai-studio/src-tauri/tauri.conf.json` — `bundle.resources` section (lines 38-43) for production resource bundling
- Third-party server at `~/.cache/uv/archive-v0/AUz3wAjN7vhhe1htQ0zDC/blender_mcp/server.py` — reference for how tools map to TCP commands

---

### Task 1: Create the MCP server

**Files:**
- Create: `droneai-studio/mcp-server/server.py`
- Create: `droneai-studio/mcp-server/requirements.txt`

**Step 1: Create the mcp-server directory**

```bash
mkdir -p droneai-studio/mcp-server
```

**Step 2: Create requirements.txt**

```
# droneai-studio/mcp-server/requirements.txt
mcp
```

**Step 3: Install the dependency**

Run: `pip install mcp`
Expected: Successfully installed mcp and dependencies.

**Step 4: Write the MCP server**

```python
# droneai-studio/mcp-server/server.py
"""DroneAI MCP Server — lightweight bridge between Claude Code and Blender.

Connects to Blender's MCP addon on TCP:9876 and exposes tools for
executing Python code, querying scene/object info, and taking screenshots.

Usage:
    python3 server.py                    # default localhost:9876
    python3 server.py --port 9876        # explicit port
    python3 server.py --host 127.0.0.1   # explicit host
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

mcp = FastMCP("droneai-blender", description="Control Blender for drone show design")


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
    parser = argparse.ArgumentParser(description="DroneAI MCP Server")
    parser.add_argument("--host", default=BLENDER_HOST, help="Blender addon host")
    parser.add_argument("--port", type=int, default=BLENDER_PORT, help="Blender addon port")
    args = parser.parse_args()

    global BLENDER_HOST, BLENDER_PORT
    BLENDER_HOST = args.host
    BLENDER_PORT = args.port

    logger.info("Starting DroneAI MCP server (Blender at %s:%d)", BLENDER_HOST, BLENDER_PORT)
    mcp.run()


if __name__ == "__main__":
    main()
```

**Step 5: Verify the server starts (dry run)**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio && python3 mcp-server/server.py --help`
Expected: Shows argparse help text without errors.

**Step 6: Commit**

```bash
git add droneai-studio/mcp-server/
git commit -m "feat: add DroneAI MCP server to replace third-party blender-mcp"
```

---

### Task 2: Wire MCP server into the app

**Files:**
- Modify: `droneai-studio/mcp_config.json` — point to our server
- Modify: `droneai-studio/src-tauri/src/commands.rs` — add `mcp-server/server.py` to `dev_resolve()`
- Modify: `droneai-studio/src-tauri/src/claude_code.rs` — update `--allowedTools` list
- Modify: `droneai-studio/src-tauri/tauri.conf.json` — bundle mcp-server for production

**Step 1: Update mcp_config.json**

The path must be absolute at runtime. Claude Code receives the config file, so we use a placeholder that `commands.rs` will resolve to the correct absolute path.

Actually, Claude Code reads `mcp_config.json` directly from the path we pass via `--mcp-config`. The config must contain absolute paths since Claude Code resolves them itself. So we need to generate the config at runtime with the resolved path.

Change approach: instead of a static `mcp_config.json`, generate it dynamically in `commands.rs::new_chat()`.

Replace the static `mcp_config.json` with a template approach:

```json
// droneai-studio/mcp_config.json — no longer used at runtime, kept as reference
{
  "mcpServers": {
    "blender": {
      "command": "python3",
      "args": ["<resolved at runtime>"]
    }
  }
}
```

**Step 2: Modify `commands.rs` — add dev_resolve entry for mcp-server**

In `dev_resolve()` (line 32-41), add:

```rust
"mcp-server/server.py" => m.join("../mcp-server/server.py"),
```

**Step 3: Modify `commands.rs` — add new_chat_mcp_config command**

Add a helper that generates a temporary `mcp_config.json` with the resolved absolute path to our MCP server:

In `commands.rs`, we don't need a new command. Instead, modify the `new_chat()` function to generate the MCP config dynamically.

**Step 4: Modify `commands.rs::new_chat()`**

Replace the current `new_chat` function. Instead of reading `mcp_config.json` from resources, generate it with the absolute path to our MCP server script:

Current code (lines 141-158):
```rust
#[tauri::command]
pub fn new_chat(
    claude: State<'_, ClaudeState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut session = claude.lock().unwrap();

    let prompt_path = resolve_resource(&app, "system_prompt.md")?;
    let system_prompt = std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("Failed to read system prompt at {:?}: {}", prompt_path, e))?;

    let mcp_config = resolve_resource(&app, "mcp_config.json")?;
    let mcp_config_str = mcp_config.to_str()
        .ok_or("Invalid MCP config path")?;

    session.start(&system_prompt, mcp_config_str, app)
}
```

New code:
```rust
#[tauri::command]
pub fn new_chat(
    claude: State<'_, ClaudeState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut session = claude.lock().unwrap();

    let prompt_path = resolve_resource(&app, "system_prompt.md")?;
    let system_prompt = std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("Failed to read system prompt at {:?}: {}", prompt_path, e))?;

    // Generate MCP config with absolute path to our MCP server
    let server_script = resolve_resource(&app, "mcp-server/server.py")?;
    let server_path = server_script.to_str()
        .ok_or("Invalid MCP server script path")?;

    let mcp_config = serde_json::json!({
        "mcpServers": {
            "blender": {
                "command": "python3",
                "args": [server_path]
            }
        }
    });

    // Write to a temp file for Claude Code to read
    let config_dir = std::env::temp_dir().join("droneai-studio");
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    let config_path = config_dir.join("mcp_config.json");
    std::fs::write(&config_path, mcp_config.to_string())
        .map_err(|e| format!("Failed to write MCP config: {}", e))?;

    let mcp_config_str = config_path.to_str()
        .ok_or("Invalid MCP config path")?;

    session.start(&system_prompt, mcp_config_str, app)
}
```

**Step 5: Modify `claude_code.rs` — update allowedTools**

In `ClaudeSession::start()` (lines 46-50), replace `set_texture` with `get_viewport_screenshot`:

Current:
```rust
"--allowedTools",
    "mcp__blender__execute_blender_code",
    "mcp__blender__get_scene_info",
    "mcp__blender__get_object_info",
    "mcp__blender__set_texture",
```

New:
```rust
"--allowedTools",
    "mcp__blender__execute_blender_code",
    "mcp__blender__get_scene_info",
    "mcp__blender__get_object_info",
    "mcp__blender__get_viewport_screenshot",
```

**Step 6: Update tauri.conf.json — bundle mcp-server for production**

In `bundle.resources` (lines 38-43), add:

```json
"../mcp-server/": "mcp-server/"
```

**Step 7: Verify Rust compiles**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio/src-tauri && cargo check`
Expected: Compiles with no new errors (existing embed.rs warnings are fine).

**Step 8: Commit**

```bash
git add droneai-studio/mcp_config.json droneai-studio/src-tauri/src/commands.rs droneai-studio/src-tauri/src/claude_code.rs droneai-studio/src-tauri/tauri.conf.json
git commit -m "feat: wire DroneAI MCP server into app, replace uvx blender-mcp"
```

---

### Task 3: Ensure mcp pip dependency is available

The MCP server needs the `mcp` Python package. In dev mode, the system Python is used. For production, we need to ensure it's installed.

**Files:**
- Create: `droneai-studio/scripts/install-mcp-deps.sh`
- Modify: `droneai-studio/src-tauri/src/commands.rs` — add `PYTHONPATH` for mcp server if needed

**Step 1: Install mcp package**

Run: `pip install mcp`
Expected: Successfully installed.

**Step 2: Create install script for CI/production**

```bash
#!/usr/bin/env bash
# droneai-studio/scripts/install-mcp-deps.sh
# Install Python dependencies for the DroneAI MCP server.
set -euo pipefail
pip install --user mcp
```

**Step 3: Verify the server imports work**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio && python3 -c "from mcp.server.fastmcp import FastMCP; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add droneai-studio/scripts/install-mcp-deps.sh
git commit -m "chore: add MCP server dependency install script"
```

---

### Task 4: End-to-end integration test

**Files:** None (manual testing)

**Step 1: Kill any orphaned Blender processes**

Run: `pkill -f "Blender --background --addons addon" || true`

**Step 2: Start the Tauri app**

Run: `cd /Users/cinex/repo/sandbox/drone_show/studio-blender/sandbox/droneai-studio && npm run tauri dev`

**Step 3: In the app, go through the setup flow**

1. Click "Launch" for Blender — wait for "Running"
2. Click "Connect" for Claude — wait for "Connected"
3. Click "Start Designing"

**Step 4: Test chat → Blender execution**

Type in the chat: `create 5 drones in a circle formation`

Expected:
- Claude responds with a plan and executes `execute_blender_code` via MCP
- No errors in the terminal (check for `[droneai-mcp]` log lines)
- Viewport updates to show 5 drone spheres in a circle

**Step 5: Test /test command (direct TCP, should still work)**

Type: `/test`

Expected: 25-drone test show created, viewport shows formations.

**Step 6: Verify no blender-mcp process is running**

Run: `ps aux | grep blender-mcp | grep -v grep`
Expected: No output (the third-party bridge is no longer used).

**Step 7: Final commit if any adjustments were made**

```bash
git add -A
git commit -m "fix: adjustments from E2E testing of DroneAI MCP server"
```

---

### Task 5: Clean up old references

**Files:**
- Modify: `droneai-studio/mcp_config.json` — update to document the new setup
- Modify: `CLAUDE.md` — update MCP server documentation

**Step 1: Update mcp_config.json to reflect new reality**

```json
{
  "_comment": "This file is a reference only. The actual config is generated at runtime by commands.rs with resolved absolute paths.",
  "mcpServers": {
    "blender": {
      "command": "python3",
      "args": ["mcp-server/server.py"]
    }
  }
}
```

**Step 2: Update CLAUDE.md — MCP server section**

In the "Claude Code Integration" section, update to reflect the new MCP server:

Replace:
```
Claude Code is spawned with flags: `--print --system-prompt <path> --input-format stream-json --output-format stream-json --mcp-config <path> --allowedTools execute_blender_code,get_scene_info,get_object_info,set_texture`
```

With:
```
Claude Code is spawned with flags: `--print --system-prompt <path> --input-format stream-json --output-format stream-json --mcp-config <path> --allowedTools execute_blender_code,get_scene_info,get_object_info,get_viewport_screenshot`

MCP config is generated at runtime by `commands.rs::new_chat()` with the resolved absolute path to `mcp-server/server.py`.
```

Add a new section:

```
## MCP Server (droneai-studio/mcp-server/)

Our own MCP bridge replacing the third-party `blender-mcp` package. A single Python file using FastMCP that:
- Connects to Blender's TCP:9876 addon
- Exposes 4 tools: `execute_blender_code`, `get_scene_info`, `get_object_info`, `get_viewport_screenshot`
- No telemetry, no third-party asset integrations

Dependencies: `pip install mcp`
```

**Step 3: Commit**

```bash
git add droneai-studio/mcp_config.json CLAUDE.md
git commit -m "docs: update MCP server documentation after replacing blender-mcp"
```
