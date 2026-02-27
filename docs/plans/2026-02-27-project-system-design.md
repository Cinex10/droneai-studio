# Project System Design

**Date:** 2026-02-27
**Status:** Approved

## Summary

Introduce a `Project` concept to DroneAI Studio so users can save, open, and manage drone shows as persistent bundles. Projects are stored as `.droneai/` directories containing all session data.

## Requirements

- Project picker screen on app startup (list recent projects + "New Project")
- A project saves **everything**: ShowSpec, chat history, BuildResult, Blender `.blend` file, thumbnail
- Manual save only (Cmd+S or button)
- Dirty state tracking with visual indicator (`*` in title)
- Close guard dialog when closing with unsaved changes
- Conversation restored when reopening a project (Claude sees chat history)

## Architecture: Rust-Centric (Approach A)

`ProjectManager` lives in the Rust backend alongside `BlenderProcess` and `ClaudeSession`. All disk I/O is in Rust. Frontend is a thin view layer.

### Data Model

```rust
// src-tauri/src/project.rs

struct ProjectMetadata {
    id: String,              // UUID
    name: String,            // user-visible name
    created_at: String,      // ISO 8601
    modified_at: String,     // ISO 8601
    drone_count: u32,
    duration_seconds: f64,
}

struct ChatMessage {
    id: String,
    role: String,            // "user" | "assistant"
    content: String,
    timestamp: i64,
}

struct Project {
    metadata: ProjectMetadata,
    path: PathBuf,           // full path to .droneai/ directory
    spec: Option<Value>,     // ShowSpec as serde_json::Value
    chat: Vec<ChatMessage>,
    build_result: Option<Value>,
    is_dirty: bool,
}

struct ProjectManager {
    projects_dir: PathBuf,   // ~/Library/Application Support/com.droneai.studio/projects/
    current: Option<Project>,
}
```

`ProjectManager` is added to Tauri's managed state as `Mutex<ProjectManager>`.

### Disk Layout

```
~/Library/Application Support/com.droneai.studio/
└── projects/
    └── <uuid>.droneai/
        ├── project.json        # ProjectMetadata
        ├── spec.json           # ShowSpec
        ├── chat.json           # Vec<ChatMessage>
        ├── build_result.json   # positions, safety report
        ├── scene.blend         # Blender file
        └── thumbnail.png       # viewport screenshot for picker
```

### Tauri IPC Commands

```
// Project CRUD
create_project(name: String) → ProjectMetadata
list_projects() → Vec<ProjectMetadata>
open_project(id: String) → ProjectData
delete_project(id: String) → ()
rename_project(id: String, name: String) → ()

// Persistence
save_project(chat: Vec<ChatMessage>) → ()
is_project_dirty() → bool
mark_dirty() → ()

// Close guard
confirm_close_response(action: String) → ()  // "save" | "discard" | "cancel"
```

`ProjectData` (returned by `open_project`):
```rust
struct ProjectData {
    metadata: ProjectMetadata,
    spec: Option<Value>,
    chat: Vec<ChatMessage>,
    build_result: Option<Value>,
}
```

### Save Flow

1. Serialize metadata → `project.json`
2. Serialize spec → `spec.json` (fetched from MCP server via `get_current_spec` or stored in Rust state)
3. Serialize chat → `chat.json` (frontend sends messages array via IPC)
4. Serialize build result → `build_result.json`
5. Send `bpy.ops.wm.save_mainfile(filepath=...)` to Blender via TCP:9876 → writes `scene.blend`
6. Take viewport screenshot → `thumbnail.png`
7. Update `modified_at`, set `is_dirty = false`

### Load Flow

1. Read all JSON files from `.droneai/` directory → populate `Project` struct
2. Send `bpy.ops.wm.open_mainfile(filepath=...)` to Blender → restore scene
3. Return `ProjectData` to frontend via IPC
4. Frontend loads chat messages into chat panel
5. Frontend sends chat history to Claude Code to restore conversation context
6. Set `is_dirty = false`

### List Flow

- Scan `projects/` directory for `*.droneai/` subdirectories
- Read only `project.json` from each → `Vec<ProjectMetadata>`
- Sort by `modified_at` descending

### Dirty State Tracking

**Triggers that set dirty = true:**
- User sends a message (frontend calls `mark_dirty()`)
- Claude responds (frontend calls `mark_dirty()`)
- `build_show` or `update_show` completes (MCP server notifies → dirty)

**Visual indicator:**
- Window title: `"ProjectName *"` when dirty, `"ProjectName"` when clean
- Save button enabled/disabled based on dirty state

### Close Guard

Uses Tauri's `window.on_close_requested()`:

1. Rust checks `project.is_dirty`
2. If dirty → prevent close, emit `"confirm-close"` event to frontend
3. Frontend shows dialog: **"You have unsaved changes"**
   - **Save** → calls `save_project()` then closes
   - **Discard** → closes immediately
   - **Cancel** → stays open
4. If not dirty → close immediately

Dialog is React (matches app design), not native OS dialog.

### App Flow Changes

**Current:**
```
App → SetupScreen → Workspace
```

**New:**
```
App → ProjectPicker
        ├─ "New Project" → name input → create_project() → SetupScreen → Workspace
        └─ Click existing → open_project() → SetupScreen → Workspace
```

SetupScreen is unchanged (launches Blender + Claude). On `open_project`, after services start:
- Rust sends `.blend` file to Blender to restore scene
- Frontend sends chat history to Claude to restore conversation

**Workspace additions:**
- Project name in header (editable inline)
- Dirty indicator
- Save button (+ Cmd+S shortcut)
- Back button to return to project picker

### Module Structure

```
src-tauri/src/
├── lib.rs            # adds ProjectManager to Tauri state
├── project.rs        # Project, ProjectMetadata, ProjectManager (NEW)
├── commands.rs       # new project IPC commands added
├── blender.rs        # unchanged
├── claude_code.rs    # unchanged
└── embed.rs          # unchanged

src/
├── App.tsx           # routes between ProjectPicker and Workspace
├── components/
│   ├── ProjectPicker.tsx  # NEW — list + create projects
│   ├── SetupScreen.tsx    # unchanged
│   ├── WorkspaceHeader.tsx # NEW — name, save, dirty indicator
│   └── CloseDialog.tsx    # NEW — unsaved changes dialog
└── hooks/
    └── useProject.ts      # NEW — project IPC wrapper
```
