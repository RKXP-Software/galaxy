pub mod archive;
pub mod extract;
pub mod file;
pub mod history;
pub mod sheet;
pub mod text;

/// Os comandos devolvem erros como texto, já prontos para exibir ao usuário.
pub type CmdResult<T> = Result<T, String>;

pub(crate) fn to_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Traduz os erros de E/S mais comuns para mensagens em português.
pub(crate) fn io_err(e: std::io::Error) -> String {
    use std::io::ErrorKind::*;
    match e.kind() {
        NotFound => "Arquivo não encontrado.".into(),
        PermissionDenied => "Sem permissão para acessar o arquivo.".into(),
        _ => e.to_string(),
    }
}
