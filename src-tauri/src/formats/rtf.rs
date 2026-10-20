//! Texto de arquivos RTF: interpreta grupos e palavras de controle,
//! ignora tabelas de fontes, imagens, cabeçalhos e outros destinos.

use encoding_rs::{Encoding, WINDOWS_1252};

use super::Block;

/// Destinos cujo conteúdo não é texto do documento.
const SKIP_DESTINATIONS: &[&str] = &[
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "headerl",
    "headerr", "headerf", "footer", "footerl", "footerr", "footerf", "listtable",
    "listoverridetable", "rsidtbl", "generator", "xmlnstbl", "themedata",
    "colorschememapping", "datastore", "latentstyles", "pgdsctbl", "fldinst", "filetbl",
    "revtbl", "bkmkstart", "bkmkend", "nonshppict", "shpinst", "footnote", "annotation",
    "atnid", "atnauthor", "xe", "tc", "mmathPr", "operator", "author", "title",
];

#[derive(Clone, Copy)]
struct GroupState {
    skip: bool,
    /// Quantos caracteres de reserva seguem cada \uN.
    uc: usize,
}

struct Parser {
    blocks: Vec<Block>,
    current: String,
    bytes: Vec<u8>,
    codepage: &'static Encoding,
    pending_high_surrogate: Option<u16>,
}

impl Parser {
    fn flush_bytes(&mut self) {
        if !self.bytes.is_empty() {
            let (text, _) = self.codepage.decode_without_bom_handling(&self.bytes);
            self.current.push_str(&text);
            self.bytes.clear();
        }
    }

    fn push_char(&mut self, c: char) {
        self.flush_bytes();
        self.current.push(c);
    }

    fn end_paragraph(&mut self) {
        self.flush_bytes();
        let text = self.current.trim_end();
        if !text.trim().is_empty() {
            self.blocks.push(Block::new("p", text));
        }
        self.current.clear();
    }

    fn push_unicode(&mut self, value: i32) {
        // \u usa inteiro de 16 bits com sinal.
        let unit = if value < 0 { (value + 65536) as u16 } else { value as u16 };
        if (0xD800..0xDC00).contains(&unit) {
            self.pending_high_surrogate = Some(unit);
            return;
        }
        let units: Vec<u16> = match self.pending_high_surrogate.take() {
            Some(high) => vec![high, unit],
            None => vec![unit],
        };
        for c in char::decode_utf16(units) {
            self.push_char(c.unwrap_or('\u{FFFD}'));
        }
    }
}

fn codepage_encoding(cp: i32) -> Option<&'static Encoding> {
    let label = match cp {
        874 | 1250..=1258 => format!("windows-{cp}"),
        932 => "shift_jis".into(),
        936 => "gbk".into(),
        949 => "euc-kr".into(),
        950 => "big5".into(),
        10000 => "macintosh".into(),
        _ => return None,
    };
    Encoding::for_label(label.as_bytes())
}

pub fn extract(data: &[u8]) -> Result<Vec<Block>, String> {
    if !data.starts_with(b"{\\rtf") {
        return Err("Arquivo RTF inválido.".into());
    }
    let mut parser = Parser {
        blocks: Vec::new(),
        current: String::new(),
        bytes: Vec::new(),
        codepage: WINDOWS_1252,
        pending_high_surrogate: None,
    };
    let mut stack: Vec<GroupState> = Vec::new();
    let mut state = GroupState { skip: false, uc: 1 };
    // Caracteres de reserva ainda a ignorar depois de um \uN.
    let mut skip_chars = 0usize;
    let mut i = 0;

    while i < data.len() {
        let c = data[i];
        match c {
            b'{' => {
                parser.flush_bytes();
                stack.push(state);
                skip_chars = 0;
                i += 1;
            }
            b'}' => {
                parser.flush_bytes();
                state = stack.pop().unwrap_or(GroupState { skip: false, uc: 1 });
                skip_chars = 0;
                i += 1;
            }
            b'\\' => {
                i += 1;
                let Some(&next) = data.get(i) else { break };
                if next.is_ascii_alphabetic() {
                    let start = i;
                    while i < data.len() && data[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                    let word = std::str::from_utf8(&data[start..i]).unwrap_or("");
                    let negative = data.get(i) == Some(&b'-');
                    if negative {
                        i += 1;
                    }
                    let digits_start = i;
                    while i < data.len() && data[i].is_ascii_digit() {
                        i += 1;
                    }
                    let param: Option<i32> = std::str::from_utf8(&data[digits_start..i])
                        .ok()
                        .and_then(|s| s.parse().ok())
                        .map(|n: i32| if negative { -n } else { n });
                    if data.get(i) == Some(&b' ') {
                        i += 1;
                    }

                    if word == "bin" {
                        i += param.unwrap_or(0).max(0) as usize;
                        continue;
                    }
                    if SKIP_DESTINATIONS.contains(&word) {
                        state.skip = true;
                        continue;
                    }
                    match word {
                        "ansicpg" => {
                            if let Some(enc) = param.and_then(codepage_encoding) {
                                parser.codepage = enc;
                            }
                        }
                        "uc" => state.uc = param.unwrap_or(1).max(0) as usize,
                        _ if state.skip => {}
                        "u" => {
                            if let Some(v) = param {
                                parser.push_unicode(v);
                                skip_chars = state.uc;
                            }
                        }
                        "par" | "sect" | "page" | "row" => parser.end_paragraph(),
                        "line" => parser.push_char('\n'),
                        "tab" | "cell" => parser.push_char('\t'),
                        "emdash" => parser.push_char('—'),
                        "endash" => parser.push_char('–'),
                        "bullet" => parser.push_char('•'),
                        "lquote" => parser.push_char('‘'),
                        "rquote" => parser.push_char('’'),
                        "ldblquote" => parser.push_char('“'),
                        "rdblquote" => parser.push_char('”'),
                        "emspace" | "enspace" | "qmspace" => parser.push_char(' '),
                        _ => {}
                    }
                } else if next == b'\'' {
                    let byte = data
                        .get(i + 1..i + 3)
                        .and_then(|h| std::str::from_utf8(h).ok())
                        .and_then(|h| u8::from_str_radix(h, 16).ok());
                    i += 3;
                    if skip_chars > 0 {
                        skip_chars -= 1;
                    } else if let (Some(b), false) = (byte, state.skip) {
                        parser.bytes.push(b);
                    }
                } else {
                    i += 1;
                    match next {
                        b'*' => state.skip = true,
                        _ if state.skip => {}
                        b'\\' | b'{' | b'}' => parser.push_char(next as char),
                        b'~' => parser.push_char('\u{A0}'),
                        b'_' => parser.push_char('-'),
                        b'\n' | b'\r' => parser.end_paragraph(),
                        _ => {}
                    }
                }
            }
            b'\r' | b'\n' => i += 1,
            _ => {
                if skip_chars > 0 {
                    skip_chars -= 1;
                } else if !state.skip {
                    parser.bytes.push(c);
                }
                i += 1;
            }
        }
    }
    parser.end_paragraph();
    Ok(parser.blocks)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(rtf: &str) -> Vec<String> {
        extract(rtf.as_bytes()).unwrap().into_iter().map(|b| b.text).collect()
    }

    #[test]
    fn plain_paragraphs_and_skipped_tables() {
        let rtf = r"{\rtf1\ansi\ansicpg1252{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}
\f0\fs24 Primeira linha\par
{\b Negrito} e normal\par}";
        assert_eq!(texts(rtf), vec!["Primeira linha", "Negrito e normal"]);
    }

    #[test]
    fn hex_and_unicode_escapes() {
        // A barra do escape unicode é montada em tempo de execução (char 92).
        let rtf = format!(
            r"{{\rtf1\ansi\ansicpg1252 A\'e7\'e3o {}u8364? euro\par}}",
            char::from(92u8)
        );
        assert_eq!(texts(&rtf), vec!["Ação € euro"]);
    }

    #[test]
    fn ignores_starred_destinations_and_field_codes() {
        let rtf = r#"{\rtf1{\*\generator Word;}Veja {\field{\*\fldinst HYPERLINK "x"}{\fldrslt o site}} hoje\par}"#;
        assert_eq!(texts(rtf), vec!["Veja o site hoje"]);
    }

    #[test]
    fn rejects_non_rtf() {
        assert!(extract(b"texto").is_err());
    }
}
