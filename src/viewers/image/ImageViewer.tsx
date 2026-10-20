import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import { useApp } from "../../app/store";
import { ErrorView, Toolbar } from "../../components/common";
import { RotateIcon, ZoomInIcon, ZoomOutIcon } from "../../components/icons";
import { assetUrl } from "../../lib/tauri";
import type { ViewerProps } from "../registry";

interface View {
  scale: number;
  x: number;
  y: number;
  rotate: number;
  /** Reajusta à janela quando ela muda de tamanho. */
  fit: boolean;
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 40;
const STEP = 1.2;
const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

export default function ImageViewer({ tab, active }: ViewerProps) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0, rotate: 0, fit: true });
  const setStatus = useApp((s) => s.setStatus);

  const fitScale = useCallback(
    (rotate: number) => {
      const el = stage.current;
      if (!el || !natural) return 1;
      const sideways = rotate % 180 !== 0;
      const w = sideways ? natural.h : natural.w;
      const h = sideways ? natural.w : natural.h;
      // Não amplia imagens pequenas além do tamanho real ao ajustar.
      return Math.min(1, (el.clientWidth - 32) / w, (el.clientHeight - 32) / h);
    },
    [natural],
  );

  const fit = useCallback(() => setView((v) => ({ ...v, scale: fitScale(v.rotate), x: 0, y: 0, fit: true })), [fitScale]);

  // Ajusta ao carregar e quando a área muda de tamanho (inclusive ao reexibir a aba).
  useEffect(() => {
    const el = stage.current;
    if (!el || !natural) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setView((v) => (v.fit ? { ...v, scale: fitScale(v.rotate), x: 0, y: 0 } : v)));
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [natural, fitScale]);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = stage.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Mantém fixo o ponto sob o cursor (ou o centro).
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
    setView((v) => {
      const scale = clamp(v.scale * factor);
      const k = scale / v.scale;
      return { ...v, scale, x: px - k * (px - v.x), y: py - k * (py - v.y), fit: false };
    });
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? STEP : 1 / STEP, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const rotate = useCallback(
    () =>
      setView((v) => {
        const r = (v.rotate + 90) % 360;
        return v.fit ? { ...v, rotate: r, scale: fitScale(r), x: 0, y: 0 } : { ...v, rotate: r };
      }),
    [fitScale],
  );

  const actual = () => setView((v) => ({ ...v, scale: 1, x: 0, y: 0, fit: false }));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || (e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === "+" || e.key === "=") zoomAt(STEP);
      else if (e.key === "-") zoomAt(1 / STEP);
      else if (e.key === "0") fit();
      else if (e.key === "1") actual();
      else if (e.key.toLowerCase() === "r") rotate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, zoomAt, fit, rotate]);

  useEffect(() => {
    setStatus(tab.id, {
      dims: natural ? `${natural.w} × ${natural.h} px` : "",
      zoom: `${Math.round(view.scale * 100)}%`,
    });
  }, [natural, view.scale, setStatus, tab.id]);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy, fit: false }));
  };

  if (failed) {
    return <ErrorView message="O formato desta imagem não é suportado ou o arquivo está corrompido." path={tab.info.path} />;
  }

  return (
    <div className="viewer">
      <Toolbar>
        <button className="icon-button" title="Diminuir (-)" onClick={() => zoomAt(1 / STEP)}>
          <ZoomOutIcon />
        </button>
        <span className="toolbar-label zoom-label">{Math.round(view.scale * 100)}%</span>
        <button className="icon-button" title="Aumentar (+)" onClick={() => zoomAt(STEP)}>
          <ZoomInIcon />
        </button>
        <span className="toolbar-sep" />
        <button className={`secondary-button compact${view.fit ? " active" : ""}`} title="Ajustar à janela (0)" onClick={fit}>
          Ajustar
        </button>
        <button className="secondary-button compact" title="Tamanho real (1)" onClick={actual}>
          100%
        </button>
        <button className="icon-button" title="Girar 90° (R)" onClick={rotate}>
          <RotateIcon />
        </button>
      </Toolbar>
      <div
        ref={stage}
        className="viewer-body image-stage checker"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => (view.fit ? actual() : fit())}
      >
        <img
          src={assetUrl(tab.info.path)}
          alt={tab.info.name}
          draggable={false}
          style={{
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${view.rotate}deg)`,
            imageRendering: view.scale > 3 ? "pixelated" : "auto",
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNatural({ w: img.naturalWidth || 300, h: img.naturalHeight || 150 });
          }}
          onError={() => setFailed(true)}
        />
      </div>
    </div>
  );
}
