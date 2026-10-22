// Wrappers tipados para os comandos Rust (src-tauri/src/commands).
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export interface FileInfo {
  path: string;
  name: string;
  /** Extensão em minúsculas, sem ponto. */
  ext: string;
  size: number;
  modified: number | null;
  sniffedExt: string | null;
  mime: string | null;
  isText: boolean;
}

export interface TextFile {
  content: string;
  encoding: string;
  bom: boolean;
  lineEnding: "crlf" | "lf";
  truncated: boolean;
  readOnly: boolean;
  hadErrors: boolean;
}

export interface WorkbookInfo {
  sheets: string[];
  isCsv: boolean;
}

export interface SheetDims {
  rows: number;
  cols: number;
  delimiter: string | null;
  encoding: string | null;
}

export interface ZipEntryInfo {
  index: number;
  name: string;
  size: number;
  compressedSize: number;
  isDir: boolean;
  encrypted: boolean;
  modified: string | null;
}

export interface HistoryVersion {
  /** Identificador para ler a versão. */
  id: string;
  /** Quando foi guardada (ms desde 1970). */
  timestamp: number;
  size: number;
}

export interface DocBlock {
  kind: string;
  text: string;
}

export interface ExtractedDoc {
  format: "doc" | "rtf" | "odt" | "text";
  blocks: DocBlock[];
}

/** Prefixo do erro de write_text quando a codificação não representa o texto. */
export const UNMAPPABLE = "UNMAPPABLE";

export const api = {
  startupFiles: () => invoke<string[]>("startup_files"),
  fileInfo: (path: string) => invoke<FileInfo>("file_info", { path }),
  readBinary: (path: string) => invoke<ArrayBuffer>("read_binary", { path }),
  readHex: (path: string, offset: number, length: number) =>
    invoke<ArrayBuffer>("read_hex", { path, offset, length }),
  allowAsset: (path: string) => invoke<void>("allow_asset", { path }),
  openWithSystem: (path: string) => invoke<void>("open_with_system", { path }),
  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
  readText: (path: string) => invoke<TextFile>("read_text", { path }),
  writeText: (path: string, content: string, encoding: string, bom: boolean, lineEnding: string) =>
    invoke<FileInfo>("write_text", { path, content, encoding, bom, lineEnding }),
  historyList: (path: string) => invoke<HistoryVersion[]>("history_list", { path }),
  historyRead: (path: string, id: string) => invoke<string>("history_read", { path, id }),
  sheetOpen: (path: string) => invoke<WorkbookInfo>("sheet_open", { path }),
  sheetLoad: (path: string, sheet: number) => invoke<SheetDims>("sheet_load", { path, sheet }),
  sheetRows: (path: string, sheet: number, offset: number, limit: number) =>
    invoke<string[][]>("sheet_rows", { path, sheet, offset, limit }),
  zipList: (path: string) => invoke<ZipEntryInfo[]>("zip_list", { path }),
  zipExtract: (path: string, index: number) => invoke<string>("zip_extract", { path, index }),
  extractDocument: (path: string) => invoke<ExtractedDoc>("extract_document", { path }),
};

/** URL do asset protocol: o arquivo é lido direto do disco, com suporte a Range. */
export const assetUrl = (path: string) => convertFileSrc(path);

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
