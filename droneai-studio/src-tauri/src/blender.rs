// droneai-studio/src-tauri/src/blender.rs
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct BlenderProcess {
    child: Option<Child>,
    pid: Option<u32>,
}

impl BlenderProcess {
    pub fn new() -> Self {
        Self {
            child: None,
            pid: None,
        }
    }

    /// Detect Blender binary path, preferring bundled over system install.
    ///
    /// Search order:
    /// 1. Bundled in Tauri resource dir (production)
    /// 2. Dev-staged in src-tauri/blender-runtime/
    /// 3. System /Applications/Blender.app
    /// 4. User ~/Applications/Blender.app
    pub fn detect_blender_path(app: &tauri::AppHandle) -> Option<PathBuf> {
        use tauri::Manager;

        // 1. Bundled (production)
        if let Ok(dir) = app.path().resource_dir() {
            let bundled = dir.join("blender-runtime/MacOS/Blender");
            if bundled.exists() {
                return Some(bundled);
            }
        }

        // 2. Dev-staged
        let dev_staged = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("blender-runtime/MacOS/Blender");
        if dev_staged.exists() {
            return Some(dev_staged);
        }

        // 3. System install
        let system = PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender");
        if system.exists() {
            return Some(system);
        }

        // 4. User install
        let home = std::env::var("HOME").ok()?;
        let user = PathBuf::from(format!(
            "{}/Applications/Blender.app/Contents/MacOS/Blender",
            home
        ));
        if user.exists() {
            return Some(user);
        }

        None
    }

    /// Launch Blender headless with the startup script and optional addon directory.
    pub fn launch(
        &mut self,
        app: &tauri::AppHandle,
        startup_script: &str,
        addon_dir: Option<&str>,
        droneai_lib_dir: Option<&str>,
    ) -> Result<u32, String> {
        // Kill any existing Blender process first — Rust's Child::drop does NOT
        // kill the subprocess, so without this, zombie Blender processes accumulate
        // across app restarts and fight over port 9876.
        self.kill();

        let blender_path = Self::detect_blender_path(app)
            .ok_or_else(|| "Blender not found. Please install Blender 4.x or run scripts/prepare-blender.sh.".to_string())?;

        let mut cmd = Command::new(&blender_path);
        // --addons must come before --python; args after --python are passed to the script.
        cmd.args(["--background", "--addons", "addon", "--python", startup_script]);

        // Point Blender at the bundled addon directory
        if let Some(dir) = addon_dir {
            cmd.env("BLENDER_USER_SCRIPTS", dir);
        }

        // Add droneai library to Python path so `import droneai` works
        // inside Blender's exec() calls (MCP addon execute_code).
        if let Some(lib_dir) = droneai_lib_dir {
            cmd.env("PYTHONPATH", lib_dir);
        }

        // Discard stdout/stderr — piped-but-unread pipes fill up and block
        // the child process, which freezes the MCP server and lags the UI.
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to launch Blender: {}", e))?;

        let pid = child.id();
        self.child = Some(child);
        self.pid = Some(pid);
        Ok(pid)
    }

    /// Check if Blender is still running.
    pub fn is_running(&mut self) -> bool {
        match &mut self.child {
            Some(child) => child.try_wait().ok().flatten().is_none(),
            None => false,
        }
    }

    /// Get the Blender process ID.
    pub fn pid(&self) -> Option<u32> {
        self.pid
    }

    /// Kill the Blender process.
    pub fn kill(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
        self.pid = None;
    }
}

impl Drop for BlenderProcess {
    fn drop(&mut self) {
        self.kill();
    }
}

pub type BlenderState = Mutex<BlenderProcess>;
