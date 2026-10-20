//! Extração de texto de formatos de documento sem renderizador no front.

pub mod doc;
pub mod odt;
pub mod rtf;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Block {
    /// "p", "li" ou "h1".."h6".
    pub kind: String,
    pub text: String,
}

impl Block {
    pub fn new(kind: impl Into<String>, text: impl Into<String>) -> Self {
        Block { kind: kind.into(), text: text.into() }
    }

    /// Um parágrafo por linha não vazia.
    pub fn paragraphs(text: &str) -> Vec<Block> {
        text.lines()
            .map(str::trim_end)
            .filter(|l| !l.trim().is_empty())
            .map(|l| Block::new("p", l))
            .collect()
    }
}
