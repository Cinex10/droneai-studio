// droneai-studio/src-tauri/src/commands.rs
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::time::Duration;

use tauri::State;

use crate::blender::BlenderState;
use crate::claude_code::ClaudeState;

/// Resolve a bundled resource by name.
///
/// 1. Try Tauri resource dir (production builds).
/// 2. Fall back to dev paths relative to CARGO_MANIFEST_DIR.
fn resolve_resource(app: &tauri::AppHandle, resource_name: &str) -> Result<PathBuf, String> {
    use tauri::Manager;
    if let Ok(dir) = app.path().resource_dir() {
        let path = dir.join(resource_name);
        if path.exists() {
            return Ok(path);
        }
    }
    let dev_path = dev_resolve(resource_name);
    if dev_path.exists() {
        return Ok(dev_path);
    }
    Err(format!("Resource '{}' not found", resource_name))
}

/// Dev-mode path mapping for resources.
fn dev_resolve(resource_name: &str) -> PathBuf {
    let m = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    match resource_name {
        "blender_startup.py" => m.join("../blender_startup.py"),
        "mcp_config.json" => m.join("../mcp_config.json"),
        "mcp-server/server.py" => m.join("../mcp-server/server.py"),
        "system_prompt.md" => m.join("../resources/system_prompt.md"),
        "droneai" => m.join("../resources/droneai"),
        other => m.join(other),
    }
}

/// Send a raw JSON command to Blender's MCP addon on port 9876 and read the response.
/// The addon uses raw JSON over TCP (no length prefix).
fn blender_mcp_call(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let msg = payload.to_string();

    let mut stream = TcpStream::connect_timeout(
        &"127.0.0.1:9876".parse().unwrap(),
        Duration::from_millis(500),
    ).map_err(|e| format!("Cannot connect to Blender MCP socket: {}", e))?;

    stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();

    // Send raw JSON (no framing — addon accumulates and parses)
    stream.write_all(msg.as_bytes())
        .map_err(|e| format!("Failed to write: {}", e))?;
    stream.flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    // Read response: accumulate until valid JSON (addon sends raw JSON back)
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    loop {
        match stream.read(&mut tmp) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&tmp[..n]);
                // Try to parse — if valid, we're done
                if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&buf) {
                    return Ok(val);
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                // Timeout waiting for more data, try to parse what we have
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
            Err(e) => return Err(format!("Failed to read response: {}", e)),
        }
    }

    // Try final parse
    serde_json::from_slice(&buf)
        .map_err(|e| format!("Invalid response JSON: {}", e))
}

#[tauri::command]
pub fn get_blender_status(blender: State<'_, BlenderState>) -> String {
    let mut blender = blender.lock().unwrap();
    if blender.is_running() {
        "running".to_string()
    } else {
        "stopped".to_string()
    }
}

#[tauri::command]
pub fn get_blender_pid(blender: State<'_, BlenderState>) -> Option<u32> {
    let blender = blender.lock().unwrap();
    blender.pid()
}

#[tauri::command]
pub fn launch_blender(
    blender: State<'_, BlenderState>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let mut blender = blender.lock().unwrap();

    let startup_script = resolve_resource(&app, "blender_startup.py")?;
    let script_path = startup_script.to_str()
        .ok_or("Invalid startup script path")?;

    // Resolve bundled addon directory (if present)
    let addon_dir = resolve_resource(&app, "blender-runtime/addon")
        .ok()
        .and_then(|p| p.to_str().map(String::from));

    // Resolve droneai library parent dir so `import droneai` works in Blender.
    // In production, droneai is in Blender's site-packages (no PYTHONPATH needed).
    // In dev, it's under resources/ next to the startup script.
    let droneai_lib_dir = resolve_resource(&app, "droneai")
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_str().map(String::from)).flatten());

    blender.launch(&app, script_path, addon_dir.as_deref(), droneai_lib_dir.as_deref())
}

#[tauri::command]
pub fn send_message(
    message: String,
    claude: State<'_, ClaudeState>,
) -> Result<(), String> {
    let mut session = claude.lock().unwrap();
    session.send(&message)
}

#[tauri::command]
pub fn new_chat(
    claude: State<'_, ClaudeState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut session = claude.lock().unwrap();

    // Read system prompt content from file (--system-prompt takes inline text)
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
                "command": "uv",
                "args": ["run", server_path]
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

#[tauri::command]
pub fn get_claude_status(claude: State<'_, ClaudeState>) -> String {
    let mut session = claude.lock().unwrap();
    if session.is_active() {
        "active".to_string()
    } else {
        "inactive".to_string()
    }
}


#[tauri::command]
pub fn set_blender_frame(frame: i32) -> Result<(), String> {
    let code = format!("import bpy; bpy.context.scene.frame_set({})", frame);
    let payload = serde_json::json!({
        "type": "execute_code",
        "params": { "code": code }
    });
    blender_mcp_call(&payload)?;
    Ok(())
}

const SCENE_EXTRACT_SCRIPT: &str = r#"
import bpy, json

def extract_drone_data(obj):
    drone = {
        "name": obj.name,
        "position": list(obj.location),
        "color": [1.0, 1.0, 1.0, 1.0],
        "emission_strength": 5.0,
        "keyframes": {"location": [], "color": []}
    }
    # Get color from material (emission node, principled BSDF, or diffuse)
    if obj.data and hasattr(obj.data, 'materials') and obj.data.materials:
        mat = obj.data.materials[0]
        if mat and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'EMISSION':
                    c = node.inputs['Color'].default_value
                    drone["color"] = [c[0], c[1], c[2], c[3] if len(c) > 3 else 1.0]
                    drone["emission_strength"] = node.inputs['Strength'].default_value
                    break
                elif node.type == 'BSDF_PRINCIPLED':
                    c = node.inputs['Base Color'].default_value
                    drone["color"] = [c[0], c[1], c[2], c[3] if len(c) > 3 else 1.0]
                    em = node.inputs.get('Emission Strength') or node.inputs.get('Emission')
                    if em:
                        drone["emission_strength"] = em.default_value if hasattr(em.default_value, '__float__') else 5.0
                    break
    # Get location keyframes
    loc_frames = {}
    color_frames = {}
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            if fc.data_path == "location":
                idx = fc.array_index
                for kp in fc.keyframe_points:
                    f = int(kp.co[0])
                    if f not in loc_frames:
                        loc_frames[f] = [0.0, 0.0, 0.0]
                    loc_frames[f][idx] = kp.co[1]
        for f in sorted(loc_frames.keys()):
            drone["keyframes"]["location"].append({"frame": f, "value": loc_frames[f]})
    # Get color keyframes from material
    if obj.data and hasattr(obj.data, 'materials') and obj.data.materials:
        mat = obj.data.materials[0]
        if mat and mat.node_tree and mat.node_tree.animation_data and mat.node_tree.animation_data.action:
            for fc in mat.node_tree.animation_data.action.fcurves:
                if "Color" in fc.data_path:
                    idx = fc.array_index
                    for kp in fc.keyframe_points:
                        f = int(kp.co[0])
                        if f not in color_frames:
                            color_frames[f] = [1.0, 1.0, 1.0, 1.0]
                        color_frames[f][idx] = kp.co[1]
            for f in sorted(color_frames.keys()):
                drone["keyframes"]["color"].append({"frame": f, "value": color_frames[f]})
    return drone

drones = []
seen = set()

# Strategy 1: Look for collections with "drone" in the name (case-insensitive)
for coll in bpy.data.collections:
    if "drone" in coll.name.lower():
        for obj in coll.objects:
            if obj.name not in seen and obj.type == 'MESH':
                seen.add(obj.name)
                drones.append(extract_drone_data(obj))

# Strategy 2: If no drone collection found, look for objects with "drone" in name
if not drones:
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and "drone" in obj.name.lower() and obj.name not in seen:
            seen.add(obj.name)
            drones.append(extract_drone_data(obj))

# Strategy 3: If still nothing, grab all mesh objects except default cube/plane
if not drones:
    skip = {"Cube", "Plane", "Camera", "Light", "Sun", "Spot", "Area", "Point"}
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and obj.name not in skip and obj.name not in seen:
            seen.add(obj.name)
            drones.append(extract_drone_data(obj))

scene = bpy.context.scene
print(json.dumps({
    "frame_range": [scene.frame_start, scene.frame_end],
    "fps": scene.render.fps,
    "drones": drones
}))
"#;

#[tauri::command]
pub fn get_scene_data() -> Result<String, String> {
    let payload = serde_json::json!({
        "type": "execute_code",
        "params": { "code": SCENE_EXTRACT_SCRIPT }
    });
    let resp = blender_mcp_call(&payload)?;

    // Response shape: {"status":"success","result":{"executed":true,"result":"<stdout>"}}
    // Navigate through the nested structure to get the stdout content
    if let Some(outer) = resp.get("result") {
        // outer = {"executed": true, "result": "<stdout>"}
        if let Some(inner) = outer.get("result") {
            if let Some(s) = inner.as_str() {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    return Ok(trimmed.to_string());
                }
            }
        }
        // Fallback: maybe the result is directly a string (different addon version)
        if let Some(s) = outer.as_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }
    if let Some(err) = resp.get("error") {
        return Err(format!("Blender error: {}", err));
    }
    Err(format!("Unexpected response from Blender: {}", resp))
}

/// A pre-built drone show for quick testing: 25 drones, 4 formations,
/// color transitions.  Triggered by the /test command in the chat input.
/// Uses the droneai library for all formation generation and Blender scripting.
///
/// NOTE: The `sys.path` preamble is prepended dynamically by `run_test_show()`
/// so this script only contains the actual show logic.
const TEST_SHOW_SCRIPT: &str = r#"
import bpy
from droneai.blender_scripts.setup_scene import setup_drone_show_scene
from droneai.blender_scripts.create_drones import create_drones
from droneai.blender_scripts.create_formation import create_formation
from droneai.blender_scripts.set_led_colors import set_led_color_all
from droneai.blender_scripts.animate_transition import animate_transition

N   = 25
FPS = 24
HOLD  = 3   # seconds per formation hold
TRANS = 3   # seconds per transition

def sec(s):
    return int(s * FPS)

# 1. Setup scene and create drones
setup_drone_show_scene(fps=FPS, duration_seconds=30)
create_drones(count=N)

# 2. Build timeline: ground → circle → heart → star → landing
frame = 0
create_formation("grid", frame=frame, altitude=0, spacing=2.5)
set_led_color_all((0.2, 0.2, 1.0), frame=frame)

frame += sec(TRANS)
create_formation("circle", frame=frame, radius=12, altitude=15)
set_led_color_all((0.0, 0.8, 1.0), frame=frame)

frame += sec(HOLD)
create_formation("circle", frame=frame, radius=12, altitude=15)

frame += sec(TRANS)
create_formation("heart", frame=frame, scale=24, altitude=20)
set_led_color_all((1.0, 0.1, 0.3), frame=frame)

frame += sec(HOLD)
create_formation("heart", frame=frame, scale=24, altitude=20)

frame += sec(TRANS)
create_formation("star", frame=frame, outer_radius=12, altitude=20)
set_led_color_all((1.0, 0.85, 0.0), frame=frame)

frame += sec(HOLD)
create_formation("star", frame=frame, outer_radius=12, altitude=20)

frame += sec(TRANS)
create_formation("grid", frame=frame, altitude=0, spacing=2.5)
set_led_color_all((0.2, 0.2, 1.0), frame=frame)

# 3. Smooth all transitions
animate_transition(0, frame, easing="EASE_IN_OUT")

# 4. Set final frame range
bpy.context.scene.frame_end = frame
print(f"Test show created: {N} drones, {frame} frames ({frame/FPS:.1f}s)")
"#;

#[tauri::command]
pub fn run_test_show(app: tauri::AppHandle) -> Result<String, String> {
    // Resolve droneai library path and prepend sys.path setup to the script.
    // Blender's embedded Python may ignore PYTHONPATH, so we inject the path
    // directly into the executed code.
    let preamble = if let Ok(droneai_dir) = resolve_resource(&app, "droneai") {
        if let Some(parent) = droneai_dir.parent() {
            format!(
                "import sys; sys.path.insert(0, r'{}')\n",
                parent.display()
            )
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let full_script = format!("{}{}", preamble, TEST_SHOW_SCRIPT);
    let payload = serde_json::json!({
        "type": "execute_code",
        "params": { "code": full_script }
    });
    let resp = blender_mcp_call(&payload)?;

    if let Some(status) = resp.get("status").and_then(|s| s.as_str()) {
        if status == "success" {
            return Ok("Test show created: 25 drones, circle → heart → star → landing".to_string());
        }
    }
    if let Some(err) = resp.get("error").or_else(|| resp.get("message")) {
        return Err(format!("Failed to create test show: {}", err));
    }
    Ok(format!("Test show response: {}", resp))
}

