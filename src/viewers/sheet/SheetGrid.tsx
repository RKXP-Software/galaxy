import { useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useApp } from "../../app/store";
import { api, errorMessage, type SheetDims } from "../../lib/tauri";
import { columnName } from "./columnName";

const ROW_HEIGHT = 26;
const HEADER_WIDTH = 64;
const DEFAULT_COL_WIDTH = 120;
/** Linhas pedidas ao Rust por vez. */
const PAGE = 200;
/** Páginas mantidas em memória; as mais antigas são descartadas. */
const MAX_PAGES = 60;

const NUMERIC = /^[-+]?(\d{1,3}([.\s]\d{3})*|\d+)([.,]\d+)?%?$/;

interface Props {
  path: string;
  sheet: number;
  dims: SheetDims;
}

export function SheetGrid({ path, sheet, dims }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pages = useRef(new Map<number, string[][]>());
  const pending = useRef(new Set<number>());
  const widths = useRef<number[] | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const notify = useApp((s) => s.notify);

  const rows = useVirtualizer({
    count: dims.rows,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });
  const cols = useVirtualizer({
    horizontal: true,
    count: Math.max(dims.cols, 1),
    getScrollElement: () => scroller.current,
    estimateSize: (i) => widths.current?.[i] ?? DEFAULT_COL_WIDTH,
    overscan: 3,
  });

  const visibleRows = rows.getVirtualItems();
  const firstPage = visibleRows.length ? Math.floor(visibleRows[0].index / PAGE) : 0;
  const lastPage = visibleRows.length ? Math.floor(visibleRows[visibleRows.length - 1].index / PAGE) : 0;

  useEffect(() => {
    if (dims.rows === 0) return;
    for (let p = firstPage; p <= lastPage; p++) {
      if (pages.current.has(p) || pending.current.has(p)) continue;
      pending.current.add(p);
      api
        .sheetRows(path, sheet, p * PAGE, PAGE)
        .then((data) => {
          pages.current.set(p, data);
          if (pages.current.size > MAX_PAGES) {
            const farthest = [...pages.current.keys()].sort((a, b) => Math.abs(b - p) - Math.abs(a - p))[0];
            pages.current.delete(farthest);
          }
          // Largura das colunas estimada pelo conteúdo da primeira página.
          if (p === 0 && !widths.current) {
            widths.current = Array.from({ length: dims.cols }, (_, c) => {
              const longest = data.reduce((max, row) => Math.max(max, (row[c] ?? "").length), 0);
              return Math.min(360, Math.max(64, longest * 7.5 + 18));
            });
            cols.measure();
          }
          rerender();
        })
        .catch((e) => notify("error", `Erro ao ler a planilha: ${errorMessage(e)}`))
        .finally(() => pending.current.delete(p));
    }
  }, [firstPage, lastPage, path, sheet, dims.rows, dims.cols, cols, notify]);

  const cell = useCallback((row: number, col: number) => pages.current.get(Math.floor(row / PAGE))?.[row % PAGE]?.[col] ?? "", []);

  const select = (row: number, col: number) => {
    const r = Math.min(Math.max(row, 0), Math.max(dims.rows - 1, 0));
    const c = Math.min(Math.max(col, 0), Math.max(dims.cols - 1, 0));
    setSelected({ row: r, col: c });
    rows.scrollToIndex(r, { align: "auto" });
    cols.scrollToIndex(c, { align: "auto" });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!selected) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [1, 0],
      Tab: [0, e.shiftKey ? -1 : 1],
      PageDown: [20, 0],
      PageUp: [-20, 0],
    };
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      void navigator.clipboard.writeText(cell(selected.row, selected.col));
      return;
    }
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      select(selected.row + move[0], selected.col + move[1]);
    }
  };

  const totalWidth = HEADER_WIDTH + cols.getTotalSize();
  const value = selected ? cell(selected.row, selected.col) : "";

  return (
    <div className="sheet">
      <div className="sheet-formula">
        <span className="cell-address">{selected ? `${columnName(selected.col)}${selected.row + 1}` : ""}</span>
        <span className="cell-value selectable" title={value}>
          {value}
        </span>
      </div>
      <div className="sheet-scroll" ref={scroller} tabIndex={0} onKeyDown={onKeyDown}>
        <div style={{ width: totalWidth, height: ROW_HEIGHT + rows.getTotalSize(), position: "relative" }}>
          <div className="sheet-col-headers" style={{ width: totalWidth, height: ROW_HEIGHT }}>
            <div className="sheet-corner" style={{ width: HEADER_WIDTH }} />
            {cols.getVirtualItems().map((c) => (
              <div
                key={c.key}
                className={`sheet-col-header${selected?.col === c.index ? " current" : ""}`}
                style={{ left: HEADER_WIDTH + c.start, width: c.size }}
              >
                {columnName(c.index)}
              </div>
            ))}
          </div>
          {visibleRows.map((r) => (
            <div key={r.key} className="sheet-row" style={{ top: ROW_HEIGHT + r.start, height: ROW_HEIGHT, width: totalWidth }}>
              <div className={`sheet-row-header${selected?.row === r.index ? " current" : ""}`} style={{ width: HEADER_WIDTH }}>
                {r.index + 1}
              </div>
              {cols.getVirtualItems().map((c) => {
                const text = cell(r.index, c.index);
                const isSelected = selected?.row === r.index && selected.col === c.index;
                return (
                  <div
                    key={c.key}
                    className={`sheet-cell${NUMERIC.test(text) ? " numeric" : ""}${isSelected ? " selected" : ""}`}
                    style={{ left: HEADER_WIDTH + c.start, width: c.size }}
                    onMouseDown={() => setSelected({ row: r.index, col: c.index })}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
