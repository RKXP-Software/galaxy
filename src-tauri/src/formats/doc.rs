//! Texto de documentos do Word 97-2003 (.doc), formato binário MS-DOC.
//!
//! O texto fica no stream "WordDocument", espalhado em "peças" descritas
//! pela tabela de peças (CLX) do stream "0Table" ou "1Table". Cada peça é
//! Windows-1252 (1 byte por caractere) ou UTF-16LE.

use std::io::{Cursor, Read};

use encoding_rs::WINDOWS_1252;

use super::Block;

const WORD_IDENT: u16 = 0xA5EC;
const NFIB_WORD97: u16 = 0x00C0;
const FLAG_ENCRYPTED: u16 = 0x0100;
const FLAG_WHICH_TABLE: u16 = 0x0200;
/// Posição de fcClx dentro do FibRgFcLcb97 (34º par fc/lcb).
const CLX_PAIR_INDEX: usize = 33;

fn u16_at(buf: &[u8], pos: usize) -> Option<u16> {
    buf.get(pos..pos + 2).map(|b| u16::from_le_bytes([b[0], b[1]]))
}

fn u32_at(buf: &[u8], pos: usize) -> Option<u32> {
    buf.get(pos..pos + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn invalid() -> String {
    "O arquivo .doc está corrompido ou num formato não suportado.".into()
}

pub fn extract(bytes: &[u8]) -> Result<Vec<Block>, String> {
    let mut cfb = cfb::CompoundFile::open(Cursor::new(bytes)).map_err(|_| invalid())?;
    let read_stream = |cfb: &mut cfb::CompoundFile<Cursor<&[u8]>>, name: &str| {
        let mut data = Vec::new();
        cfb.open_stream(name)
            .and_then(|mut s| s.read_to_end(&mut data))
            .map(|_| data)
    };

    let word = read_stream(&mut cfb, "/WordDocument")
        .map_err(|_| "Não é um documento do Word (stream WordDocument ausente).".to_string())?;
    if u16_at(&word, 0) != Some(WORD_IDENT) {
        return Err(invalid());
    }
    if u16_at(&word, 2).is_none_or(|nfib| nfib < NFIB_WORD97) {
        return Err("Documentos do Word 6/95 não são suportados. Abra no app padrão.".into());
    }
    let flags = u16_at(&word, 0x0A).ok_or_else(invalid)?;
    if flags & FLAG_ENCRYPTED != 0 {
        return Err("O documento está protegido por senha.".into());
    }
    let table_name = if flags & FLAG_WHICH_TABLE != 0 { "/1Table" } else { "/0Table" };
    let table = read_stream(&mut cfb, table_name).map_err(|_| invalid())?;

    // FIB: FibBase (32 bytes), csw + fibRgW, cslw + fibRgLw, cbRgFcLcb + fibRgFcLcb.
    let csw = u16_at(&word, 32).ok_or_else(invalid)? as usize;
    let lw_start = 34 + csw * 2;
    let cslw = u16_at(&word, lw_start).ok_or_else(invalid)? as usize;
    let rg_lw = lw_start + 2;
    let ccp_text = u32_at(&word, rg_lw + 3 * 4).ok_or_else(invalid)?;
    let fc_lcb_start = rg_lw + cslw * 4;
    let pairs = u16_at(&word, fc_lcb_start).ok_or_else(invalid)? as usize;
    if pairs <= CLX_PAIR_INDEX {
        return Err(invalid());
    }
    let clx_pos = fc_lcb_start + 2 + CLX_PAIR_INDEX * 8;
    let fc_clx = u32_at(&word, clx_pos).ok_or_else(invalid)? as usize;
    let lcb_clx = u32_at(&word, clx_pos + 4).ok_or_else(invalid)? as usize;
    let clx = table.get(fc_clx..fc_clx + lcb_clx).ok_or_else(invalid)?;

    let raw = read_pieces(&word, find_plc_pcd(clx)?, ccp_text)?;
    Ok(text_to_blocks(&raw))
}

/// Pula as estruturas Prc do CLX e devolve a PlcPcd (tabela de peças).
fn find_plc_pcd(clx: &[u8]) -> Result<&[u8], String> {
    let mut i = 0;
    while i < clx.len() {
        match clx[i] {
            0x01 => {
                let cb = u16_at(clx, i + 1).ok_or_else(invalid)? as i16;
                i += 3 + cb.max(0) as usize;
            }
            0x02 => {
                let lcb = u32_at(clx, i + 1).ok_or_else(invalid)? as usize;
                return clx.get(i + 5..i + 5 + lcb).ok_or_else(invalid);
            }
            _ => return Err(invalid()),
        }
    }
    Err(invalid())
}

/// Junta o texto principal (os primeiros `ccp_text` caracteres) das peças.
fn read_pieces(word: &[u8], plc: &[u8], ccp_text: u32) -> Result<String, String> {
    if plc.len() < 4 {
        return Err(invalid());
    }
    let n = (plc.len() - 4) / 12;
    let cp = |k: usize| u32_at(plc, k * 4).ok_or_else(invalid);
    let mut text = String::new();
    for k in 0..n {
        let (start, end) = (cp(k)?, cp(k + 1)?.min(ccp_text));
        if start >= ccp_text {
            break;
        }
        let count = end.saturating_sub(start) as usize;
        let fc_compressed = u32_at(plc, (n + 1) * 4 + k * 8 + 2).ok_or_else(invalid)?;
        let fc = (fc_compressed & 0x3FFF_FFFF) as usize;
        if fc_compressed & 0x4000_0000 != 0 {
            let offset = fc / 2;
            let piece = word.get(offset..offset + count).ok_or_else(invalid)?;
            text.push_str(&WINDOWS_1252.decode_without_bom_handling(piece).0);
        } else {
            let piece = word.get(fc..fc + count * 2).ok_or_else(invalid)?;
            let units: Vec<u16> = piece.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
            text.push_str(&String::from_utf16_lossy(&units));
        }
    }
    Ok(text)
}

/// Converte os caracteres especiais do Word em parágrafos.
/// Campos (0x13 código 0x14 resultado 0x15) mostram só o resultado.
pub fn text_to_blocks(raw: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut current = String::new();
    // Para cada campo aberto: true enquanto ainda está no código do campo.
    let mut fields: Vec<bool> = Vec::new();
    let mut prev = '\0';

    let flush = |current: &mut String, blocks: &mut Vec<Block>| {
        let text = current.trim_end();
        if !text.trim().is_empty() {
            blocks.push(Block::new("p", text));
        }
        current.clear();
    };

    for ch in raw.chars() {
        match ch {
            '\u{13}' => fields.push(true),
            '\u{14}' => {
                if let Some(last) = fields.last_mut() {
                    *last = false;
                }
            }
            '\u{15}' => {
                fields.pop();
            }
            _ if fields.iter().any(|&in_code| in_code) => {}
            '\r' | '\u{0C}' => flush(&mut current, &mut blocks),
            // Fim de célula; dois seguidos marcam o fim da linha da tabela.
            '\u{07}' => {
                if prev == '\u{07}' {
                    flush(&mut current, &mut blocks);
                } else {
                    current.push('\t');
                }
            }
            '\u{0B}' => current.push('\n'),
            '\u{1E}' => current.push('-'),
            '\t' => current.push('\t'),
            c if (c as u32) < 0x20 || c == '\u{1F}' => {}
            c => current.push(c),
        }
        prev = ch;
    }
    flush(&mut current, &mut blocks);
    blocks
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Monta um .doc mínimo: FIB + texto numa peça + tabela de peças.
    fn build_doc(text: &str, compressed: bool) -> Vec<u8> {
        const TEXT_OFFSET: usize = 1024;
        let mut word = vec![0u8; TEXT_OFFSET];
        word[0..2].copy_from_slice(&WORD_IDENT.to_le_bytes());
        word[2..4].copy_from_slice(&0x00C1u16.to_le_bytes());
        word[32..34].copy_from_slice(&14u16.to_le_bytes()); // csw
        word[62..64].copy_from_slice(&22u16.to_le_bytes()); // cslw
        let ccp = text.encode_utf16().count() as u32;
        word[76..80].copy_from_slice(&ccp.to_le_bytes()); // ccpText
        word[152..154].copy_from_slice(&93u16.to_le_bytes()); // cbRgFcLcb

        let fc = if compressed {
            word.extend(WINDOWS_1252.encode(text).0.iter());
            ((TEXT_OFFSET * 2) as u32) | 0x4000_0000
        } else {
            for u in text.encode_utf16() {
                word.extend_from_slice(&u.to_le_bytes());
            }
            TEXT_OFFSET as u32
        };

        let mut plc = Vec::new();
        plc.extend_from_slice(&0u32.to_le_bytes());
        plc.extend_from_slice(&ccp.to_le_bytes());
        plc.extend_from_slice(&0u16.to_le_bytes());
        plc.extend_from_slice(&fc.to_le_bytes());
        plc.extend_from_slice(&0u16.to_le_bytes());
        let mut clx = vec![0x01, 0x02, 0x00, 0xAA, 0xBB]; // um Prc qualquer antes
        clx.push(0x02);
        clx.extend_from_slice(&(plc.len() as u32).to_le_bytes());
        clx.extend_from_slice(&plc);

        let clx_pos = 154 + CLX_PAIR_INDEX * 8;
        word[clx_pos..clx_pos + 4].copy_from_slice(&0u32.to_le_bytes());
        word[clx_pos + 4..clx_pos + 8].copy_from_slice(&(clx.len() as u32).to_le_bytes());

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut comp = cfb::CompoundFile::create(&mut cursor).unwrap();
            comp.create_stream("/WordDocument").unwrap().write_all(&word).unwrap();
            comp.create_stream("/0Table").unwrap().write_all(&clx).unwrap();
            comp.flush().unwrap();
        }
        cursor.into_inner()
    }

    #[test]
    fn extracts_compressed_and_unicode_pieces() {
        for compressed in [true, false] {
            let doc = build_doc("Título\rParágrafo com ação.\r", compressed);
            let blocks = extract(&doc).unwrap();
            assert_eq!(
                blocks,
                vec![Block::new("p", "Título"), Block::new("p", "Parágrafo com ação.")]
            );
        }
    }

    #[test]
    fn fields_show_only_result_and_tables_use_tabs() {
        let raw = "Veja \u{13} HYPERLINK \"x\" \u{14}o site\u{15} agora\rA\u{07}B\u{07}\u{07}C\u{07}D\u{07}\u{07}";
        let blocks = text_to_blocks(raw);
        assert_eq!(blocks[0].text, "Veja o site agora");
        assert_eq!(blocks[1].text, "A\tB");
        assert_eq!(blocks[2].text, "C\tD");
    }

    #[test]
    fn rejects_non_word_files() {
        assert!(extract(b"isto nao e um doc").is_err());
    }
}
