// droneai-studio/src-tauri/src/embed.rs
//! macOS NSWindow embedding for Blender viewport.
//!
//! Finds Blender's window by PID, removes its chrome (title bar),
//! and reparents its content view into the Tauri app's right panel.

#[cfg(target_os = "macos")]
pub mod macos {
    use cocoa::appkit::{NSWindow, NSWindowStyleMask, NSView};
    use cocoa::base::{id, nil};
    use objc::runtime::Object;
    use std::process::Command;

    /// Find the window ID (CGWindowID) for a given process ID.
    /// Returns the NSWindow pointer if found.
    pub fn find_window_by_pid(pid: u32) -> Option<u64> {
        // Use CGWindowListCopyWindowInfo to find windows for the PID
        let output = Command::new("osascript")
            .args([
                "-e",
                &format!(
                    "tell application \"System Events\" to get id of first window of (first process whose unix id is {})",
                    pid
                ),
            ])
            .output()
            .ok()?;

        if output.status.success() {
            let id_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            id_str.parse::<u64>().ok()
        } else {
            None
        }
    }

    /// Attempt to embed a Blender window into a target NSView.
    /// This is a best-effort operation — embedding may fail due to
    /// permissions or OpenGL context issues.
    pub fn embed_window(_blender_pid: u32, _target_view: id) -> Result<(), String> {
        // Phase 1 implementation: Position Blender window adjacent to app
        // True embedding (NSView reparenting) is complex with OpenGL contexts
        // and will be refined in Phase 2.
        //
        // For now, we use the "side-by-side" fallback approach:
        // 1. Remove Blender's title bar
        // 2. Position it next to the app window
        // 3. Resize to match the viewport area
        Err("Window embedding not yet implemented — using side-by-side fallback".to_string())
    }

    /// Position Blender window adjacent to the app window (fallback).
    pub fn position_side_by_side(
        blender_pid: u32,
        app_x: f64,
        app_y: f64,
        app_width: f64,
        app_height: f64,
        chat_width: f64,
    ) -> Result<(), String> {
        // Position Blender to the right of the chat panel
        let blender_x = app_x + chat_width;
        let blender_y = app_y;
        let blender_width = app_width - chat_width;
        let blender_height = app_height - 48.0; // minus timeline bar

        let script = format!(
            r#"tell application "System Events"
                set blenderProc to first process whose unix id is {}
                tell blenderProc
                    set position of first window to {{{}, {}}}
                    set size of first window to {{{}, {}}}
                end tell
            end tell"#,
            blender_pid,
            blender_x as i32,
            blender_y as i32,
            blender_width as i32,
            blender_height as i32,
        );

        Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to position Blender window: {}", e))?;

        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
pub mod macos {
    pub fn find_window_by_pid(_pid: u32) -> Option<u64> {
        None
    }

    pub fn position_side_by_side(
        _blender_pid: u32,
        _app_x: f64,
        _app_y: f64,
        _app_width: f64,
        _app_height: f64,
        _chat_width: f64,
    ) -> Result<(), String> {
        Err("Window embedding only supported on macOS".to_string())
    }
}
