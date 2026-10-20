import { useState } from "react";

import { useApp } from "../../app/store";
import { ErrorView, Loading, Toolbar } from "../../components/common";
import { SaveIcon } from "../../components/icons";
import type { ViewerProps } from "../registry";
import { CodeEditor } from "./CodeEditor";
import { LANGUAGE_NAMES, languageKey } from "./languages";
import { TextBanners } from "./TextBanners";
import { useTextDocument } from "./useTextDocument";

/** Texto corrido quebra linha por padrão; código não. */
const PROSE = new Set(["txt", "text", "log", "nfo", "srt", "vtt", "rst", "adoc", "tex", ""]);

export default function TextViewer({ tab }: ViewerProps) {
  const { doc, error, onChange, save } = useTextDocument(tab);
  const [wrap, setWrap] = useState(PROSE.has(tab.info.ext));
  const setStatus = useApp((s) => s.setStatus);
  const language = languageKey(tab.info.ext, tab.info.name);

  if (error) return <ErrorView message={error} path={tab.info.path} />;
  if (!doc) return <Loading />;

  return (
    <div className="viewer">
      <Toolbar>
        <button className="icon-button" title="Salvar (Ctrl+S)" disabled={!tab.dirty || doc.readOnly} onClick={() => void save()}>
          <SaveIcon />
        </button>
        <span className="toolbar-sep" />
        <label className="toolbar-label checkbox">
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Quebrar linhas
        </label>
        <span className="spacer" />
        <span className="toolbar-label">
          {doc.readOnly ? "Somente leitura · " : ""}
          {language ? LANGUAGE_NAMES[language] : "Texto simples"}
        </span>
      </Toolbar>
      <TextBanners doc={doc} />
      <div className="viewer-body">
        <CodeEditor
          initialValue={doc.content}
          language={language}
          readOnly={doc.readOnly}
          wrap={wrap}
          onChange={onChange}
          onCursor={(line, col) => setStatus(tab.id, { cursor: `Ln ${line}, Col ${col}` })}
        />
      </div>
    </div>
  );
}
