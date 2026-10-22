import { openWithSystem, revealInExplorer } from "../app/actions";
import { useActiveTab, useApp } from "../app/store";
import { VIEWER_LABELS, type ViewerId } from "../lib/fileTypes";
import { formatBytes, formatDate } from "../lib/format";
import { ExternalIcon, FolderOpenIcon } from "./icons";

const VIEWER_OPTIONS = (Object.entries(VIEWER_LABELS) as [ViewerId, string][]).filter(([id]) => id !== "diff");

export function StatusBar() {
  const tab = useActiveTab();
  const setViewer = useApp((s) => s.setViewer);

  if (!tab) {
    return (
      <footer className="statusbar">
        <span>Pronto</span>
        <span className="spacer" />
        <span>Ctrl+O para abrir</span>
      </footer>
    );
  }

  // Arquivo novo e comparação não têm caminho em disco.
  const hasFile = !!tab.info.path;
  // Trocar o visualizador não faz sentido numa comparação nem num arquivo ainda não salvo.
  const canSwitchViewer = tab.viewer !== "diff" && !tab.untitled;

  return (
    <footer className="statusbar">
      <span title={tab.info.path} className="status-path">
        {hasFile ? tab.info.path : tab.untitled ? "Arquivo novo, ainda não salvo" : tab.info.name}
      </span>
      <span className="spacer" />
      {Object.entries(tab.status).map(([key, value]) =>
        value ? (
          <span key={key} className="status-item">
            {value}
          </span>
        ) : null,
      )}
      {hasFile && <span className="status-item">{formatBytes(tab.info.size)}</span>}
      {hasFile && tab.info.modified != null && (
        <span className="status-item" title="Modificado em">
          {formatDate(tab.info.modified)}
        </span>
      )}
      {canSwitchViewer && (
        <label className="status-item status-select" title="Abrir este arquivo com outro visualizador">
          <select value={tab.viewer} onChange={(e) => setViewer(tab.id, e.target.value as ViewerId)}>
            {VIEWER_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {hasFile && (
        <>
          <button className="icon-button small" title="Mostrar na pasta" onClick={() => void revealInExplorer(tab.info.path)}>
            <FolderOpenIcon size={14} />
          </button>
          <button className="icon-button small" title="Abrir no app padrão do Windows" onClick={() => void openWithSystem(tab.info.path)}>
            <ExternalIcon size={14} />
          </button>
        </>
      )}
    </footer>
  );
}
