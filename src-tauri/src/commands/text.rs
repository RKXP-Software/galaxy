use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};
use serde::Serialize;

use super::{io_err, CmdResult};
use crate::detect::{self, FileInfo};

/// Acima disso o arquivo abre só para leitura e truncado.
const MAX_EDITABLE: u64 = 50 * 1024 * 1024;
/// Quantos bytes o detector de codificação analisa.
const DETECT_LEN: usize = 1024 * 1024;

/// Prefixo do erro devolvido quando o texto tem caracteres que a
/// codificação original não representa; o front oferece salvar em UTF-8.
pub const UNMAPPABLE: &str = "UNMAPPABLE";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub content: String,
    pub encoding: String,
    pub bom: bool,
    /// "crlf" ou "lf".
    pub line_ending: &'static str,
    pub truncated: bool,
    pub read_only: bool,
    /// Houve bytes inválidos na decodificação (trocados por �).
    pub had_errors: bool,
}

pub struct Decoded {
    pub text: String,
    pub encoding: &'static Encoding,
    pub bom: bool,
    pub had_errors: bool,
}

/// Decodifica bytes de texto: BOM, depois UTF-8 válido, depois o palpite do chardetng.
pub fn decode(bytes: &[u8]) -> Decoded {
    if let Some((encoding, bom_len)) = Encoding::for_bom(bytes) {
        let (text, had_errors) = encoding.decode_without_bom_handling(&bytes[bom_len..]);
        return Decoded { text: text.into_owned(), encoding, bom: true, had_errors };
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => {
            return Decoded { text: s.to_owned(), encoding: UTF_8, bom: false, had_errors: false };
        }
        // Só o último caractere ficou cortado (arquivo truncado): ainda é UTF-8.
        Err(e) if e.error_len().is_none() && e.valid_up_to() > 0 => {
            let text = String::from_utf8_lossy(&bytes[..e.valid_up_to()]).into_owned();
            return Decoded { text, encoding: UTF_8, bom: false, had_errors: false };
        }
        Err(_) => {}
    }
    let encoding = guess_encoding(bytes);
    let (text, had_errors) = encoding.decode_without_bom_handling(bytes);
    Decoded { text: text.into_owned(), encoding, bom: false, had_errors }
}

pub fn guess_encoding(bytes: &[u8]) -> &'static Encoding {
    let mut detector = EncodingDetector::new(Iso2022JpDetection::Deny);
    detector.feed(&bytes[..bytes.len().min(DETECT_LEN)], true);
    detector.guess(None, Utf8Detection::Allow)
}

fn line_ending_of(text: &str) -> &'static str {
    match text.find('\n') {
        Some(i) if i > 0 && text.as_bytes()[i - 1] == b'\r' => "crlf",
        _ => "lf",
    }
}

pub fn read_text_file(path: &Path) -> std::io::Result<TextFile> {
    let size = std::fs::metadata(path)?.len();
    let truncated = size > MAX_EDITABLE;
    let mut bytes = Vec::with_capacity(size.min(MAX_EDITABLE) as usize);
    File::open(path)?.take(MAX_EDITABLE).read_to_end(&mut bytes)?;

    let decoded = decode(&bytes);
    Ok(TextFile {
        line_ending: line_ending_of(&decoded.text),
        content: decoded.text,
        encoding: decoded.encoding.name().to_string(),
        bom: decoded.bom,
        truncated,
        read_only: truncated,
        had_errors: decoded.had_errors,
    })
}

/// Codifica o texto na codificação pedida, com as quebras de linha originais.
pub fn encode(content: &str, encoding: &str, bom: bool, line_ending: &str) -> Result<Vec<u8>, String> {
    let normalized = content.replace("\r\n", "\n");
    let text = if line_ending == "crlf" { normalized.replace('\n', "\r\n") } else { normalized };
    let encoding = Encoding::for_label(encoding.as_bytes()).unwrap_or(UTF_8);

    let mut out = Vec::with_capacity(text.len() + 3);
    if encoding == UTF_16LE || encoding == UTF_16BE {
        let le = encoding == UTF_16LE;
        if bom {
            out.extend_from_slice(if le { &[0xFF, 0xFE] } else { &[0xFE, 0xFF] });
        }
        for unit in text.encode_utf16() {
            out.extend_from_slice(&if le { unit.to_le_bytes() } else { unit.to_be_bytes() });
        }
        return Ok(out);
    }

    if bom && encoding == UTF_8 {
        out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    let (bytes, _, had_errors) = encoding.encode(&text);
    if had_errors {
        return Err(format!(
            "{UNMAPPABLE}: o texto tem caracteres que não existem na codificação {}.",
            encoding.name()
        ));
    }
    out.extend_from_slice(&bytes);
    Ok(out)
}

/// Grava num arquivo temporário ao lado e troca pelo original,
/// para não corromper o arquivo se algo falhar no meio.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!(".{name}.galaxy-tmp"));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

#[tauri::command(async)]
pub fn read_text(path: String) -> CmdResult<TextFile> {
    read_text_file(Path::new(&path)).map_err(io_err)
}

#[tauri::command(async)]
pub fn write_text(
    path: String,
    content: String,
    encoding: String,
    bom: bool,
    line_ending: String,
) -> CmdResult<FileInfo> {
    let path = PathBuf::from(path);
    let bytes = encode(&content, &encoding, bom, &line_ending)?;
    write_atomic(&path, &bytes).map_err(io_err)?;
    detect::inspect(&path).map_err(io_err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_and_bom() {
        let d = decode("olá".as_bytes());
        assert_eq!((d.text.as_str(), d.encoding, d.bom), ("olá", UTF_8, false));

        let d = decode(&[0xEF, 0xBB, 0xBF, b'o', b'i']);
        assert_eq!((d.text.as_str(), d.encoding, d.bom), ("oi", UTF_8, true));

        let d = decode(&[0xFF, 0xFE, b'o', 0, b'i', 0]);
        assert_eq!((d.text.as_str(), d.encoding, d.bom), ("oi", UTF_16LE, true));
    }

    #[test]
    fn decodes_windows_1252() {
        // "Ação e coração" em Windows-1252.
        let bytes = b"A\xe7\xe3o e cora\xe7\xe3o, tamb\xe9m acentua\xe7\xe3o \xe9 comum aqui.";
        let d = decode(bytes);
        assert_eq!(d.encoding.name(), "windows-1252");
        assert!(d.text.starts_with("Ação e coração"));
    }

    #[test]
    fn truncated_utf8_is_still_utf8() {
        let mut bytes = "texto com ç".as_bytes().to_vec();
        bytes.pop(); // corta o segundo byte do "ç"
        let d = decode(&bytes);
        assert_eq!(d.encoding, UTF_8);
        assert_eq!(d.text, "texto com ");
    }

    #[test]
    fn encode_roundtrip_keeps_line_endings_and_encoding() {
        let bytes = encode("a\nção", "windows-1252", false, "crlf").unwrap();
        assert_eq!(bytes, b"a\r\n\xe7\xe3o");

        let bytes = encode("a\r\nb", "UTF-8", true, "lf").unwrap();
        assert_eq!(bytes, [0xEF, 0xBB, 0xBF, b'a', b'\n', b'b']);

        let bytes = encode("oi", "UTF-16LE", true, "lf").unwrap();
        assert_eq!(bytes, [0xFF, 0xFE, b'o', 0, b'i', 0]);
    }

    #[test]
    fn encode_rejects_unmappable_chars() {
        let err = encode("emoji 😀", "windows-1252", false, "lf").unwrap_err();
        assert!(err.starts_with(UNMAPPABLE));
    }

    #[test]
    fn write_then_read() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nota.txt");
        std::fs::write(&path, b"velho").unwrap();
        let bytes = encode("novo\ntexto", "UTF-8", false, "crlf").unwrap();
        write_atomic(&path, &bytes).unwrap();
        let file = read_text_file(&path).unwrap();
        assert_eq!(file.content, "novo\r\ntexto");
        assert_eq!(file.line_ending, "crlf");
        assert!(!file.read_only);
    }
}
