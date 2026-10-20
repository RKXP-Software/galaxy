import { useEffect, useRef, useState } from "react";
import { init } from "pptx-preview";

import { ErrorView, Loading, Toolbar } from "../../components/common";
import { errorMessage } from "../../lib/tauri";
import type { ViewerProps } from "../registry";
import { useBinary } from "./useBinary";
import { useWheelZoom, ZoomControls } from "./ZoomControls";

/** Largura base dos slides; o zoom escala a partir dela. */
const SLIDE_WIDTH = 960;

export default function PptxViewer({ tab }: ViewerProps) {
  const { data, error: readError } = useBinary(tab.info.path);
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!data || !host.current) return;
    let cancelled = false;
    const previewer = init(host.current, { width: SLIDE_WIDTH, height: (SLIDE_WIDTH * 9) / 16, mode: "list" });
    previewer.preview(data).then(
      () => !cancelled && setRendered(true),
      (e) => !cancelled && setError(`A apresentação não pôde ser renderizada: ${errorMessage(e)}`),
    );
    return () => {
      cancelled = true;
      previewer.destroy();
    };
  }, [data]);

  useWheelZoom(scroller, zoom, setZoom);

  const message = readError ?? error;
  if (message) return <ErrorView message={message} path={tab.info.path} />;

  return (
    <div className="viewer">
      <Toolbar>
        <ZoomControls zoom={zoom} onChange={setZoom} />
        <span className="spacer" />
        <span className="toolbar-label">Visualização aproximada: alguns efeitos e fontes podem diferir do PowerPoint.</span>
      </Toolbar>
      <div className="viewer-body office-body" ref={scroller}>
        {!rendered && <Loading label="Renderizando slides…" />}
        <div ref={host} className="pptx-host" style={{ zoom }} />
      </div>
    </div>
  );
}
