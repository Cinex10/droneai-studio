mod blender;
mod claude_code;
mod commands;
mod embed;

use blender::BlenderProcess;
use claude_code::ClaudeSession;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(BlenderProcess::new()))
        .manage(Mutex::new(ClaudeSession::new()))
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
