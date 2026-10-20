import { useEffect, type RefObject } from "react";

import { ZoomInIcon, ZoomOutIcon } from "../../components/icons";

const STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const larger = (zoom: number) => STEPS.find((s) => s > zoom + 0.001);
const smaller = (zoom: number) => [...STEPS].reverse().find((s) => s < zoom - 0.001);

export function ZoomControls({ zoom, onChange }: { zoom: number; onChange: (zoom: number) => void }) {
  const down = smaller(zoom);
  const up = larger(zoom);
  return (
    <>
      <button className="icon-button" title="Diminuir zoom" disabled={!down} onClick={() => down && onChange(down)}>
        <ZoomOutIcon />
      </button>
      <button className="secondary-button compact zoom-label" title="Voltar a 100%" onClick={() => onChange(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button className="icon-button" title="Aumentar zoom" disabled={!up} onClick={() => up && onChange(up)}>
        <ZoomInIcon />
      </button>
    </>
  );
}

/** Ctrl + roda do mouse sobre o elemento muda o zoom. */
export function useWheelZoom(
  ref: RefObject<HTMLElement | null>,
  zoom: number,
  onChange: (zoom: number) => void,
  ready = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const next = e.deltaY < 0 ? larger(zoom) : smaller(zoom);
      if (next) onChange(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, zoom, onChange, ready]);
}
