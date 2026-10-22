// Busca de texto dentro do conteúdo de uma aba aberta.

export interface TextHit {
  /** Linha e coluna começam em 1. */
  line: number;
  column: number;
  length: number;
  /** Trecho da linha ao redor do achado, para mostrar na lista. */
  snippet: string;
  /** Posição do achado dentro de `snippet`. */
  snippetStart: number;
}

export interface TextSearchResult {
  hits: TextHit[];
  /** Total de ocorrências (pode ser maior que `hits`). */
  total: number;
}

/** Textos acima disso não são varridos a cada tecla. */
export const MAX_SEARCH_CHARS = 5_000_000;

const CONTEXT = 48;

/** Busca sem diferenciar maiúsculas/minúsculas; devolve até `maxHits` ocorrências. */
export function searchText(text: string, query: string, maxHits = 5): TextSearchResult {
  const q = query.toLowerCase();
  const result: TextSearchResult = { hits: [], total: 0 };
  if (!q || text.length > MAX_SEARCH_CHARS) return result;

  let lineNumber = 0;
  let start = 0;
  while (start <= text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    lineNumber++;
    const line = text.slice(start, end).replace(/\r$/, "");
    const lower = line.toLowerCase();
    for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, at + q.length)) {
      result.total++;
      if (result.hits.length < maxHits) {
        const from = Math.max(0, at - CONTEXT);
        const to = Math.min(line.length, at + q.length + CONTEXT);
        result.hits.push({
          line: lineNumber,
          column: at + 1,
          length: q.length,
          snippet: (from > 0 ? "…" : "") + line.slice(from, to) + (to < line.length ? "…" : ""),
          snippetStart: at - from + (from > 0 ? 1 : 0),
        });
      }
    }
    start = end + 1;
  }
  return result;
}

/** O nome (ou o caminho) contém a busca? */
export function nameMatches(name: string, path: string, query: string): boolean {
  const q = query.toLowerCase();
  return name.toLowerCase().includes(q) || path.toLowerCase().includes(q);
}
