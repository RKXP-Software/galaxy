import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { openUrl } from "@tauri-apps/plugin-opener";

import { ErrorView, Loading, Toolbar } from "../../components/common";
import { errorMessage } from "../../lib/tauri";
import type { ViewerProps } from "../registry";
import { useBinary } from "./useBinary";
import { useWheelZoom, ZoomControls } from "./ZoomControls";

export default function DocxViewer({ tab }: ViewerProps) {
  const { data, error: readError } = useBinary(tab.info.path);
  const body = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!data || !body.current) return;
    let cancelled = false;
    const el = body.current;
    el.innerHTML = "";
    renderAsync(data, el, undefined, {
      className: "docx",
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      experimental: true,
    }).then(
      () => !cancelled && setRendered(true),
      (e) => !cancelled && setError(`O documento não pôde ser renderizado: ${errorMessage(e)}`),
    );
    return () => {
      cancelled = true;
    };
  }, [data]);

  useWheelZoom(scroller, zoom, setZoom);

  const message = readError ?? error;
  if (message) return <ErrorView message={message} path={tab.info.path} />;

  return (
    <div className="viewer">
      <Toolbar>
        <ZoomControls zoom={zoom} onChange={setZoom} />
      </Toolbar>
      <div
        className="viewer-body office-body"
        ref={scroller}
        onClick={(e) => {
          const href = (e.target as HTMLElement).closest("a")?.getAttribute("href") ?? "";
          if (/^(https?:|mailto:)/i.test(href)) {
            e.preventDefault();
            void openUrl(href);
          }
        }}
      >
        {!rendered && <Loading label="Renderizando documento…" />}
        <div ref={body} className="docx-host selectable" style={{ zoom }} />
      </div>
    </div>
  );
}
