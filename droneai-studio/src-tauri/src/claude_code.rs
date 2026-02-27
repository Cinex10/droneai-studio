// droneai-studio/src-tauri/src/claude_code.rs
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use tauri::{AppHandle, Emitter};

pub struct ClaudeSession {
    child: Option<Child>,
    stdin: Option<std::process::ChildStdin>,
}

/// Return the log directory for Claude session transcripts.
/// In dev mode: <project>/droneai-studio/logs/
/// Creates the directory if it doesn't exist.
fn log_dir() -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../logs");
    let _ = fs::create_dir_all(&dir);
    dir
}

impl ClaudeSession {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
        }
    }

    /// Spawn a new Claude Code session with the drone show system prompt.
    pub fn start(
        &mut self,
        system_prompt: &str,
        mcp_config_path: &str,
        app: AppHandle,
    ) -> Result<(), String> {
        // Kill existing session if any
        self.stop();

        // Resolve full path to claude binary — macOS GUI apps don't inherit shell PATH
        let home = std::env::var("HOME").unwrap_or_default();
        let claude_bin = format!("{}/.local/bin/claude", home);
        let extra_path = format!("{}/.local/bin:{}/.cargo/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", home, home);

        // Prepare log file with timestamp
        let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let log_path = log_dir().join(format!("claude-session-{}.jsonl", timestamp));

        let mut child = Command::new(&claude_bin)
            .args([
                "--print",
                "--system-prompt", system_prompt,
                "--input-format", "stream-json",
                "--output-format", "stream-json",
                "--include-partial-messages",
                "--mcp-config", mcp_config_path,
                "--strict-mcp-config",
                "--allowedTools",
                    "mcp__blender__execute_blender_code,mcp__blender__get_scene_info,mcp__blender__get_object_info,mcp__blender__get_viewport_screenshot,mcp__blender__build_show,mcp__blender__update_show",
                "--dangerously-skip-permissions",
            ])
            .env_remove("CLAUDECODE")
            .env("PATH", &extra_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start Claude Code: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

        self.child = Some(child);
        self.stdin = Some(stdin);

        // Read stdout in background thread, emit events to frontend + log to file
        let app_clone = app.clone();
        let stdout_log_path = log_path.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut log_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&stdout_log_path)
                .ok();

            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        let _ = app_clone.emit("claude-response", &text);
                        // Append to log file
                        if let Some(ref mut f) = log_file {
                            let _ = writeln!(f, "{}", text);
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = app_clone.emit("claude-exited", ());
        });

        // Read stderr in background thread for diagnostics + log
        let stderr_log_path = log_dir().join(format!("claude-session-{}-stderr.log", timestamp));
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let mut log_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&stderr_log_path)
                .ok();

            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        eprintln!("[claude stderr] {}", text);
                        let _ = app.emit("claude-stderr", &text);
                        if let Some(ref mut f) = log_file {
                            let _ = writeln!(f, "{}", text);
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        eprintln!("[claude] Session log: {}", log_path.display());
        Ok(())
    }

    /// Send a message to the Claude Code session (stream-json format).
    pub fn send(&mut self, message: &str) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("No active session")?;
        // stream-json input format: {"type":"user","message":{"role":"user","content":"..."}}
        let json_msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": message
            }
        });
        writeln!(stdin, "{}", json_msg)
            .map_err(|e| format!("Failed to write to Claude: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;
        Ok(())
    }

    /// Restore conversation history from a saved project.
    /// Sends a single context message so Claude is aware of the prior conversation.
    pub fn restore_conversation(&mut self, messages: &[crate::project::ChatMessage]) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("No active session")?;

        // Build a summary of the conversation history
        let mut history = String::from("[The following is a restored conversation from a previously saved project session. Use this as context for continuing the conversation.]\n\n");
        for msg in messages {
            if msg.id == "welcome" {
                continue;
            }
            let role_label = if msg.role == "user" { "User" } else { "Assistant" };
            history.push_str(&format!("{}: {}\n\n", role_label, msg.content));
        }
        history.push_str("[End of restored conversation. The user may now continue where they left off.]");

        let json_msg = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": history
            }
        });
        writeln!(stdin, "{}", json_msg)
            .map_err(|e| format!("Failed to write history: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;
        Ok(())
    }

    /// Stop the Claude Code session.
    pub fn stop(&mut self) {
        self.stdin = None;
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
    }

    pub fn is_active(&mut self) -> bool {
        match &mut self.child {
            Some(child) => child.try_wait().ok().flatten().is_none(),
            None => false,
        }
    }
}

impl Drop for ClaudeSession {
    fn drop(&mut self) {
        self.stop();
    }
}

pub type ClaudeState = Mutex<ClaudeSession>;
