import { useEffect, useRef, useState, type ReactNode } from "react";

import { openWithSystem } from "../../app/actions";
import { useApp } from "../../app/store";
import { ErrorView, Loading, Toolbar } from "../../components/common";
import { ExternalIcon } from "../../components/icons";
import { api, errorMessage, type DocBlock, type ExtractedDoc } from "../../lib/tauri";
import type { ViewerProps } from "../registry";
import { useWheelZoom, ZoomControls } from "./ZoomControls";

const FORMAT_NAMES: Record<ExtractedDoc["format"], string> = {
  doc: "Word 97-2003",
  rtf: "RTF",
  odt: "OpenDocument",
  text: "Texto",
};

function renderBlocks(blocks: DocBlock[]): ReactNode[] {
  const out: ReactNode[] = [];
  let list: DocBlock[] = [];
  const flushList = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`}>
          {list.map((b, i) => (
            <li key={i}>{b.text}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  blocks.forEach((block, i) => {
    if (block.kind === "li") {
      list.push(block);
      return;
    }
    flushList();
    const heading = /^h([1-6])$/.exec(block.kind);
    if (heading) {
      const Tag = `h${heading[1]}` as "h1";
      out.push(<Tag key={i}>{block.text}</Tag>);
    } else {
      out.push(<p key={i}>{block.text}</p>);
    }
  });
  flushList();
  return out;
}

export default function ExtractedViewer({ tab }: ViewerProps) {
  const [doc, setDoc] = useState<ExtractedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const setStatus = useApp((s) => s.setStatus);
  const notify = useApp((s) => s.notify);
  useWheelZoom(scroller, zoom, setZoom, doc !== null);

  useEffect(() => {
    let cancelled = false;
    api.extractDocument(tab.info.path).then(
      (d) => {
        if (cancelled) return;
        setDoc(d);
        setStatus(tab.id, { format: FORMAT_NAMES[d.format], words: `${countWords(d.blocks).toLocaleString("pt-BR")} palavras` });
      },
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [tab.info.path, tab.id, setStatus]);

  if (error) return <ErrorView message={error} path={tab.info.path} />;
  if (!doc) return <Loading label="Extraindo texto…" />;

  const copyAll = async () => {
    await navigator.clipboard.writeText(doc.blocks.map((b) => b.text).join("\n\n"));
    notify("info", "Texto copiado.");
  };

  return (
    <div className="viewer">
      <Toolbar>
        <ZoomControls zoom={zoom} onChange={setZoom} />
        <span className="toolbar-sep" />
        <button className="secondary-button compact" onClick={() => void copyAll()}>
          Copiar texto
        </button>
      </Toolbar>
      <div className="banner">
        Visualização simplificada ({FORMAT_NAMES[doc.format]}): só o texto é exibido, sem imagens e formatação.
        <button className="link-button" onClick={() => void openWithSystem(tab.info.path)}>
          <ExternalIcon size={12} /> Abrir no app padrão
        </button>
      </div>
      <div className="viewer-body office-body" ref={scroller}>
        <article className="text-page selectable" style={{ zoom }}>
          {doc.blocks.length ? renderBlocks(doc.blocks) : <p className="muted">O documento não contém texto.</p>}
        </article>
      </div>
    </div>
  );
}

function countWords(blocks: DocBlock[]): number {
  return blocks.reduce((n, b) => n + (b.text.match(/\S+/g)?.length ?? 0), 0);
}
