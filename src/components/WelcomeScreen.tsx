import { openFileDialog } from "../app/actions";
import { useApp } from "../app/store";
import { GROUPS, viewerForExtension } from "../lib/fileTypes";
import { dirname } from "../lib/format";
import { CloseIcon, FolderOpenIcon, GalaxyLogo, ViewerIcon } from "./icons";

const fileName = (path: string) => path.slice(Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1);
const extOf = (path: string) => {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
};

/** Grupos exibidos na tela inicial (alguns nomes resumidos). */
const SHOWCASE = GROUPS.map((g) => ({
  viewer: g.viewer,
  label: g.label,
  sample: g.extensions.slice(0, g.viewer === "text" ? 6 : 5).join(", "),
}));

export function WelcomeScreen() {
  const recent = useApp((s) => s.recent);
  const openPaths = useApp((s) => s.openPaths);
  const removeRecent = useApp((s) => s.removeRecent);
  const clearRecent = useApp((s) => s.clearRecent);
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <GalaxyLogo size={72} />
        <h1>Galaxy</h1>
        <p>Abra qualquer arquivo: documentos, planilhas, PDFs, imagens, áudio, vídeo e mais.</p>
        <button className="primary-button" onClick={() => void openFileDialog()}>
          <FolderOpenIcon size={18} /> Abrir arquivo
        </button>
        <span className="hint">ou arraste arquivos para esta janela · Ctrl+O</span>
      </div>

      <div className="welcome-columns">
        <section className="welcome-card">
          <header>
            <h2>Recentes</h2>
            {recent.length > 0 && (
              <button className="link-button" onClick={() => void clearRecent()}>
                Limpar
              </button>
            )}
          </header>
          {recent.length === 0 ? (
            <p className="muted">Os arquivos que você abrir aparecem aqui.</p>
          ) : (
            <ul className="recent-list">
              {recent.map((path) => (
                <li key={path}>
                  <button className="recent-item" title={path} onClick={() => void openPaths([path])}>
                    <ViewerIcon viewer={viewerForExtension(extOf(path)) ?? "text"} size={16} />
                    <span className="recent-name">{fileName(path)}</span>
                    <span className="recent-dir">{dirname(path)}</span>
                  </button>
                  <button className="icon-button small" title="Remover da lista" onClick={() => void removeRecent(path)}>
                    <CloseIcon size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="welcome-card">
          <header>
            <h2>Formatos suportados</h2>
          </header>
          <ul className="format-list">
            {SHOWCASE.map((g) => (
              <li key={g.viewer}>
                <ViewerIcon viewer={g.viewer} size={16} />
                <strong>{g.label}</strong>
                <span className="muted">{g.sample}…</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
