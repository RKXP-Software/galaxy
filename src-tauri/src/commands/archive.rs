use std::fs::File;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::BufReader;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

use super::{io_err, to_err, CmdResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipEntryInfo {
    pub index: usize,
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
    pub encrypted: bool,
    pub modified: Option<String>,
}

fn open_zip(path: &Path) -> CmdResult<ZipArchive<BufReader<File>>> {
    let file = File::open(path).map_err(io_err)?;
    ZipArchive::new(BufReader::new(file)).map_err(|e| format!("Arquivo zip inválido: {e}"))
}

pub fn list_entries(path: &Path) -> CmdResult<Vec<ZipEntryInfo>> {
    let mut zip = open_zip(path)?;
    (0..zip.len())
        .map(|index| {
            // by_index_raw não descompacta nem falha em itens com senha.
            let entry = zip.by_index_raw(index).map_err(to_err)?;
            Ok(ZipEntryInfo {
                index,
                name: entry
                    .name()
                    .map(|n| n.into_owned())
                    .unwrap_or_else(|_| String::from_utf8_lossy(entry.name_raw()).into_owned()),
                size: entry.size(),
                compressed_size: entry.compressed_size(),
                is_dir: entry.is_dir(),
                encrypted: entry.encrypted(),
                modified: entry.last_modified().map(|d| {
                    format!(
                        "{:02}/{:02}/{} {:02}:{:02}",
                        d.day(),
                        d.month(),
                        d.year(),
                        d.hour(),
                        d.minute()
                    )
                }),
            })
        })
        .collect()
}

/// Extrai um item para `dest_root`, recusando caminhos que escapem da pasta.
pub fn extract_entry(path: &Path, index: usize, dest_root: &Path) -> CmdResult<PathBuf> {
    let mut zip = open_zip(path)?;
    let mut entry = zip.by_index(index).map_err(|e| {
        if matches!(e, zip::result::ZipError::UnsupportedArchive(_)) {
            "Este item está protegido por senha ou usa compressão não suportada.".to_string()
        } else {
            e.to_string()
        }
    })?;
    if entry.is_dir() {
        return Err("O item selecionado é uma pasta.".into());
    }
    let relative = entry
        .enclosed_name()
        .ok_or_else(|| "O item tem um caminho inválido dentro do zip.".to_string())?;
    let dest = dest_root.join(relative);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(io_err)?;
    }
    let mut out = File::create(&dest).map_err(io_err)?;
    std::io::copy(&mut entry, &mut out).map_err(io_err)?;
    Ok(dest)
}

#[tauri::command(async)]
pub fn zip_list(path: String) -> CmdResult<Vec<ZipEntryInfo>> {
    list_entries(Path::new(&path))
}

#[tauri::command(async)]
pub fn zip_extract(app: AppHandle, path: String, index: usize) -> CmdResult<String> {
    // Uma pasta por zip (caminho + data de modificação), dentro do cache do app.
    let modified = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    let root = app
        .path()
        .app_cache_dir()
        .map_err(to_err)?
        .join("extracted")
        .join(format!("{:016x}", hasher.finish()));

    let dest = extract_entry(Path::new(&path), index, &root)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn sample_zip(dir: &Path) -> PathBuf {
        let path = dir.join("pacote.zip");
        let mut writer = zip::ZipWriter::new(File::create(&path).unwrap());
        writer.add_directory("docs/", SimpleFileOptions::default()).unwrap();
        writer.start_file("docs/leia-me.txt", SimpleFileOptions::default()).unwrap();
        writer.write_all("conteúdo".as_bytes()).unwrap();
        writer.finish().unwrap();
        path
    }

    #[test]
    fn lists_and_extracts() {
        let dir = tempfile::tempdir().unwrap();
        let zip_path = sample_zip(dir.path());

        let entries = list_entries(&zip_path).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, "docs/leia-me.txt");
        assert_eq!(entries[1].size, "conteúdo".len() as u64);

        let out = extract_entry(&zip_path, 1, &dir.path().join("out")).unwrap();
        assert_eq!(std::fs::read_to_string(out).unwrap(), "conteúdo");
        assert!(extract_entry(&zip_path, 0, &dir.path().join("out")).is_err());
    }
}
