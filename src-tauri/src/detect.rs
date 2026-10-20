use serde::Serialize;
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Quantos bytes do início do arquivo são lidos para identificar o tipo.
const SNIFF_LEN: u64 = 8192;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    /// Extensão em minúsculas, sem o ponto.
    pub ext: String,
    pub size: u64,
    /// Última modificação em milissegundos desde 1970.
    pub modified: Option<u64>,
    /// Extensão deduzida pelos bytes iniciais, quando reconhecida.
    pub sniffed_ext: Option<String>,
    pub mime: Option<String>,
    pub is_text: bool,
}

pub fn inspect(path: &Path) -> io::Result<FileInfo> {
    let meta = std::fs::metadata(path)?;
    if meta.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "O caminho é uma pasta, não um arquivo.",
        ));
    }

    let mut head = Vec::with_capacity(SNIFF_LEN as usize);
    File::open(path)?.take(SNIFF_LEN).read_to_end(&mut head)?;
    let sniffed = infer::get(&head);

    Ok(FileInfo {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        ext: path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default(),
        size: meta.len(),
        modified: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64),
        sniffed_ext: sniffed.map(|t| t.extension().to_string()),
        mime: sniffed.map(|t| t.mime_type().to_string()),
        is_text: looks_like_text(&head),
    })
}

/// Heurística: sem bytes nulos e quase sem caracteres de controle.
pub fn looks_like_text(buf: &[u8]) -> bool {
    if buf.is_empty() {
        return true;
    }
    // UTF-16 com BOM tem bytes nulos, mas é texto.
    if buf.starts_with(&[0xFF, 0xFE]) || buf.starts_with(&[0xFE, 0xFF]) {
        return true;
    }
    if buf.contains(&0) {
        return false;
    }
    let control = buf
        .iter()
        .filter(|&&b| b < 0x20 && !matches!(b, b'\t' | b'\n' | b'\r' | 0x0C | 0x1B))
        .count();
    control * 100 / buf.len() < 2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_detection() {
        assert!(looks_like_text(b"ola, mundo\r\nlinha 2\t"));
        assert!(looks_like_text("acentuação".as_bytes()));
        assert!(looks_like_text(&[0xFF, 0xFE, b'a', 0]));
        assert!(!looks_like_text(&[0x89, b'P', b'N', b'G', 0, 0, 1]));
        assert!(looks_like_text(b""));
    }

    #[test]
    fn inspect_reports_extension_and_sniffed_type() {
        let dir = tempfile::tempdir().unwrap();
        let png = dir.path().join("Foto.PNG");
        std::fs::write(&png, [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]).unwrap();
        let info = inspect(&png).unwrap();
        assert_eq!(info.ext, "png");
        assert_eq!(info.name, "Foto.PNG");
        assert_eq!(info.sniffed_ext.as_deref(), Some("png"));
        assert!(!info.is_text);
        assert_eq!(info.size, 10);

        assert!(inspect(dir.path()).is_err());
    }
}
