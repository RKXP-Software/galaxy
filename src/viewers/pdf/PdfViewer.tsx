import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { openUrl } from "@tauri-apps/plugin-opener";

import { useApp } from "../../app/store";
import { ErrorView, Loading, Toolbar } from "../../components/common";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, ZoomInIcon, ZoomOutIcon } from "../../components/icons";
import { assetUrl, errorMessage } from "../../lib/tauri";
import type { ViewerProps } from "../registry";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Copiados de node_modules/pdfjs-dist por scripts/copy-pdfjs-assets.mjs. */
const ASSETS = "/pdfjs/";

const SCALES = [
  { value: "auto", label: "Automático" },
  { value: "page-fit", label: "Página inteira" },
  { value: "page-width", label: "Largura da página" },
  ...[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((s) => ({ value: String(s), label: `${s * 100}%` })),
];
const RELATIVE_SCALES = new Set(["auto", "page-fit", "page-width"]);

interface Matches {
  current: number;
  total: number;
}

export default function PdfViewerComponent({ tab, active }: ViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<PDFViewer | null>(null);
  const bus = useRef<EventBus | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState("auto");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Matches | null>(null);
  const setStatus = useApp((s) => s.setStatus);

  useEffect(() => {
    const el = container.current!;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const pdfViewer = new PDFViewer({ container: el, eventBus, linkService, findController });
    linkService.setViewer(pdfViewer);
    viewer.current = pdfViewer;
    bus.current = eventBus;

    eventBus.on("pagesinit", () => {
      pdfViewer.currentScaleValue = "auto";
    });
    eventBus.on("pagechanging", (e: { pageNumber: number }) => {
      setPage(e.pageNumber);
      setPageInput(String(e.pageNumber));
    });
    eventBus.on("scalechanging", (e: { scale: number; presetValue?: string }) => {
      setScale(e.scale);
      setScaleValue(e.presetValue ?? String(e.scale));
    });
    const onMatches = (e: { matchesCount?: Matches }) => e.matchesCount && setMatches(e.matchesCount);
    eventBus.on("updatefindmatchescount", onMatches);
    eventBus.on("updatefindcontrolstate", onMatches);

    let destroyed = false;
    const task = pdfjs.getDocument({
      url: assetUrl(tab.info.path),
      cMapUrl: `${ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`,
      iccUrl: `${ASSETS}iccs/`,
    });
    task.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      const password = window.prompt(
        reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD
          ? "Senha incorreta. Tente novamente:"
          : "Este PDF é protegido por senha. Digite a senha:",
      );
      if (password === null) {
        setError("O PDF é protegido por senha.");
        setLoading(false);
        void task.destroy();
      } else {
        updatePassword(password);
      }
    };
    task.promise.then(
      (pdf) => {
        if (destroyed) return;
        pdfViewer.setDocument(pdf);
        linkService.setDocument(pdf);
        setPages(pdf.numPages);
        setLoading(false);
      },
      (e) => {
        if (destroyed) return;
        setError(errorMessage(e));
        setLoading(false);
      },
    );

    // Reaplica o zoom relativo quando a área muda (redimensionar ou reexibir a aba).
    let frame = 0;
    const observer = new ResizeObserver(() => {
      // Adia para o próximo quadro (evita o loop do ResizeObserver) e ignora
      // quando a aba está oculta: sem layout o pdf.js não consegue rolar.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!el.offsetParent) return;
        const current = pdfViewer.currentScaleValue;
        if (pdfViewer.pdfDocument && RELATIVE_SCALES.has(current)) pdfViewer.currentScaleValue = current;
      });
    });
    observer.observe(el);

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) pdfViewer.increaseScale();
      else pdfViewer.decreaseScale();
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    // Links externos abrem no navegador padrão, não dentro do app.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a");
      const href = link?.getAttribute("href") ?? "";
      if (/^(https?:|mailto:)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        void openUrl(href);
      }
    };
    el.addEventListener("click", onClick, true);

    return () => {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("click", onClick, true);
      void task.destroy();
    };
  }, [tab.info.path]);

  useEffect(() => {
    setStatus(tab.id, {
      page: pages ? `Página ${page} de ${pages}` : "",
      zoom: `${Math.round(scale * 100)}%`,
    });
  }, [page, pages, scale, setStatus, tab.id]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const find = (again: boolean, previous = false, text = query) => {
    bus.current?.dispatch("find", {
      source: null,
      type: again ? "again" : "",
      query: text,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    });
  };

  const goToPage = (n: number) => {
    if (viewer.current && n >= 1 && n <= pages) viewer.current.currentPageNumber = n;
    else setPageInput(String(page));
  };

  return (
    <div className="viewer">
      <Toolbar>
        <button className="icon-button" title="Página anterior" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
          <ChevronLeftIcon />
        </button>
        <input
          className="text-input page-input"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && goToPage(Number(pageInput))}
          onBlur={() => setPageInput(String(page))}
          aria-label="Página"
        />
        <span className="toolbar-label">de {pages || "…"}</span>
        <button className="icon-button" title="Próxima página" disabled={page >= pages} onClick={() => goToPage(page + 1)}>
          <ChevronRightIcon />
        </button>
        <span className="toolbar-sep" />
        <button className="icon-button" title="Diminuir zoom" onClick={() => viewer.current?.decreaseScale()}>
          <ZoomOutIcon />
        </button>
        <select
          className="text-input compact"
          value={SCALES.some((s) => s.value === scaleValue) ? scaleValue : "custom"}
          onChange={(e) => {
            if (viewer.current) viewer.current.currentScaleValue = e.target.value;
          }}
        >
          {!SCALES.some((s) => s.value === scaleValue) && <option value="custom">{Math.round(scale * 100)}%</option>}
          {SCALES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="icon-button" title="Aumentar zoom" onClick={() => viewer.current?.increaseScale()}>
          <ZoomInIcon />
        </button>
        <span className="spacer" />
        <div className="search-box">
          <SearchIcon size={14} />
          <input
            ref={searchInput}
            placeholder="Buscar no PDF (Ctrl+F)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMatches(null);
              find(false, false, e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && find(true, e.shiftKey)}
          />
          {query && matches && (
            <span className="search-count">{matches.total ? `${matches.current} de ${matches.total}` : "nenhum"}</span>
          )}
        </div>
      </Toolbar>
      <div className="viewer-body pdf-body">
        {loading && <Loading label="Abrindo PDF…" />}
        {error && <ErrorView message={error} path={tab.info.path} />}
        <div ref={container} className="pdf-container" hidden={!!error}>
          <div className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}
