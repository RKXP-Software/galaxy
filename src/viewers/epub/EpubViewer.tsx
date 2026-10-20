import { useEffect, useRef, useState } from "react";
import ePub, { type Book, type NavItem, type Rendition } from "epubjs";

import { useApp } from "../../app/store";
import { ErrorView, Loading, Segmented, Toolbar } from "../../components/common";
import { ChevronLeftIcon, ChevronRightIcon } from "../../components/icons";
import { errorMessage } from "../../lib/tauri";
import { usePrefersDark } from "../../lib/usePrefersDark";
import type { ViewerProps } from "../registry";
import { useBinary } from "../office/useBinary";

type Flow = "paginated" | "scrolled-doc";

const FLOWS: { value: Flow; label: string }[] = [
  { value: "paginated", label: "Páginas" },
  { value: "scrolled-doc", label: "Rolagem" },
];

const THEMES = {
  light: { body: { color: "#1d2030", background: "#ffffff" } },
  dark: { body: { color: "#e4e6f0", background: "#1d1f29" }, a: { color: "#a5a0ff" } },
};

function TocList({ items, onSelect, depth = 0 }: { items: NavItem[]; onSelect: (href: string) => void; depth?: number }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.id || item.href}>
          <button className="toc-item" style={{ paddingLeft: 12 + depth * 14 }} onClick={() => onSelect(item.href)}>
            {item.label.trim()}
          </button>
          {item.subitems && item.subitems.length > 0 && <TocList items={item.subitems} onSelect={onSelect} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

export default function EpubViewer({ tab, active }: ViewerProps) {
  const { data, error: readError } = useBinary(tab.info.path);
  const host = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState(true);
  const [flow, setFlow] = useState<Flow>("paginated");
  const [fontSize, setFontSize] = useState(100);
  const [title, setTitle] = useState("");
  const dark = usePrefersDark();
  const setStatus = useApp((s) => s.setStatus);

  useEffect(() => {
    if (!data || !host.current) return;
    let book: Book | null = null;
    let cancelled = false;
    try {
      book = ePub(data);
      const r = book.renderTo(host.current, { width: "100%", height: "100%", flow, spread: "auto", allowScriptedContent: false });
      rendition.current = r;
      r.themes.register("light", THEMES.light);
      r.themes.register("dark", THEMES.dark);
      r.themes.select(dark ? "dark" : "light");
      r.themes.fontSize(`${fontSize}%`);
      r.on("relocated", (location: { start: { percentage: number; displayed: { page: number; total: number } } }) => {
        const percent = Math.round((location.start.percentage ?? 0) * 100);
        setStatus(tab.id, { progress: `${percent}% lido` });
      });
      // As setas funcionam também com o foco dentro do livro (iframe).
      r.on("keyup", (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft") void r.prev();
        if (e.key === "ArrowRight") void r.next();
      });
      void r.display().then(() => !cancelled && setReady(true));
      void book.loaded.navigation.then((nav) => !cancelled && setToc(nav.toc));
      void book.loaded.metadata.then((meta) => !cancelled && setTitle(meta.title));
    } catch (e) {
      setError(errorMessage(e));
    }
    return () => {
      cancelled = true;
      rendition.current = null;
      book?.destroy();
    };
    // O modo de leitura recria a renderização; tema e fonte são aplicados abaixo.
  }, [data, flow]);

  useEffect(() => {
    rendition.current?.themes.select(dark ? "dark" : "light");
  }, [dark, ready]);

  useEffect(() => {
    rendition.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize, ready]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === "ArrowLeft" || e.key === "PageUp") void rendition.current?.prev();
      if (e.key === "ArrowRight" || e.key === "PageDown") void rendition.current?.next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const message = readError ?? error;
  if (message) return <ErrorView message={message} path={tab.info.path} />;

  return (
    <div className="viewer">
      <Toolbar>
        <button className={`secondary-button compact${showToc ? " active" : ""}`} onClick={() => setShowToc(!showToc)}>
          Sumário
        </button>
        <Segmented value={flow} options={FLOWS} onChange={setFlow} />
        <span className="toolbar-sep" />
        <button className="secondary-button compact" title="Diminuir fonte" onClick={() => setFontSize(Math.max(60, fontSize - 10))}>
          A−
        </button>
        <span className="toolbar-label">{fontSize}%</span>
        <button className="secondary-button compact" title="Aumentar fonte" onClick={() => setFontSize(Math.min(200, fontSize + 10))}>
          A+
        </button>
        <span className="spacer" />
        <span className="toolbar-label epub-title">{title}</span>
      </Toolbar>
      <div className="viewer-body epub-body">
        {showToc && (
          <nav className="epub-toc">
            {toc.length ? <TocList items={toc} onSelect={(href) => void rendition.current?.display(href)} /> : <p className="muted">Sem sumário.</p>}
          </nav>
        )}
        <div className="epub-reader">
          {flow === "paginated" && (
            <button className="epub-nav prev" title="Página anterior (←)" onClick={() => void rendition.current?.prev()}>
              <ChevronLeftIcon size={22} />
            </button>
          )}
          <div ref={host} className="epub-host" />
          {!ready && <Loading label="Abrindo livro…" />}
          {flow === "paginated" && (
            <button className="epub-nav next" title="Próxima página (→)" onClick={() => void rendition.current?.next()}>
              <ChevronRightIcon size={22} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
