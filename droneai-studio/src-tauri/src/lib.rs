mod blender;
mod claude_code;
mod commands;
mod embed;
mod project;

use blender::BlenderProcess;
use claude_code::ClaudeSession;
use project::ProjectManager;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(BlenderProcess::new()))
        .manage(Mutex::new(ClaudeSession::new()))
        .setup(|app| {
            use tauri::Manager;
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            app.manage(Mutex::new(ProjectManager::new(data_dir)));

            // Intercept window close — emit event to frontend, let it decide
            use tauri::Emitter;
            let window = app.get_webview_window("main").unwrap();
            let w = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = w.emit("close-requested", ());
                }
            });

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
            commands::force_close,
            commands::restore_blender_scene,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
