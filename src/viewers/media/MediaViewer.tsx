import { useEffect, useRef, useState } from "react";

import { useApp } from "../../app/store";
import { ErrorView, Toolbar } from "../../components/common";
import { ViewerIcon } from "../../components/icons";
import { assetUrl } from "../../lib/tauri";
import type { ViewerProps } from "../registry";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export default function MediaViewer({ tab, active }: ViewerProps) {
  const isVideo = tab.viewer === "video";
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const setStatus = useApp((s) => s.setStatus);

  // Trocar de aba pausa a reprodução.
  useEffect(() => {
    if (!active) media.current?.pause();
  }, [active]);

  useEffect(() => {
    if (media.current) media.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = media.current;
      if (!el || e.ctrlKey || (e.target as HTMLElement).closest("input, select, textarea, button")) return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "k") {
        e.preventDefault();
        if (el.paused) void el.play();
        else el.pause();
      } else if (key === "arrowright" || key === "arrowleft") {
        // O controle nativo já trata as setas quando tem o foco.
        if (e.target === el) return;
        e.preventDefault();
        el.currentTime = Math.max(0, el.currentTime + (key === "arrowright" ? 5 : -5));
      } else if (key === "m") {
        el.muted = !el.muted;
      } else if (key === "f" && isVideo) {
        void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, isVideo]);

  if (error) return <ErrorView title="Não foi possível reproduzir" message={error} path={tab.info.path} />;

  const common = {
    ref: media,
    src: assetUrl(tab.info.path),
    controls: true,
    loop,
    preload: "metadata" as const,
    onLoadedMetadata: () => {
      const el = media.current!;
      el.playbackRate = rate;
      setStatus(tab.id, {
        duration: formatDuration(el.duration),
        dims: isVideo && el.videoWidth ? `${el.videoWidth} × ${el.videoHeight}` : "",
      });
    },
    onError: () => {
      const code = media.current?.error?.code;
      setError(
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_DECODE
          ? "O formato ou codec deste arquivo não é suportado pelo motor de reprodução do Windows (WebView2). Vídeos MP4 precisam estar em H.264; MKV e HEVC não são suportados."
          : "Ocorreu um erro ao carregar o arquivo de mídia.",
      );
    },
  };

  return (
    <div className="viewer">
      <Toolbar>
        <label className="toolbar-label">
          Velocidade{" "}
          <select className="text-input compact" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s.toLocaleString("pt-BR")}×
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-label checkbox">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Repetir
        </label>
        <span className="spacer" />
        <span className="toolbar-label">Espaço: tocar/pausar · ←/→: 5 s · M: mudo{isVideo ? " · F: tela cheia" : ""}</span>
      </Toolbar>
      <div className="viewer-body media-stage">
        {isVideo ? (
          <video {...common} className="media-video" />
        ) : (
          <div className="audio-card">
            <div className="audio-art">
              <ViewerIcon viewer="audio" size={56} />
            </div>
            <div className="audio-title" title={tab.info.name}>
              {tab.info.name}
            </div>
            <audio {...common} className="media-audio" />
          </div>
        )}
      </div>
    </div>
  );
}
