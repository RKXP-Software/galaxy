const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

export function formatDate(ms: number | null): string {
  if (ms == null) return "";
  return new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Nome de exibição da codificação devolvida pelo Rust. */
export function encodingLabel(encoding: string, bom = false): string {
  const name = /^windows-/i.test(encoding) ? `Windows-${encoding.slice(8)}` : encoding.toUpperCase();
  return bom ? `${name} com BOM` : name;
}

/** Diretório pai de um caminho do Windows ou POSIX. */
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i >= 0 ? path.slice(0, i) : "";
}

/** Resolve um caminho relativo (com / ou \, . e ..) a partir de uma pasta base. */
export function resolvePath(baseDir: string, relative: string): string {
  const rel = relative.replace(/\//g, "\\");
  if (/^[a-zA-Z]:\\/.test(rel) || rel.startsWith("\\\\")) return rel;
  const parts = baseDir.replace(/\//g, "\\").split("\\").filter((p, i) => p !== "" || i === 0);
  for (const part of rel.split("\\")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("\\");
}
