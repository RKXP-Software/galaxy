//! Texto de documentos OpenDocument (.odt): lê o content.xml do pacote zip.

use std::io::{Cursor, Read};

use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

use super::Block;

/// Elementos cujo conteúdo não entra no texto principal.
const SKIP_ELEMENTS: &[&str] = &["text:note", "office:annotation", "text:tracked-changes"];

pub fn extract(bytes: &[u8]) -> Result<Vec<Block>, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| "O arquivo ODT está corrompido.".to_string())?;
    let mut xml = String::new();
    zip.by_name("content.xml")
        .map_err(|_| "O arquivo não é um documento OpenDocument.".to_string())?
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;
    parse_content(&xml)
}

fn attr(e: &BytesStart, name: &str) -> Option<String> {
    e.try_get_attribute(name)
        .ok()
        .flatten()
        .and_then(|a| a.normalized_value(XmlVersion::Implicit1_0).ok().map(|v| v.into_owned()))
}

/// Acrescenta texto colapsando espaços, como manda o ODF (espaços extras usam text:s).
fn push_collapsed(target: &mut String, text: &str) {
    for c in text.chars() {
        let c = if c.is_whitespace() { ' ' } else { c };
        if c == ' ' && target.ends_with(' ') {
            continue;
        }
        target.push(c);
    }
}

pub fn parse_content(xml: &str) -> Result<Vec<Block>, String> {
    let mut reader = Reader::from_str(xml);
    let mut blocks = Vec::new();
    // Parágrafos abertos (podem aninhar, ex.: dentro de quadros).
    let mut open: Vec<(String, String)> = Vec::new();
    let mut skip_depth = 0usize;
    let mut list_depth = 0usize;

    loop {
        let event = reader.read_event().map_err(|e| format!("XML inválido no ODT: {e}"))?;
        match event {
            Event::Start(e) => {
                let name = e.name();
                let name: &str = name.as_ref();
                if SKIP_ELEMENTS.contains(&name) || skip_depth > 0 {
                    skip_depth += usize::from(SKIP_ELEMENTS.contains(&name));
                    continue;
                }
                match name {
                    "text:list-item" => list_depth += 1,
                    "text:p" => {
                        let kind = if list_depth > 0 { "li" } else { "p" };
                        open.push((kind.to_string(), String::new()));
                    }
                    "text:h" => {
                        let level = attr(&e, "text:outline-level")
                            .and_then(|v| v.parse::<u8>().ok())
                            .unwrap_or(1)
                            .clamp(1, 6);
                        open.push((format!("h{level}"), String::new()));
                    }
                    _ => {}
                }
            }
            Event::Empty(e) if skip_depth == 0 => {
                let name = e.name();
                let Some((_, text)) = open.last_mut() else { continue };
                match name.as_ref() {
                    "text:s" => {
                        let count = attr(&e, "text:c").and_then(|v| v.parse().ok()).unwrap_or(1);
                        text.push_str(&" ".repeat(count));
                    }
                    "text:tab" => text.push('\t'),
                    "text:line-break" => text.push('\n'),
                    _ => {}
                }
            }
            Event::Text(t) if skip_depth == 0 => {
                if let Some((_, text)) = open.last_mut() {
                    push_collapsed(text, &t.xml10_content());
                }
            }
            Event::GeneralRef(r) if skip_depth == 0 => {
                if let Some((_, text)) = open.last_mut() {
                    if let Ok(Some(c)) = r.resolve_char_ref() {
                        text.push(c);
                    } else if let Some(s) = resolve_predefined_entity(&r.xml10_content()) {
                        text.push_str(s);
                    }
                }
            }
            Event::End(e) => {
                let name = e.name();
                let name: &str = name.as_ref();
                if skip_depth > 0 {
                    skip_depth -= usize::from(SKIP_ELEMENTS.contains(&name));
                    continue;
                }
                match name {
                    "text:list-item" => list_depth = list_depth.saturating_sub(1),
                    "text:p" | "text:h" => {
                        if let Some((kind, text)) = open.pop() {
                            let text = text.trim();
                            if !text.is_empty() {
                                blocks.push(Block::new(kind, text));
                            }
                        }
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(blocks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headings_paragraphs_lists_and_spaces() {
        let xml = r#"<?xml version="1.0"?>
<office:document-content xmlns:office="o" xmlns:text="t">
  <office:body><office:text>
    <text:h text:outline-level="2">Capítulo &amp; seção</text:h>
    <text:p>Um <text:span>texto</text:span>
       com<text:s text:c="2"/>espaços<text:tab/>e nota<text:note><text:note-body><text:p>rodapé</text:p></text:note-body></text:note>.</text:p>
    <text:list><text:list-item><text:p>item &#233;</text:p></text:list-item></text:list>
    <text:p/>
  </office:text></office:body>
</office:document-content>"#;
        let blocks = parse_content(xml).unwrap();
        assert_eq!(
            blocks,
            vec![
                Block::new("h2", "Capítulo & seção"),
                Block::new("p", "Um texto com  espaços\te nota."),
                Block::new("li", "item é"),
            ]
        );
    }
}
