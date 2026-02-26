# Replace blender-mcp with DroneAI MCP Server

## Problem

The app uses `uvx blender-mcp` (third-party) as a bridge between Claude Code and Blender's TCP:9876 addon. This package:
- Includes 22+ tools we don't use (PolyHaven, Sketchfab, Hyper3D, Hunyuan3D)
- Sends telemetry
- Is ~1100 lines for what amounts to 4 thin wrappers around `send_command(type, params)` → TCP:9876

We use exactly 4 tools: `execute_blender_code`, `get_scene_info`, `get_object_info`, `set_texture`.

## Solution

Write our own MCP server (~100 lines) using the `mcp` Python package (FastMCP). Same architecture — Claude Code spawns it as a subprocess, it connects to TCP:9876, exposes only the tools we need.

## Architecture (unchanged)

```
Claude Code ←(MCP stdio)→ droneai-mcp-server.py ←(raw JSON TCP:9876)→ Blender addon
```

The only change is swapping `uvx blender-mcp` for our own script in `mcp_config.json`.

## MCP Server: `droneai-studio/mcp-server/server.py`

### Tools to implement

Each tool connects to TCP:9876, sends a JSON command, returns the result.

| Tool | TCP Command | Params | Returns |
|------|------------|--------|---------|
| `execute_blender_code` | `execute_code` | `{code: str}` | Execution result string |
| `get_scene_info` | `get_scene_info` | none | JSON scene data |
| `get_object_info` | `get_object_info` | `{name: str}` | JSON object data |
| `get_viewport_screenshot` | `get_viewport_screenshot` | `{max_size, filepath, format}` | PNG image |

Note: Dropping `set_texture` — it's PolyHaven-specific. Claude can set textures via `execute_blender_code`. Adding `get_viewport_screenshot` since Claude uses it for visual verification.

### BlenderConnection class

Persistent TCP socket to localhost:9876. Sends raw JSON, accumulates response until valid JSON. Reconnects on failure. Copied from the pattern in `commands.rs` (which already does the same thing from Rust).

### Configuration

```json
// mcp_config.json
{
  "mcpServers": {
    "blender": {
      "command": "python3",
      "args": ["/path/to/mcp-server/server.py"]
    }
  }
}
```

The path is resolved at runtime by `commands.rs` using `resolve_resource()`.

### Dependencies

- `mcp` (the official MCP Python SDK, provides FastMCP)
- No other dependencies

### Allowed tools update

In `claude_code.rs`, update `--allowedTools` to match new tool names:
```
mcp__blender__execute_blender_code
mcp__blender__get_scene_info
mcp__blender__get_object_info
mcp__blender__get_viewport_screenshot
```

(Drop `set_texture`, add `get_viewport_screenshot`)

## Files to create/modify

- **Create:** `droneai-studio/mcp-server/server.py` — the MCP server
- **Create:** `droneai-studio/mcp-server/requirements.txt` — just `mcp`
- **Modify:** `droneai-studio/mcp_config.json` — point to our server
- **Modify:** `droneai-studio/src-tauri/src/commands.rs` — resolve mcp-server path
- **Modify:** `droneai-studio/src-tauri/src/claude_code.rs` — update allowed tools

## Testing

1. Start Blender headless (existing `launch_blender` flow)
2. Run `python3 mcp-server/server.py` — verify it starts and connects to 9876
3. Launch app, type a message in chat, verify Claude can execute Blender code
4. Verify `/test` still works (bypasses MCP, direct TCP)
5. Verify scene data polling still works (also direct TCP)
