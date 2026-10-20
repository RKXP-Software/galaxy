//! Planilhas (xls, xlsx, xlsb, ods) via calamine e CSV/TSV indexado.
//!
//! O front pede só as linhas visíveis. Cada aba carregada fica num cache
//! pequeno; o CSV não é carregado inteiro: guardamos a posição em bytes
//! de uma linha a cada `CSV_CHECKPOINT` e lemos a partir dela.

use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use calamine::{open_workbook_auto, Data, ExcelDateTime, Range, Reader};
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};
use serde::Serialize;
use tauri::State;

use super::text::guess_encoding;
use super::{io_err, to_err, CmdResult};

const CSV_CHECKPOINT: usize = 256;
const CACHE_SIZE: usize = 6;
const MAX_PAGE: usize = 2000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookInfo {
    pub sheets: Vec<String>,
    pub is_csv: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetDims {
    pub rows: usize,
    pub cols: usize,
    /// Só para CSV: separador e codificação detectados.
    pub delimiter: Option<String>,
    pub encoding: Option<String>,
}

pub struct CsvIndex {
    delimiter: u8,
    encoding: &'static Encoding,
    /// Posição em bytes da linha `i * CSV_CHECKPOINT`.
    checkpoints: Vec<u64>,
    rows: usize,
    cols: usize,
}

enum SheetData {
    Grid(Range<Data>),
    Csv(CsvIndex),
}

type CacheKey = (String, u64, usize);

#[derive(Default)]
pub struct SheetCache(Mutex<Vec<(CacheKey, Arc<SheetData>)>>);

impl SheetCache {
    fn get_or_load(&self, path: &str, sheet: usize) -> CmdResult<Arc<SheetData>> {
        // A data de modificação faz parte da chave: salvar o CSV invalida o cache.
        let modified = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let key = (path.to_string(), modified, sheet);

        {
            let mut entries = self.0.lock().unwrap();
            if let Some(pos) = entries.iter().position(|(k, _)| *k == key) {
                // Move para o fim: o primeiro da lista é o menos usado.
                let entry = entries.remove(pos);
                let data = entry.1.clone();
                entries.push(entry);
                return Ok(data);
            }
        }

        let data = Arc::new(if is_csv(path) {
            SheetData::Csv(build_csv_index(Path::new(path)).map_err(io_err)?)
        } else {
            SheetData::Grid(load_grid(path, sheet)?)
        });
        let mut entries = self.0.lock().unwrap();
        entries.retain(|(k, _)| !(k.0 == key.0 && k.2 == key.2));
        entries.push((key, data.clone()));
        if entries.len() > CACHE_SIZE {
            entries.remove(0);
        }
        Ok(data)
    }
}

fn is_csv(path: &str) -> bool {
    let ext = Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    matches!(ext.as_str(), "csv" | "tsv" | "tab")
}

fn load_grid(path: &str, sheet: usize) -> CmdResult<Range<Data>> {
    let mut workbook = open_workbook_auto(path).map_err(to_err)?;
    workbook
        .worksheet_range_at(sheet)
        .ok_or_else(|| "Aba da planilha não encontrada.".to_string())?
        .map_err(to_err)
}

// ---------- células ----------

pub fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) | Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
        Data::Int(i) => i.to_string(),
        Data::Float(f) => format_number(*f),
        Data::Bool(b) => if *b { "VERDADEIRO" } else { "FALSO" }.to_string(),
        Data::Error(e) => e.to_string(),
        Data::DateTime(dt) => format_datetime(dt),
    }
}

/// Número com até 15 dígitos significativos (como o Excel) e vírgula decimal.
pub fn format_number(f: f64) -> String {
    if f.fract() == 0.0 && f.abs() < 1e15 {
        return format!("{}", f as i64);
    }
    let rounded: f64 = format!("{f:.14e}").parse().unwrap_or(f);
    format!("{rounded}").replace('.', ",")
}

fn format_datetime(dt: &ExcelDateTime) -> String {
    if dt.is_duration() {
        let total_secs = (dt.as_f64() * 86_400.0).round() as i64;
        let (h, m, s) = (total_secs / 3600, (total_secs % 3600) / 60, total_secs % 60);
        return format!("{h}:{m:02}:{s:02}");
    }
    let (y, mo, d, h, mi, s, _) = dt.to_ymd_hms_milli();
    if dt.as_f64() < 1.0 {
        format!("{h:02}:{mi:02}:{s:02}")
    } else if (h, mi, s) == (0, 0, 0) {
        format!("{d:02}/{mo:02}/{y}")
    } else {
        format!("{d:02}/{mo:02}/{y} {h:02}:{mi:02}:{s:02}")
    }
}

/// Remove as células vazias do fim da linha para encurtar a resposta.
fn trim_row(mut row: Vec<String>) -> Vec<String> {
    while row.last().is_some_and(|c| c.is_empty()) {
        row.pop();
    }
    row
}

fn grid_dims(range: &Range<Data>) -> (usize, usize) {
    // Coordenadas absolutas, para a grade bater com as linhas/colunas do Excel.
    match range.end() {
        Some((r, c)) if !range.is_empty() => (r as usize + 1, c as usize + 1),
        _ => (0, 0),
    }
}

fn grid_rows(range: &Range<Data>, offset: usize, limit: usize) -> Vec<Vec<String>> {
    let (rows, cols) = grid_dims(range);
    (offset..rows.min(offset + limit))
        .map(|r| {
            trim_row(
                (0..cols)
                    .map(|c| {
                        range
                            .get_value((r as u32, c as u32))
                            .map(cell_to_string)
                            .unwrap_or_default()
                    })
                    .collect(),
            )
        })
        .collect()
}

// ---------- CSV ----------

/// Escolhe o separador que aparece o mesmo número de vezes nas primeiras linhas.
pub fn sniff_delimiter(sample: &[u8]) -> u8 {
    const CANDIDATES: [u8; 4] = [b',', b';', b'\t', b'|'];
    let text = String::from_utf8_lossy(sample);
    let mut lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).take(21).collect();
    if lines.len() > 1 {
        lines.pop(); // a última pode estar cortada pela amostra
    }

    let count_outside_quotes = |line: &str, d: u8| {
        let mut in_quotes = false;
        line.bytes()
            .filter(|&b| {
                if b == b'"' {
                    in_quotes = !in_quotes;
                }
                b == d && !in_quotes
            })
            .count()
    };

    let mut best = (b',', 0usize);
    for d in CANDIDATES {
        let counts: Vec<usize> = lines.iter().map(|l| count_outside_quotes(l, d)).collect();
        let total: usize = counts.iter().sum();
        let consistent = counts.first().is_some_and(|&c| c > 0 && counts.iter().all(|&x| x == c));
        let score = if consistent { 1_000_000 + counts[0] } else { total };
        if score > best.1 {
            best = (d, score);
        }
    }
    best.0
}

fn detect_csv_encoding(head: &[u8]) -> (&'static Encoding, u64) {
    if let Some((enc, bom_len)) = Encoding::for_bom(head) {
        return (enc, bom_len as u64);
    }
    match std::str::from_utf8(head) {
        Ok(_) => (UTF_8, 0),
        Err(e) if e.error_len().is_none() => (UTF_8, 0),
        Err(_) => (guess_encoding(head), 0),
    }
}

pub fn build_csv_index(path: &Path) -> std::io::Result<CsvIndex> {
    let mut head = Vec::new();
    File::open(path)?.take(64 * 1024).read_to_end(&mut head)?;
    let (encoding, bom_len) = detect_csv_encoding(&head);
    if encoding == UTF_16LE || encoding == UTF_16BE {
        return Err(std::io::Error::other(
            "CSV em UTF-16 não é suportado na grade. Use o modo Texto.",
        ));
    }
    let tab_ext = path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("tsv") || e.eq_ignore_ascii_case("tab"));
    let delimiter = if tab_ext { b'\t' } else { sniff_delimiter(&head[bom_len as usize..]) };

    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(bom_len))?;
    let mut reader = csv_reader(delimiter, BufReader::with_capacity(1 << 20, file));

    let mut record = csv::ByteRecord::new();
    let mut checkpoints = Vec::new();
    let (mut rows, mut cols) = (0usize, 0usize);
    loop {
        if rows % CSV_CHECKPOINT == 0 {
            checkpoints.push(bom_len + reader.position().byte());
        }
        if !reader.read_byte_record(&mut record).map_err(std::io::Error::other)? {
            break;
        }
        rows += 1;
        cols = cols.max(record.len());
    }
    Ok(CsvIndex { delimiter, encoding, checkpoints, rows, cols })
}

fn csv_reader<R: Read>(delimiter: u8, input: R) -> csv::Reader<R> {
    csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .delimiter(delimiter)
        .from_reader(input)
}

pub fn csv_rows(path: &Path, index: &CsvIndex, offset: usize, limit: usize) -> std::io::Result<Vec<Vec<String>>> {
    let Some(&start) = index.checkpoints.get(offset / CSV_CHECKPOINT) else {
        return Ok(Vec::new());
    };
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(start))?;
    let mut reader = csv_reader(index.delimiter, BufReader::new(file));

    let mut record = csv::ByteRecord::new();
    for _ in 0..offset % CSV_CHECKPOINT {
        if !reader.read_byte_record(&mut record).map_err(std::io::Error::other)? {
            return Ok(Vec::new());
        }
    }
    let mut out = Vec::with_capacity(limit);
    while out.len() < limit && reader.read_byte_record(&mut record).map_err(std::io::Error::other)? {
        out.push(trim_row(
            record
                .iter()
                .map(|field| index.encoding.decode_without_bom_handling(field).0.into_owned())
                .collect(),
        ));
    }
    Ok(out)
}

fn delimiter_name(d: u8) -> String {
    match d {
        b'\t' => "tab".into(),
        other => (other as char).to_string(),
    }
}

// ---------- comandos ----------

#[tauri::command(async)]
pub fn sheet_open(path: String) -> CmdResult<WorkbookInfo> {
    if is_csv(&path) {
        return Ok(WorkbookInfo { sheets: vec!["Planilha".into()], is_csv: true });
    }
    let workbook = open_workbook_auto(&path).map_err(to_err)?;
    Ok(WorkbookInfo { sheets: workbook.sheet_names(), is_csv: false })
}

#[tauri::command(async)]
pub fn sheet_load(cache: State<'_, SheetCache>, path: String, sheet: usize) -> CmdResult<SheetDims> {
    Ok(match &*cache.get_or_load(&path, sheet)? {
        SheetData::Grid(range) => {
            let (rows, cols) = grid_dims(range);
            SheetDims { rows, cols, delimiter: None, encoding: None }
        }
        SheetData::Csv(index) => SheetDims {
            rows: index.rows,
            cols: index.cols,
            delimiter: Some(delimiter_name(index.delimiter)),
            encoding: Some(index.encoding.name().to_string()),
        },
    })
}

#[tauri::command(async)]
pub fn sheet_rows(
    cache: State<'_, SheetCache>,
    path: String,
    sheet: usize,
    offset: usize,
    limit: usize,
) -> CmdResult<Vec<Vec<String>>> {
    let limit = limit.min(MAX_PAGE);
    match &*cache.get_or_load(&path, sheet)? {
        SheetData::Grid(range) => Ok(grid_rows(range, offset, limit)),
        SheetData::Csv(index) => csv_rows(Path::new(&path), index, offset, limit).map_err(io_err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniffs_common_delimiters() {
        assert_eq!(sniff_delimiter(b"a,b,c\n1,2,3\n4,5,6\n"), b',');
        assert_eq!(sniff_delimiter(b"nome;valor\n\"Silva, Ana\";1,5\nJo;2,0\n"), b';');
        assert_eq!(sniff_delimiter(b"a\tb\n1\t2\n3\t4\n"), b'\t');
    }

    #[test]
    fn number_formatting() {
        assert_eq!(format_number(42.0), "42");
        assert_eq!(format_number(0.1 + 0.2), "0,3");
        assert_eq!(format_number(-1234.5), "-1234,5");
    }

    #[test]
    fn csv_index_pages_across_checkpoints() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("dados.csv");
        let mut content = String::from("\u{feff}id;nome\n");
        for i in 0..1000 {
            content.push_str(&format!("{i};\"linha {i}; com separador\"\n"));
        }
        std::fs::write(&path, content).unwrap();

        let index = build_csv_index(&path).unwrap();
        assert_eq!(index.delimiter, b';');
        assert_eq!(index.encoding, UTF_8);
        assert_eq!((index.rows, index.cols), (1001, 2));

        let first = csv_rows(&path, &index, 0, 2).unwrap();
        assert_eq!(first[0], vec!["id", "nome"]);
        assert_eq!(first[1], vec!["0", "linha 0; com separador"]);

        let page = csv_rows(&path, &index, 600, 3).unwrap();
        assert_eq!(page[0][0], "599");
        assert_eq!(page.len(), 3);

        assert!(csv_rows(&path, &index, 5000, 10).unwrap().is_empty());
    }

    #[test]
    fn csv_in_windows_1252() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("latin.csv");
        let mut bytes = b"cidade;estado\n".to_vec();
        for _ in 0..20 {
            bytes.extend_from_slice(b"S\xe3o Paulo;S\xe3o Paulo\nBras\xedlia;Distrito Federal\n");
        }
        std::fs::write(&path, bytes).unwrap();
        let index = build_csv_index(&path).unwrap();
        let rows = csv_rows(&path, &index, 1, 2).unwrap();
        assert_eq!(rows[0][0], "São Paulo");
        assert_eq!(rows[1][0], "Brasília");
    }
}
