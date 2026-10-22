use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::text::decode;
use super::{io_err, to_err, CmdResult};
use crate::history::{self, Version};

pub fn base_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    app.path().app_data_dir().map_err(to_err)
}

#[tauri::command(async)]
pub fn history_list(app: AppHandle, path: String) -> CmdResult<Vec<Version>> {
    Ok(history::list(&base_dir(&app)?, Path::new(&path)))
}

/// Texto de uma versão guardada, já decodificado.
#[tauri::command(async)]
pub fn history_read(app: AppHandle, path: String, id: String) -> CmdResult<String> {
    let bytes = history::read(&base_dir(&app)?, Path::new(&path), &id).map_err(io_err)?;
    Ok(decode(&bytes).text)
}
