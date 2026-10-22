mod commands;
mod detect;
mod formats;
mod history;

use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Arquivos recebidos pela linha de comando na primeira execução,
/// guardados até o front pedir por eles.
#[derive(Default)]
pub struct StartupFiles(pub Mutex<Vec<String>>);

/// Extrai caminhos de arquivo dos argumentos (o primeiro é o executável).
fn paths_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = Path::new(a);
            if p.is_absolute() { p.to_path_buf() } else { cwd.join(p) }
        })
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cwd = std::env::current_dir().unwrap_or_default();
    let args: Vec<String> = std::env::args_os()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    let initial = paths_from_args(&args, &cwd);

    tauri::Builder::default()
        // Precisa ser o primeiro plugin: uma segunda execução repassa os
        // arquivos para a janela já aberta e encerra.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let files = paths_from_args(&argv, Path::new(&cwd));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(StartupFiles(Mutex::new(initial)))
        .manage(commands::sheet::SheetCache::default())
        .setup(|app| {
            // Itens extraídos de zip em sessões anteriores não são mais necessários.
            if let Ok(dir) = app.path().app_cache_dir() {
                let _ = std::fs::remove_dir_all(dir.join("extracted"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::file::startup_files,
            commands::file::file_info,
            commands::file::read_binary,
            commands::file::read_hex,
            commands::file::allow_asset,
            commands::file::open_with_system,
            commands::file::reveal_in_explorer,
            commands::text::read_text,
            commands::text::write_text,
            commands::history::history_list,
            commands::history::history_read,
            commands::sheet::sheet_open,
            commands::sheet::sheet_load,
            commands::sheet::sheet_rows,
            commands::archive::zip_list,
            commands::archive::zip_extract,
            commands::extract::extract_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_skip_executable_flags_and_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "x").unwrap();
        let args = vec![
            "galaxy.exe".to_string(),
            "--flag".to_string(),
            "a.txt".to_string(),
            "nao-existe.txt".to_string(),
        ];
        let found = paths_from_args(&args, dir.path());
        assert_eq!(found.len(), 1);
        assert!(found[0].ends_with("a.txt"));
    }
}
