import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { getController } from "../app/controllers";
import { useApp, type Tab } from "../app/store";
import { nameMatches, searchText, type TextHit } from "../lib/tabSearch";
import { SearchIcon, ViewerIcon } from "./icons";

/** Nome do evento disparado pelo atalho Ctrl+P para focar a busca. */
export const FOCUS_SEARCH_EVENT = "galaxy:focus-search";

const MAX_HITS_PER_TAB = 4;
const MAX_TABS_WITH_HITS = 12;

interface Group {
  tab: Tab;
  /** O nome ou caminho da aba também combina com a busca. */
  byName: boolean;
  hits: TextHit[];
  total: number;
}

interface Row {
  tabId: string;
  hit?: TextHit;
}

function search(tabs: Tab[], query: string): Group[] {
  const q = query.trim();
  if (!q) return tabs.map((tab) => ({ tab, byName: true, hits: [], total: 0 }));
  const groups: Group[] = [];
  for (const tab of tabs) {
    const byName = nameMatches(tab.info.name, tab.info.path, q);
    // O texto vem do editor, então inclui o que ainda não foi salvo.
    const getText = getController(tab.id).getText;
    const { hits, total } = getText ? searchText(getText(), q, MAX_HITS_PER_TAB) : { hits: [], total: 0 };
    if (byName || total > 0) groups.push({ tab, byName, hits, total });
  }
  // Quem combina pelo nome vem primeiro.
  groups.sort((a, b) => Number(b.byName) - Number(a.byName));
  return groups.slice(0, MAX_TABS_WITH_HITS);
}

function Snippet({ hit }: { hit: TextHit }) {
  const { snippet, snippetStart, length } = hit;
  return (
    <>
      {snippet.slice(0, snippetStart)}
      <mark>{snippet.slice(snippetStart, snippetStart + length)}</mark>
      {snippet.slice(snippetStart + length)}
    </>
  );
}

export function TabSearch() {
  const tabs = useApp((s) => s.tabs);
  const activate = useApp((s) => s.activate);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 120);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.select();
      setOpen(true);
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // `open` entra nas dependências para refazer a busca com o texto atual ao reabrir a lista.
  const groups = useMemo(() => (open ? search(tabs, debounced) : []), [tabs, debounced, open]);
  const rows = useMemo<Row[]>(
    () => groups.flatMap((g) => (g.hits.length ? g.hits.map((hit) => ({ tabId: g.tab.id, hit })) : [{ tabId: g.tab.id }])),
    [groups],
  );

  useEffect(() => setCursor(0), [debounced]);

  const choose = (row: Row) => {
    setOpen(false);
    setQuery("");
    input.current?.blur();
    activate(row.tabId);
    const { hit } = row;
    if (hit) {
      // A aba só aparece depois da próxima renderização.
      window.setTimeout(() => getController(row.tabId).reveal?.(hit.line, hit.column, hit.length), 60);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      input.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && rows[cursor]) {
      e.preventDefault();
      choose(rows[cursor]);
    }
  };

  useEffect(() => {
    root.current?.querySelector(".search-row.active")?.scrollIntoView({ block: "nearest" });
  }, [cursor, groups]);

  let rowIndex = -1;
  const filtering = debounced.trim() !== "";

  return (
    <div className="tab-search" ref={root}>
      <div className="search-box">
        <SearchIcon size={14} />
        <input
          ref={input}
          placeholder="Buscar nas abas abertas (Ctrl+P)"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          aria-label="Buscar nas abas abertas"
        />
      </div>
      {open && (
        <div className="search-results" role="listbox">
          {tabs.length === 0 && <div className="search-empty">Nenhuma aba aberta.</div>}
          {tabs.length > 0 && groups.length === 0 && <div className="search-empty">Nada encontrado nas abas abertas.</div>}
          {groups.map((g) => (
            <Fragment key={g.tab.id}>
              <div className="search-group">
                <ViewerIcon viewer={g.tab.viewer} size={14} />
                <span className="search-group-name">{g.tab.info.name}</span>
                {filtering && g.total > 0 && (
                  <span className="search-count">
                    {g.total} {g.total === 1 ? "ocorrência" : "ocorrências"}
                  </span>
                )}
              </div>
              {g.hits.length === 0
                ? (() => {
                    rowIndex++;
                    const row: Row = { tabId: g.tab.id };
                    const idx = rowIndex;
                    return (
                      <button
                        className={`search-row${idx === cursor ? " active" : ""}`}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => choose(row)}
                      >
                        <span className="search-where">{filtering ? "Nome do arquivo" : g.tab.info.path || "Arquivo novo"}</span>
                      </button>
                    );
                  })()
                : g.hits.map((hit) => {
                    rowIndex++;
                    const idx = rowIndex;
                    return (
                      <button
                        key={`${hit.line}:${hit.column}`}
                        className={`search-row${idx === cursor ? " active" : ""}`}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => choose({ tabId: g.tab.id, hit })}
                      >
                        <span className="search-line">{hit.line}</span>
                        <span className="search-snippet">
                          <Snippet hit={hit} />
                        </span>
                      </button>
                    );
                  })}
              {g.total > g.hits.length && <div className="search-more">+ {g.total - g.hits.length} nesta aba</div>}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
