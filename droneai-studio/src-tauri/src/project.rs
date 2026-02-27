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
            path: project_dir,
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
        let path = project.path.clone();
        let metadata_json = serde_json::to_string_pretty(&project.metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
        fs::write(path.join("project.json"), metadata_json)
            .map_err(|e| format!("Failed to write project.json: {}", e))?;

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
