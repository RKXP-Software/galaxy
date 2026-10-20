// Qual visualizador abre cada arquivo. Mapeamento puro, sem React,
// para poder ser testado e reutilizado no filtro do diálogo de abrir.
import type { FileInfo } from "./tauri";

export type ViewerId =
  | "text"
  | "markdown"
  | "json"
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "sheet"
  | "docx"
  | "pptx"
  | "extracted"
  | "zip"
  | "epub"
  | "hex";

export const CODE_EXTENSIONS = [
  "js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "py", "pyw", "html", "htm", "xhtml",
  "css", "scss", "sass", "less", "xml", "xaml", "xsl", "plist", "csproj", "vbproj", "props",
  "yaml", "yml", "toml", "sql", "sh", "bash", "zsh", "ps1", "psm1", "bat", "cmd", "c", "h",
  "cpp", "cc", "hpp", "cs", "java", "kt", "kts", "go", "rs", "php", "rb", "lua", "swift",
  "dart", "vue", "svelte", "r", "pl", "gradle", "dockerfile", "makefile", "graphql", "gql",
  "proto", "tf", "vb", "fs", "scala", "groovy", "clj", "ex", "exs", "erl", "hs", "jl",
];

export const TEXT_EXTENSIONS = [
  "txt", "text", "log", "ini", "cfg", "conf", "config", "env", "properties", "gitignore",
  "gitattributes", "editorconfig", "npmrc", "nfo", "diz", "srt", "vtt", "sub", "jsonl",
  "ndjson", "mdx", "rst", "adoc", "tex", "bib", "sln", "lock", "license",
];

export const GROUPS: { viewer: ViewerId; label: string; extensions: string[] }[] = [
  { viewer: "text", label: "Texto e código", extensions: [...TEXT_EXTENSIONS, ...CODE_EXTENSIONS] },
  { viewer: "markdown", label: "Markdown", extensions: ["md", "markdown", "mkd"] },
  { viewer: "json", label: "JSON", extensions: ["json", "jsonc", "geojson", "webmanifest", "har"] },
  {
    viewer: "image",
    label: "Imagens",
    extensions: ["png", "jpg", "jpeg", "jfif", "pjpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "apng"],
  },
  { viewer: "audio", label: "Áudio", extensions: ["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "opus", "weba"] },
  { viewer: "video", label: "Vídeo", extensions: ["mp4", "m4v", "webm", "mov", "ogv"] },
  { viewer: "pdf", label: "PDF", extensions: ["pdf"] },
  { viewer: "sheet", label: "Planilhas", extensions: ["csv", "tsv", "tab", "xls", "xlsx", "xlsm", "xlsb", "ods"] },
  { viewer: "docx", label: "Word", extensions: ["docx", "docm", "dotx"] },
  { viewer: "pptx", label: "PowerPoint", extensions: ["pptx", "ppsx", "potx", "pptm"] },
  { viewer: "extracted", label: "Documentos (texto)", extensions: ["doc", "rtf", "odt"] },
  { viewer: "zip", label: "Compactados", extensions: ["zip", "jar", "nupkg", "vsix", "xpi", "cbz"] },
  { viewer: "epub", label: "E-books", extensions: ["epub"] },
];

export const VIEWER_LABELS: Record<ViewerId, string> = {
  text: "Texto",
  markdown: "Markdown",
  json: "JSON",
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  pdf: "PDF",
  sheet: "Planilha",
  docx: "Documento Word",
  pptx: "Apresentação",
  extracted: "Documento",
  zip: "Arquivo compactado",
  epub: "E-book",
  hex: "Binário",
};

/** Visualizadores que permitem editar e salvar. */
export const EDITABLE: ReadonlySet<ViewerId> = new Set(["text", "markdown", "json", "sheet"]);

const BY_EXTENSION: Record<string, ViewerId> = Object.fromEntries(
  GROUPS.flatMap((g) => g.extensions.map((ext) => [ext, g.viewer])),
);

/** Nomes de arquivo sem extensão que são texto conhecido. */
const TEXT_FILENAMES = new Set(["readme", "license", "makefile", "dockerfile", "changelog", "authors"]);

export function viewerForExtension(ext: string): ViewerId | undefined {
  return BY_EXTENSION[ext.toLowerCase()];
}

export function resolveViewerId(info: Pick<FileInfo, "name" | "ext" | "sniffedExt" | "isText">): ViewerId {
  const ext = info.ext.toLowerCase();
  // Um .doc que na verdade é um docx renomeado.
  if (ext === "doc" && info.sniffedExt === "docx") return "docx";
  const byExt = viewerForExtension(ext);
  if (byExt) return byExt;
  if (info.sniffedExt) {
    const bySniff = viewerForExtension(info.sniffedExt);
    if (bySniff) return bySniff;
  }
  if (info.isText || TEXT_FILENAMES.has(info.name.toLowerCase())) return "text";
  return "hex";
}

/** Todas as extensões suportadas, para o filtro do diálogo de abrir. */
export const ALL_EXTENSIONS = GROUPS.flatMap((g) => g.extensions);
