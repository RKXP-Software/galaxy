//! Histórico de versões salvas: uma cópia a cada salvamento, na pasta de
//! dados do app (`history/<hash do caminho>/<ms>-<hash do conteúdo>.snap`).
//! Serve para comparar o arquivo atual com versões anteriores.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// Quantas versões ficam guardadas por arquivo.
pub const MAX_VERSIONS: usize = 50;
/// Arquivos maiores que isso não entram no histórico.
pub const MAX_SNAPSHOT_SIZE: usize = 5 * 1024 * 1024;

const EXTENSION: &str = ".snap";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Version {
    /// Nome do arquivo de cópia; é o identificador usado para ler a versão.
    pub id: String,
    /// Quando foi guardada, em milissegundos desde 1970.
    pub timestamp: u64,
    pub size: u64,
}

/// FNV-1a de 64 bits: estável entre versões do Rust (o DefaultHasher não é).
fn fnv1a(data: &[u8]) -> u64 {
    data.iter().fold(0xcbf2_9ce4_8422_2325, |h, &b| (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3))
}

fn dir_for(base: &Path, file: &Path) -> PathBuf {
    let key = file.to_string_lossy().to_lowercase();
    base.join("history").join(format!("{:016x}", fnv1a(key.as_bytes())))
}

fn parse_id(id: &str) -> Option<(u64, u64)> {
    let stem = id.strip_suffix(EXTENSION)?;
    let (ms, hash) = stem.split_once('-')?;
    if ms.len() != 13 || hash.len() != 16 {
        return None;
    }
    Some((ms.parse().ok()?, u64::from_str_radix(hash, 16).ok()?))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Versões do arquivo, da mais nova para a mais antiga.
pub fn list(base: &Path, file: &Path) -> Vec<Version> {
    let Ok(entries) = fs::read_dir(dir_for(base, file)) else { return Vec::new() };
    let mut versions: Vec<Version> = entries
        .flatten()
        .filter_map(|e| {
            let id = e.file_name().to_string_lossy().into_owned();
            let (timestamp, _) = parse_id(&id)?;
            Some(Version { id, timestamp, size: e.metadata().map(|m| m.len()).unwrap_or(0) })
        })
        .collect();
    versions.sort_by(|a, b| b.id.cmp(&a.id));
    versions
}

/// Guarda `bytes` como nova versão, a menos que seja idêntica à mais recente
/// ou grande demais. Devolve a versão criada.
pub fn snapshot(base: &Path, file: &Path, bytes: &[u8]) -> io::Result<Option<Version>> {
    if bytes.len() > MAX_SNAPSHOT_SIZE {
        return Ok(None);
    }
    let dir = dir_for(base, file);
    fs::create_dir_all(&dir)?;

    let hash = fnv1a(bytes);
    let existing = list(base, file);
    let latest = existing.first();
    if latest.and_then(|v| parse_id(&v.id)).is_some_and(|(_, h)| h == hash) {
        return Ok(None);
    }
    // O tempo nunca anda para trás, para a ordem pelo nome valer sempre.
    let ms = latest.map_or_else(now_ms, |v| now_ms().max(v.timestamp + 1));
    let id = format!("{ms:013}-{hash:016x}{EXTENSION}");
    fs::write(dir.join(&id), bytes)?;

    for old in existing.iter().skip(MAX_VERSIONS - 1) {
        let _ = fs::remove_file(dir.join(&old.id));
    }
    Ok(Some(Version { id, timestamp: ms, size: bytes.len() as u64 }))
}

/// Conteúdo de uma versão. Recusa ids que não tenham o formato esperado.
pub fn read(base: &Path, file: &Path, id: &str) -> io::Result<Vec<u8>> {
    if parse_id(id).is_none() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Versão inválida."));
    }
    fs::read(dir_for(base, file).join(id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("nota.txt");
        (dir, file)
    }

    #[test]
    fn snapshots_are_listed_newest_first_and_readable() {
        let (dir, file) = setup();
        let v1 = snapshot(dir.path(), &file, b"um").unwrap().unwrap();
        let v2 = snapshot(dir.path(), &file, b"dois").unwrap().unwrap();
        let listed = list(dir.path(), &file);
        assert_eq!(listed.iter().map(|v| v.id.as_str()).collect::<Vec<_>>(), [v2.id.as_str(), v1.id.as_str()]);
        assert!(v2.timestamp > v1.timestamp);
        assert_eq!(listed[1].size, 2);
        assert_eq!(read(dir.path(), &file, &v1.id).unwrap(), b"um");
    }

    #[test]
    fn identical_content_is_not_stored_twice() {
        let (dir, file) = setup();
        assert!(snapshot(dir.path(), &file, b"igual").unwrap().is_some());
        assert!(snapshot(dir.path(), &file, b"igual").unwrap().is_none());
        assert!(snapshot(dir.path(), &file, b"outro").unwrap().is_some());
        // Voltar ao conteúdo antigo cria uma versão nova (a mais recente é diferente).
        assert!(snapshot(dir.path(), &file, b"igual").unwrap().is_some());
        assert_eq!(list(dir.path(), &file).len(), 3);
    }

    #[test]
    fn keeps_only_the_latest_versions() {
        let (dir, file) = setup();
        for i in 0..MAX_VERSIONS + 5 {
            snapshot(dir.path(), &file, format!("versão {i}").as_bytes()).unwrap();
        }
        let listed = list(dir.path(), &file);
        assert_eq!(listed.len(), MAX_VERSIONS);
        let newest = read(dir.path(), &file, &listed[0].id).unwrap();
        assert_eq!(newest, format!("versão {}", MAX_VERSIONS + 4).as_bytes());
    }

    #[test]
    fn histories_are_separate_per_file_and_case_insensitive() {
        let (dir, file) = setup();
        snapshot(dir.path(), &file, b"a").unwrap();
        assert_eq!(list(dir.path(), &dir.path().join("OUTRO.txt")).len(), 0);
        let upper = PathBuf::from(file.to_string_lossy().to_uppercase());
        assert_eq!(list(dir.path(), &upper).len(), 1);
    }

    #[test]
    fn huge_files_are_skipped_and_bad_ids_rejected() {
        let (dir, file) = setup();
        assert!(snapshot(dir.path(), &file, &vec![0u8; MAX_SNAPSHOT_SIZE + 1]).unwrap().is_none());
        assert!(list(dir.path(), &file).is_empty());
        for bad in ["../../segredo", "..\\x.snap", "123-abc.snap", "0000000000001-zzzzzzzzzzzzzzzz.snap"] {
            assert!(read(dir.path(), &file, bad).is_err(), "{bad}");
        }
    }
}
