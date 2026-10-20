use std::path::Path;

use serde::Serialize;

use super::text::decode;
use super::{io_err, CmdResult};
use crate::formats::{doc, odt, rtf, Block};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedDoc {
    /// Formato real identificado: "doc", "rtf", "odt" ou "text".
    pub format: &'static str,
    pub blocks: Vec<Block>,
}

const OLE_MAGIC: [u8; 4] = [0xD0, 0xCF, 0x11, 0xE0];

/// Extrai o texto de formatos sem visualizador fiel (doc, rtf, odt).
/// Decide pelo conteúdo, não só pela extensão: muitos ".doc" são RTF.
pub fn extract(path: &Path) -> CmdResult<ExtractedDoc> {
    let bytes = std::fs::read(path).map_err(io_err)?;
    if bytes.starts_with(b"{\\rtf") {
        return Ok(ExtractedDoc { format: "rtf", blocks: rtf::extract(&bytes)? });
    }
    if bytes.starts_with(&OLE_MAGIC) {
        return Ok(ExtractedDoc { format: "doc", blocks: doc::extract(&bytes)? });
    }
    if bytes.starts_with(b"PK") {
        return Ok(ExtractedDoc { format: "odt", blocks: odt::extract(&bytes)? });
    }
    if crate::detect::looks_like_text(&bytes[..bytes.len().min(8192)]) {
        let text = decode(&bytes).text;
        return Ok(ExtractedDoc { format: "text", blocks: Block::paragraphs(&text) });
    }
    Err("Formato de documento não reconhecido.".into())
}

#[tauri::command(async)]
pub fn extract_document(path: String) -> CmdResult<ExtractedDoc> {
    extract(Path::new(&path))
}
