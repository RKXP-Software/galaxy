import { useEffect, useReducer, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { openWithSystem } from "../../app/actions";
import { useApp } from "../../app/store";
import { Toolbar } from "../../components/common";
import { ExternalIcon } from "../../components/icons";
import { api } from "../../lib/tauri";
import type { ViewerProps } from "../registry";

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 20;
/** Bytes pedidos ao Rust por vez. */
const CHUNK = 64 * 1024;
const ROWS_PER_CHUNK = CHUNK / BYTES_PER_ROW;

const hex = (n: number, width: number) => n.toString(16).toUpperCase().padStart(width, "0");
const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·");

export default function HexViewer({ tab }: ViewerProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const chunks = useRef(new Map<number, Uint8Array>());
  const pending = useRef(new Set<number>());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const setViewer = useApp((s) => s.setViewer);
  const size = tab.info.size;
  const offsetWidth = Math.max(8, hex(size, 1).length);

  const rows = useVirtualizer({
    count: Math.ceil(size / BYTES_PER_ROW),
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 30,
  });
  const items = rows.getVirtualItems();
  const firstChunk = items.length ? Math.floor(items[0].index / ROWS_PER_CHUNK) : 0;
  const lastChunk = items.length ? Math.floor(items[items.length - 1].index / ROWS_PER_CHUNK) : 0;

  useEffect(() => {
    for (let c = firstChunk; c <= lastChunk; c++) {
      if (chunks.current.has(c) || pending.current.has(c) || c * CHUNK >= size) continue;
      pending.current.add(c);
      api
        .readHex(tab.info.path, c * CHUNK, CHUNK)
        .then((buffer) => {
          chunks.current.set(c, new Uint8Array(buffer));
          rerender();
        })
        .finally(() => pending.current.delete(c));
    }
  }, [firstChunk, lastChunk, size, tab.info.path]);

  const rowBytes = (row: number): Uint8Array | null => {
    const chunk = chunks.current.get(Math.floor(row / ROWS_PER_CHUNK));
    if (!chunk) return null;
    const start = (row % ROWS_PER_CHUNK) * BYTES_PER_ROW;
    return chunk.subarray(start, start + BYTES_PER_ROW);
  };

  return (
    <div className="viewer">
      <Toolbar>
        <span className="toolbar-label">
          Tipo não reconhecido{tab.info.mime ? ` (${tab.info.mime})` : ""}: mostrando os bytes do arquivo.
        </span>
        <span className="spacer" />
        <button className="secondary-button compact" onClick={() => setViewer(tab.id, "text")}>
          Abrir como texto
        </button>
        <button className="secondary-button compact" onClick={() => void openWithSystem(tab.info.path)}>
          <ExternalIcon size={14} /> App padrão
        </button>
      </Toolbar>
      <div className="viewer-body hex-body selectable" ref={scroller}>
        {size === 0 ? (
          <div className="center-message">O arquivo está vazio.</div>
        ) : (
          <div style={{ height: rows.getTotalSize(), position: "relative" }}>
            {items.map((item) => {
              const bytes = rowBytes(item.index);
              const cells = bytes ? Array.from(bytes) : [];
              return (
                <div key={item.key} className="hex-row" style={{ top: item.start, height: ROW_HEIGHT }}>
                  <span className="hex-offset">{hex(item.index * BYTES_PER_ROW, offsetWidth)}</span>
                  <span className="hex-bytes">
                    {bytes
                      ? cells.map((b, i) => (i === 8 ? ` ${hex(b, 2)}` : hex(b, 2))).join(" ")
                      : "…"}
                  </span>
                  <span className="hex-ascii">{cells.map(printable).join("")}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
