// Destaque de sintaxe por extensão. Cada linguagem é importada só quando usada.
import type { Extension } from "@codemirror/state";
import type { StreamParser } from "@codemirror/language";

async function legacy(load: () => Promise<StreamParser<unknown>>): Promise<Extension> {
  const [{ StreamLanguage }, parser] = await Promise.all([import("@codemirror/language"), load()]);
  return StreamLanguage.define(parser);
}

const LOADERS: Record<string, () => Promise<Extension>> = {
  js: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  ts: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  tsx: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }),
  json: async () => (await import("@codemirror/lang-json")).json(),
  py: async () => (await import("@codemirror/lang-python")).python(),
  html: async () => (await import("@codemirror/lang-html")).html(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  xml: async () => (await import("@codemirror/lang-xml")).xml(),
  yaml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
  md: async () => (await import("@codemirror/lang-markdown")).markdown(),
  sh: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/shell")).shell),
  ps1: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/powershell")).powerShell),
  c: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clike")).c),
  cpp: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clike")).cpp),
  cs: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clike")).csharp),
  java: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clike")).java),
  kt: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clike")).kotlin),
  scala: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clike")).scala),
  dart: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clike")).dart),
  go: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/go")).go),
  rs: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/rust")).rust),
  rb: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/ruby")).ruby),
  lua: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/lua")).lua),
  swift: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/swift")).swift),
  r: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/r")).r),
  pl: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/perl")).perl),
  toml: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/toml")).toml),
  ini: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/properties")).properties),
  dockerfile: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/dockerfile")).dockerFile),
  vb: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/vb")).vb),
  fs: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/mllike")).fSharp),
  groovy: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/groovy")).groovy),
  clj: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/clojure")).clojure),
  erl: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/erlang")).erlang),
  hs: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/haskell")).haskell),
  jl: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/julia")).julia),
  diff: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/diff")).diff),
  proto: () => legacy(async () => (await import("@codemirror/legacy-modes/mode/protobuf")).protobuf),
};

/** Extensões que usam o mesmo destaque de outra. */
const ALIASES: Record<string, string> = {
  mjs: "js", cjs: "js", jsx: "js", mts: "ts", cts: "ts",
  jsonc: "json", geojson: "json", webmanifest: "json", har: "json",
  pyw: "py", htm: "html", xhtml: "html", vue: "html", svelte: "html",
  scss: "css", less: "css", sass: "css",
  xaml: "xml", xsl: "xml", plist: "xml", csproj: "xml", vbproj: "xml", props: "xml", svg: "xml",
  yml: "yaml", markdown: "md", mkd: "md", mdx: "md",
  bash: "sh", zsh: "sh", psm1: "ps1", h: "c", cc: "cpp", hpp: "cpp", kts: "kt",
  cfg: "ini", conf: "ini", properties: "ini", env: "ini", editorconfig: "ini", gitattributes: "ini",
  gradle: "groovy", patch: "diff",
};

/** Nomes curtos para a barra de status. */
export const LANGUAGE_NAMES: Record<string, string> = {
  js: "JavaScript", ts: "TypeScript", tsx: "TSX", json: "JSON", py: "Python", html: "HTML",
  css: "CSS", xml: "XML", yaml: "YAML", sql: "SQL", md: "Markdown", sh: "Shell",
  ps1: "PowerShell", c: "C", cpp: "C++", cs: "C#", java: "Java", kt: "Kotlin", scala: "Scala",
  dart: "Dart", go: "Go", rs: "Rust", rb: "Ruby", lua: "Lua", swift: "Swift", r: "R",
  pl: "Perl", toml: "TOML", ini: "INI", dockerfile: "Dockerfile", vb: "Visual Basic",
  fs: "F#", groovy: "Groovy", clj: "Clojure", erl: "Erlang", hs: "Haskell", jl: "Julia",
  diff: "Diff", proto: "Protobuf",
};

export function languageKey(ext: string, fileName = ""): string | null {
  const key = ALIASES[ext] ?? ext;
  if (LOADERS[key]) return key;
  if (fileName.toLowerCase() === "dockerfile") return "dockerfile";
  return null;
}

export async function loadLanguage(key: string | null): Promise<Extension> {
  if (!key || !LOADERS[key]) return [];
  try {
    return await LOADERS[key]();
  } catch (e) {
    console.warn("Falha ao carregar destaque de sintaxe", key, e);
    return [];
  }
}
