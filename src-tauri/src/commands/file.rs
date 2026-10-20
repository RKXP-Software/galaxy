use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use super::{io_err, to_err, CmdResult};
use crate::detect::{self, FileInfo};
use crate::StartupFiles;

/// Maior trecho que a visualização hexadecimal pode pedir de uma vez.
const MAX_HEX_CHUNK: usize = 1024 * 1024;

#[tauri::command]
pub fn startup_files(state: State<'_, StartupFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Identifica o arquivo e libera o acesso a ele pelo asset protocol,
/// para que imagens, mídia e PDF sejam lidos direto do disco.
#[tauri::command(async)]
pub fn file_info(app: AppHandle, path: String) -> CmdResult<FileInfo> {
    let path = PathBuf::from(path);
    let info = detect::inspect(&path).map_err(io_err)?;
    app.asset_protocol_scope().allow_file(&path).map_err(to_err)?;
    Ok(info)
}

/// Conteúdo binário completo, para bibliotecas que exigem um ArrayBuffer.
#[tauri::command(async)]
pub fn read_binary(path: String) -> CmdResult<Response> {
    std::fs::read(path).map(Response::new).map_err(io_err)
}

#[tauri::command(async)]
pub fn read_hex(path: String, offset: u64, length: usize) -> CmdResult<Response> {
    let mut file = File::open(path).map_err(io_err)?;
    file.seek(SeekFrom::Start(offset)).map_err(io_err)?;
    let mut buf = Vec::with_capacity(length.min(MAX_HEX_CHUNK));
    file.take(length.min(MAX_HEX_CHUNK) as u64)
        .read_to_end(&mut buf)
        .map_err(io_err)?;
    Ok(Response::new(buf))
}

/// Libera um arquivo extra no asset protocol (ex.: imagem citada num markdown).
#[tauri::command]
pub fn allow_asset(app: AppHandle, path: String) -> CmdResult<()> {
    app.asset_protocol_scope().allow_file(path).map_err(to_err)
}

#[tauri::command]
pub fn open_with_system(app: AppHandle, path: String) -> CmdResult<()> {
    app.opener().open_path(path, None::<&str>).map_err(to_err)
}

#[tauri::command]
pub fn reveal_in_explorer(app: AppHandle, path: String) -> CmdResult<()> {
    app.opener().reveal_item_in_dir(path).map_err(to_err)
}
