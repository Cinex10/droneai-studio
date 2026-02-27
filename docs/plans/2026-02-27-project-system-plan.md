# Project System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent project management so users can create, save, open, and switch between drone show projects.

**Architecture:** Rust `ProjectManager` owns all disk I/O. Frontend is a thin view layer calling Tauri IPC commands. Projects stored as `.droneai/` directory bundles in Tauri's app data dir.

**Tech Stack:** Rust (serde, chrono, uuid, Tauri managed state), React/TypeScript (Tauri invoke), existing Blender TCP:9876 bridge.

**Design doc:** `docs/plans/2026-02-27-project-system-design.md`

---

### Task 1: Project data model (`project.rs`)

**Files:**
- Create: `droneai-studio/src-tauri/src/project.rs`
- Modify: `droneai-studio/src-tauri/Cargo.toml` (add `uuid` dependency)

**Step 1: Add uuid dependency**

In `Cargo.toml` under `[dependencies]`, add:
```toml
uuid = { version = "1", features = ["v4", "serde"] }
```

**Step 2: Create `project.rs` with data structures and ProjectManager**

```rust
// droneai-studio/src-tauri/src/project.rs
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub modified_at: String,
    pub drone_count: u32,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectData {
    pub metadata: ProjectMetadata,
    pub spec: Option<serde_json::Value>,
    pub chat: Vec<ChatMessage>,
    pub build_result: Option<serde_json::Value>,
}

pub struct Project {
    pub metadata: ProjectMetadata,
    pub path: PathBuf,
    pub spec: Option<serde_json::Value>,
    pub chat: Vec<ChatMessage>,
    pub build_result: Option<serde_json::Value>,
    pub is_dirty: bool,
}

pub struct ProjectManager {
    pub projects_dir: PathBuf,
    pub current: Option<Project>,
}

impl ProjectManager {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let projects_dir = app_data_dir.join("projects");
        let _ = fs::create_dir_all(&projects_dir);
        Self {
            projects_dir,
            current: None,
        }
    }

    pub fn create(&mut self, name: &str) -> Result<ProjectMetadata, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let metadata = ProjectMetadata {
            id: id.clone(),
            name: name.to_string(),
            created_at: now.clone(),
            modified_at: now,
            drone_count: 0,
            duration_seconds: 0.0,
        };

        let project_dir = self.projects_dir.join(format!("{}.droneai", id));
        fs::create_dir_all(&project_dir)
            .map_err(|e| format!("Failed to create project dir: {}", e))?;

        let project = Project {
            metadata: metadata.clone(),
            path: project_dir.clone(),
            spec: None,
            chat: Vec::new(),
            build_result: None,
            is_dirty: false,
        };

        // Write initial project.json
        self.write_metadata(&project)?;
        self.current = Some(project);
        Ok(metadata)
    }

    pub fn list(&self) -> Result<Vec<ProjectMetadata>, String> {
        let mut projects = Vec::new();
        let entries = fs::read_dir(&self.projects_dir)
            .map_err(|e| format!("Failed to read projects dir: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.extension().map_or(false, |e| e == "droneai") {
                let meta_path = path.join("project.json");
                if let Ok(content) = fs::read_to_string(&meta_path) {
                    if let Ok(meta) = serde_json::from_str::<ProjectMetadata>(&content) {
                        projects.push(meta);
                    }
                }
            }
        }

        projects.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        Ok(projects)
    }

    pub fn open(&mut self, id: &str) -> Result<ProjectData, String> {
        let project_dir = self.projects_dir.join(format!("{}.droneai", id));
        if !project_dir.exists() {
            return Err(format!("Project {} not found", id));
        }

        let metadata: ProjectMetadata = self.read_json(&project_dir.join("project.json"))?;
        let spec: Option<serde_json::Value> = self.read_json_optional(&project_dir.join("spec.json"));
        let chat: Vec<ChatMessage> = self.read_json_optional(&project_dir.join("chat.json")).unwrap_or_default();
        let build_result: Option<serde_json::Value> = self.read_json_optional(&project_dir.join("build_result.json"));

        let project = Project {
            metadata: metadata.clone(),
            path: project_dir,
            spec: spec.clone(),
            chat: chat.clone(),
            build_result: build_result.clone(),
            is_dirty: false,
        };

        self.current = Some(project);

        Ok(ProjectData {
            metadata,
            spec,
            chat,
            build_result,
        })
    }

    pub fn save(&mut self, chat: Vec<ChatMessage>, spec: Option<serde_json::Value>, build_result: Option<serde_json::Value>) -> Result<(), String> {
        let project = self.current.as_mut().ok_or("No project open")?;

        project.chat = chat;
        if spec.is_some() {
            project.spec = spec;
        }
        if build_result.is_some() {
            project.build_result = build_result;
        }
        project.metadata.modified_at = Utc::now().to_rfc3339();

        // Write all files
        self.write_metadata_current()?;

        let path = project.path.clone();
        if let Some(ref s) = project.spec {
            fs::write(path.join("spec.json"), serde_json::to_string_pretty(s).unwrap())
                .map_err(|e| format!("Failed to write spec: {}", e))?;
        }
        fs::write(
            path.join("chat.json"),
            serde_json::to_string_pretty(&project.chat).unwrap(),
        )
        .map_err(|e| format!("Failed to write chat: {}", e))?;

        if let Some(ref br) = project.build_result {
            fs::write(path.join("build_result.json"), serde_json::to_string_pretty(br).unwrap())
                .map_err(|e| format!("Failed to write build result: {}", e))?;
        }

        project.is_dirty = false;
        Ok(())
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        let project_dir = self.projects_dir.join(format!("{}.droneai", id));
        if project_dir.exists() {
            fs::remove_dir_all(&project_dir)
                .map_err(|e| format!("Failed to delete project: {}", e))?;
        }
        // If deleting current project, clear it
        if let Some(ref current) = self.current {
            if current.metadata.id == id {
                self.current = None;
            }
        }
        Ok(())
    }

    pub fn rename(&mut self, id: &str, name: &str) -> Result<(), String> {
        let project_dir = self.projects_dir.join(format!("{}.droneai", id));
        let meta_path = project_dir.join("project.json");
        let mut meta: ProjectMetadata = self.read_json(&meta_path)?;
        meta.name = name.to_string();
        meta.modified_at = Utc::now().to_rfc3339();
        fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap())
            .map_err(|e| format!("Failed to write metadata: {}", e))?;
        // Update current if it's the same project
        if let Some(ref mut current) = self.current {
            if current.metadata.id == id {
                current.metadata.name = name.to_string();
                current.metadata.modified_at = meta.modified_at.clone();
            }
        }
        Ok(())
    }

    pub fn mark_dirty(&mut self) {
        if let Some(ref mut project) = self.current {
            project.is_dirty = true;
        }
    }

    pub fn is_dirty(&self) -> bool {
        self.current.as_ref().map_or(false, |p| p.is_dirty)
    }

    pub fn current_name(&self) -> Option<String> {
        self.current.as_ref().map(|p| p.metadata.name.clone())
    }

    pub fn blend_path(&self) -> Option<PathBuf> {
        self.current.as_ref().map(|p| p.path.join("scene.blend"))
    }

    // --- Private helpers ---

    fn write_metadata(&self, project: &Project) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&project.metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
        fs::write(project.path.join("project.json"), json)
            .map_err(|e| format!("Failed to write project.json: {}", e))?;
        Ok(())
    }

    fn write_metadata_current(&self) -> Result<(), String> {
        let project = self.current.as_ref().ok_or("No project open")?;
        self.write_metadata(project)
    }

    fn read_json<T: serde::de::DeserializeOwned>(&self, path: &PathBuf) -> Result<T, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
    }

    fn read_json_optional<T: serde::de::DeserializeOwned>(&self, path: &PathBuf) -> Option<T> {
        fs::read_to_string(path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
    }
}

pub type ProjectState = Mutex<ProjectManager>;
```

**Step 3: Verify it compiles**

Run: `cd droneai-studio/src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/project.rs src-tauri/Cargo.toml
git commit -m "feat: add Project data model and ProjectManager"
```

---

### Task 2: Wire ProjectManager into Tauri + IPC commands

**Files:**
- Modify: `droneai-studio/src-tauri/src/lib.rs`
- Modify: `droneai-studio/src-tauri/src/commands.rs`

**Step 1: Register ProjectManager in Tauri state**

In `lib.rs`, add:
```rust
mod project;

use project::ProjectManager;
```

And in the builder, add `.manage(Mutex::new(ProjectManager::new(...)))` using Tauri's `app.path().app_data_dir()`. This needs to move to a `.setup()` closure since the app handle isn't available at builder time:

```rust
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(BlenderProcess::new()))
        .manage(Mutex::new(ClaudeSession::new()))
        .setup(|app| {
            use tauri::Manager;
            let data_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir");
            app.manage(Mutex::new(ProjectManager::new(data_dir)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_blender_status,
            commands::get_blender_pid,
            commands::launch_blender,
            commands::send_message,
            commands::new_chat,
            commands::get_claude_status,
            commands::set_blender_frame,
            commands::get_scene_data,
            commands::run_test_show,
            // Project commands
            commands::create_project,
            commands::list_projects,
            commands::open_project,
            commands::save_project,
            commands::delete_project,
            commands::rename_project,
            commands::is_project_dirty,
            commands::mark_dirty,
            commands::get_current_project_name,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 2: Add project IPC commands to `commands.rs`**

Add at the top:
```rust
use crate::project::{ProjectState, ProjectMetadata, ProjectData, ChatMessage as ProjectChatMessage};
```

Add the commands at the bottom of `commands.rs`:

```rust
#[tauri::command]
pub fn create_project(
    name: String,
    project: State<'_, ProjectState>,
) -> Result<ProjectMetadata, String> {
    let mut pm = project.lock().unwrap();
    pm.create(&name)
}

#[tauri::command]
pub fn list_projects(
    project: State<'_, ProjectState>,
) -> Result<Vec<ProjectMetadata>, String> {
    let pm = project.lock().unwrap();
    pm.list()
}

#[tauri::command]
pub fn open_project(
    id: String,
    project: State<'_, ProjectState>,
) -> Result<ProjectData, String> {
    let mut pm = project.lock().unwrap();
    pm.open(&id)
}

#[tauri::command]
pub fn save_project(
    chat: Vec<ProjectChatMessage>,
    spec: Option<serde_json::Value>,
    build_result: Option<serde_json::Value>,
    project: State<'_, ProjectState>,
) -> Result<(), String> {
    let mut pm = project.lock().unwrap();

    // Save .blend file via Blender
    if let Some(blend_path) = pm.blend_path() {
        let code = format!(
            "import bpy; bpy.ops.wm.save_as_mainfile(filepath=r'{}')",
            blend_path.display()
        );
        let payload = serde_json::json!({
            "type": "execute_code",
            "params": { "code": code }
        });
        let _ = blender_mcp_call(&payload); // best-effort, don't fail save if Blender is down
    }

    pm.save(chat, spec, build_result)
}

#[tauri::command]
pub fn delete_project(
    id: String,
    project: State<'_, ProjectState>,
) -> Result<(), String> {
    let mut pm = project.lock().unwrap();
    pm.delete(&id)
}

#[tauri::command]
pub fn rename_project(
    id: String,
    name: String,
    project: State<'_, ProjectState>,
) -> Result<(), String> {
    let mut pm = project.lock().unwrap();
    pm.rename(&id, &name)
}

#[tauri::command]
pub fn is_project_dirty(
    project: State<'_, ProjectState>,
) -> bool {
    let pm = project.lock().unwrap();
    pm.is_dirty()
}

#[tauri::command]
pub fn mark_dirty(
    project: State<'_, ProjectState>,
) -> () {
    let mut pm = project.lock().unwrap();
    pm.mark_dirty();
}

#[tauri::command]
pub fn get_current_project_name(
    project: State<'_, ProjectState>,
) -> Option<String> {
    let pm = project.lock().unwrap();
    pm.current_name()
}
```

**Step 3: Verify it compiles**

Run: `cd droneai-studio/src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands.rs
git commit -m "feat: wire ProjectManager into Tauri IPC commands"
```

---

### Task 3: Close guard (Rust side)

**Files:**
- Modify: `droneai-studio/src-tauri/src/lib.rs`

**Step 1: Add close guard in `.setup()` hook**

Inside the `.setup()` closure, after managing ProjectManager, add a window close handler:

```rust
let window = app.get_webview_window("main").unwrap();
window.on_close_requested(move |_api| {
    // The frontend handles the confirm dialog.
    // We prevent default close — frontend will call
    // confirm_close_response which invokes window.close().
    // If not dirty, let it close immediately.
    // This is checked via JS on the beforeunload event.
    tauri::CloseRequestedResult::PreventClose
});
```

Actually, the cleaner approach is: Tauri always prevents close, the frontend checks dirty state and shows dialog if needed, then calls a `force_close` command.

Add to `commands.rs`:
```rust
#[tauri::command]
pub fn force_close(window: tauri::Window) {
    window.destroy().ok();
}
```

Register `commands::force_close` in the invoke handler in `lib.rs`.

**Step 2: Verify it compiles**

Run: `cd droneai-studio/src-tauri && cargo check`

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands.rs
git commit -m "feat: add close guard — prevent close, let frontend decide"
```

---

### Task 4: `useProject` hook (frontend)

**Files:**
- Create: `droneai-studio/src/hooks/useProject.ts`

**Step 1: Create the hook**

```typescript
// droneai-studio/src/hooks/useProject.ts
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProjectMetadata {
  id: string;
  name: string;
  created_at: string;
  modified_at: string;
  drone_count: number;
  duration_seconds: number;
}

export interface ProjectChatMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
}

export interface ProjectData {
  metadata: ProjectMetadata;
  spec: unknown | null;
  chat: ProjectChatMessage[];
  build_result: unknown | null;
}

export function useProject() {
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const createProject = useCallback(async (name: string): Promise<ProjectMetadata> => {
    const meta = await invoke<ProjectMetadata>("create_project", { name });
    setCurrentProject(meta);
    setIsDirty(false);
    return meta;
  }, []);

  const listProjects = useCallback(async (): Promise<ProjectMetadata[]> => {
    return invoke<ProjectMetadata[]>("list_projects");
  }, []);

  const openProject = useCallback(async (id: string): Promise<ProjectData> => {
    const data = await invoke<ProjectData>("open_project", { id });
    setCurrentProject(data.metadata);
    setIsDirty(false);
    return data;
  }, []);

  const saveProject = useCallback(
    async (chat: ProjectChatMessage[], spec?: unknown, buildResult?: unknown) => {
      await invoke("save_project", {
        chat,
        spec: spec ?? null,
        buildResult: buildResult ?? null,
      });
      setIsDirty(false);
    },
    []
  );

  const deleteProject = useCallback(async (id: string) => {
    await invoke("delete_project", { id });
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    await invoke("rename_project", { id, name });
    setCurrentProject((prev) => (prev && prev.id === id ? { ...prev, name } : prev));
  }, []);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    invoke("mark_dirty").catch(() => {});
  }, []);

  const forceClose = useCallback(async () => {
    await invoke("force_close");
  }, []);

  return {
    currentProject,
    isDirty,
    createProject,
    listProjects,
    openProject,
    saveProject,
    deleteProject,
    renameProject,
    markDirty,
    forceClose,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useProject.ts
git commit -m "feat: add useProject hook for project IPC"
```

---

### Task 5: ProjectPicker screen

**Files:**
- Create: `droneai-studio/src/components/ProjectPicker.tsx`

**Step 1: Create the component**

```tsx
// droneai-studio/src/components/ProjectPicker.tsx
import { useState, useEffect, useCallback } from "react";
import type { ProjectMetadata } from "../hooks/useProject";

interface ProjectPickerProps {
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  listProjects: () => Promise<ProjectMetadata[]>;
}

export default function ProjectPicker({
  onOpen,
  onCreate,
  onDelete,
  listProjects,
}: ProjectPickerProps) {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listProjects();
    setProjects(list);
  }, [listProjects]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = () => {
    const name = newName.trim() || "Untitled Show";
    onCreate(name);
    setNewName("");
    setShowCreate(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDelete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="max-w-lg w-full p-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
          DroneAI Studio
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Your drone show projects
        </p>

        {/* New project */}
        {showCreate ? (
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Show name..."
              autoFocus
              className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded hover:bg-[var(--accent-hover)]"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full mb-6 px-4 py-3 border-2 border-dashed border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            + New Project
          </button>
        )}

        {/* Project list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => onOpen(project.id)}
              className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {project.name}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {formatDate(project.modified_at)}
                  {project.drone_count > 0 &&
                    ` · ${project.drone_count} drones · ${project.duration_seconds.toFixed(0)}s`}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(e, project.id)}
                className="text-[var(--text-secondary)] hover:text-red-400 text-xs px-2 py-1"
              >
                Delete
              </button>
            </div>
          ))}
          {projects.length === 0 && (
            <p className="text-center text-sm text-[var(--text-secondary)] py-8">
              No projects yet. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ProjectPicker.tsx
git commit -m "feat: add ProjectPicker screen"
```

---

### Task 6: CloseDialog component

**Files:**
- Create: `droneai-studio/src/components/CloseDialog.tsx`

**Step 1: Create the component**

```tsx
// droneai-studio/src/components/CloseDialog.tsx

interface CloseDialogProps {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export default function CloseDialog({ onSave, onDiscard, onCancel }: CloseDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          Unsaved Changes
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          You have unsaved changes. What would you like to do?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-sm text-red-400 hover:text-red-300"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/CloseDialog.tsx
git commit -m "feat: add CloseDialog for unsaved changes guard"
```

---

### Task 7: Rewire App.tsx — routing, dirty tracking, close guard, save

**Files:**
- Modify: `droneai-studio/src/App.tsx`

This is the integration task. App.tsx becomes the router between ProjectPicker, SetupScreen, and Workspace. It also:
- Tracks dirty state (marks dirty on send/receive)
- Listens for Tauri close event → shows CloseDialog
- Handles Cmd+S → save_project
- Passes project name + dirty indicator to the workspace header

**Step 1: Rewrite App.tsx**

The key changes:
1. Add `useProject` hook
2. Add `screen` state: `"picker" | "setup" | "workspace"`
3. On create/open → go to `"setup"`, pass project data
4. On setup complete → go to `"workspace"`
5. Mark dirty on `handleSendMessage` and `claude.streamedText` change
6. Listen to Tauri `close-requested` window event → show CloseDialog if dirty
7. Add `Cmd+S` keyboard handler → call `saveProject`
8. Display project name + `*` in workspace header area
9. Add a "Back" button that checks dirty before returning to picker

Full implementation should follow the existing patterns in App.tsx. The workspace UI (ChatPanel, DroneViewport, TimelineBar) stays unchanged — just wrapped with a header bar showing project name, dirty indicator, and save button.

**Step 2: Verify app runs**

Run: `cd droneai-studio && npm run tauri dev`

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate project system — picker, routing, dirty tracking, close guard"
```

---

### Task 8: Restore Blender scene on project open

**Files:**
- Modify: `droneai-studio/src-tauri/src/commands.rs`

**Step 1: Add `restore_blender_scene` command**

When opening an existing project that has a `scene.blend`, send it to Blender:

```rust
#[tauri::command]
pub fn restore_blender_scene(
    project: State<'_, ProjectState>,
) -> Result<(), String> {
    let pm = project.lock().unwrap();
    if let Some(blend_path) = pm.blend_path() {
        if blend_path.exists() {
            let code = format!(
                "import bpy; bpy.ops.wm.open_mainfile(filepath=r'{}')",
                blend_path.display()
            );
            let payload = serde_json::json!({
                "type": "execute_code",
                "params": { "code": code }
            });
            blender_mcp_call(&payload)?;
        }
    }
    Ok(())
}
```

Register in `lib.rs` invoke handler.

**Step 2: Call from frontend**

In SetupScreen or App.tsx, after Blender is running and we're opening an existing project:
```typescript
await invoke("restore_blender_scene");
```

**Step 3: Verify it compiles**

Run: `cd droneai-studio/src-tauri && cargo check`

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: restore Blender scene from .blend on project open"
```

---

### Task 9: Restore Claude conversation on project open

**Files:**
- Modify: `droneai-studio/src-tauri/src/claude_code.rs`

**Step 1: Add conversation restore to ClaudeSession**

Claude Code's stream-json input format supports sending conversation history. After starting a new session, send the saved chat messages as conversation context:

```rust
/// Restore conversation history from a saved project.
/// Sends messages as "user" and "assistant" turns so Claude has context.
pub fn restore_conversation(&mut self, messages: &[crate::project::ChatMessage]) -> Result<(), String> {
    let stdin = self.stdin.as_mut().ok_or("No active session")?;
    for msg in messages {
        // Skip the welcome message
        if msg.id == "welcome" {
            continue;
        }
        let json_msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": msg.role,
                "content": msg.content
            }
        });
        writeln!(stdin, "{}", json_msg)
            .map_err(|e| format!("Failed to write history: {}", e))?;
    }
    stdin.flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;
    Ok(())
}
```

**Step 2: Add a `restore_chat` IPC command in `commands.rs`**

```rust
#[tauri::command]
pub fn restore_chat(
    messages: Vec<ProjectChatMessage>,
    claude: State<'_, ClaudeState>,
) -> Result<(), String> {
    let mut session = claude.lock().unwrap();
    session.restore_conversation(&messages)
}
```

Register in `lib.rs`.

**Step 3: Commit**

```bash
git add src-tauri/src/claude_code.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: restore Claude conversation history on project open"
```

---

### Task 10: End-to-end verification

**Step 1: Run the app**

```bash
cd droneai-studio && npm run tauri dev
```

**Step 2: Test flow**

1. App opens → ProjectPicker shown (empty)
2. Click "New Project" → enter name → Create
3. SetupScreen → Launch Blender → Connect Claude → Start Designing
4. Send a prompt → get a show → viewport renders
5. Window title shows `ProjectName *` (dirty)
6. Press Cmd+S → saves (dirty indicator clears)
7. Close and reopen app → project appears in picker
8. Click it → SetupScreen → workspace loads with chat history restored
9. Try closing with unsaved changes → CloseDialog appears

**Step 3: Commit any fixes**

```bash
git commit -m "fix: end-to-end project system adjustments"
```
