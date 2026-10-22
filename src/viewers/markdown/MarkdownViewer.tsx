import { useEffect, useRef, useState } from "react";

import { useApp } from "../../app/store";
import { ErrorView, Loading, Segmented, Toolbar } from "../../components/common";
import { SaveIcon } from "../../components/icons";
import { dirname } from "../../lib/format";
import type { ViewerProps } from "../registry";
import { CodeEditor } from "../text/CodeEditor";
import { TextBanners } from "../text/TextBanners";
import { useTextDocument } from "../text/useTextDocument";
import { MarkdownPreview } from "./MarkdownPreview";

type Mode = "preview" | "split" | "edit";

const MODES: { value: Mode; label: string }[] = [
  { value: "preview", label: "Visualizar" },
  { value: "split", label: "Dividir" },
  { value: "edit", label: "Editar" },
];

export default function MarkdownViewer({ tab }: ViewerProps) {
  const { doc, error, onChange, save } = useTextDocument(tab);
  const [mode, setMode] = useState<Mode>("preview");
  const [source, setSource] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const setStatus = useApp((s) => s.setStatus);

  useEffect(() => {
    if (doc) setSource(doc.content);
  }, [doc]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (error) return <ErrorView message={error} path={tab.info.path} />;
  if (!doc) return <Loading />;

  return (
    <div className="viewer">
      <Toolbar>
        <Segmented value={mode} options={MODES} onChange={setMode} />
        <span className="toolbar-sep" />
        <button className="icon-button" title="Salvar (Ctrl+S)" disabled={!tab.dirty || doc.readOnly} onClick={() => void save()}>
          <SaveIcon />
        </button>
      </Toolbar>
      <TextBanners doc={doc} />
      <div className={`viewer-body panes mode-${mode}`}>
        {/* O editor fica montado mesmo oculto para não perder o histórico de desfazer. */}
        <div className="pane" hidden={mode === "preview"}>
          <CodeEditor
            tabId={tab.id}
            beforeReveal={() => setMode((m) => (m === "preview" ? "edit" : m))}
            initialValue={doc.content}
            language="md"
            wrap
            readOnly={doc.readOnly}
            onChange={(getter) => {
              onChange(getter);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => setSource(getter()), 250);
            }}
            onCursor={(line, col) => setStatus(tab.id, { cursor: `Ln ${line}, Col ${col}` })}
          />
        </div>
        <div className="pane preview-pane" hidden={mode === "edit"}>
          <MarkdownPreview source={source} baseDir={dirname(tab.info.path)} />
        </div>
      </div>
    </div>
  );
}
