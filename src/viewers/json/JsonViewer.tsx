import { useEffect, useMemo, useState } from "react";

import { useApp } from "../../app/store";
import { ErrorView, Loading, Segmented, Toolbar } from "../../components/common";
import { SaveIcon } from "../../components/icons";
import type { ViewerProps } from "../registry";
import { CodeEditor } from "../text/CodeEditor";
import { TextBanners } from "../text/TextBanners";
import { useTextDocument } from "../text/useTextDocument";
import { JsonTree, type TreeCommand } from "./JsonTree";

type Mode = "tree" | "text";

const MODES: { value: Mode; label: string }[] = [
  { value: "tree", label: "Árvore" },
  { value: "text", label: "Texto" },
];

export default function JsonViewer({ tab }: ViewerProps) {
  const { doc, error, onChange, save, getValue } = useTextDocument(tab);
  const [mode, setMode] = useState<Mode>("tree");
  const [source, setSource] = useState<string | null>(null);
  const [command, setCommand] = useState<TreeCommand>({ version: 0, open: false });
  const setStatus = useApp((s) => s.setStatus);

  useEffect(() => {
    if (doc) setSource(doc.content);
  }, [doc]);

  const parsed = useMemo(() => {
    if (source === null || mode !== "tree") return null;
    try {
      return { value: JSON.parse(source) as unknown };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source, mode]);

  if (error) return <ErrorView message={error} path={tab.info.path} />;
  if (!doc) return <Loading />;

  const changeMode = (next: Mode) => {
    // A árvore sempre reflete o texto atual, inclusive edições não salvas.
    if (next === "tree") setSource(getValue());
    setMode(next);
  };

  return (
    <div className="viewer">
      <Toolbar>
        <Segmented value={mode} options={MODES} onChange={changeMode} />
        <span className="toolbar-sep" />
        <button className="icon-button" title="Salvar (Ctrl+S)" disabled={!tab.dirty || doc.readOnly} onClick={() => void save()}>
          <SaveIcon />
        </button>
        {mode === "tree" && parsed && "value" in parsed && (
          <>
            <span className="toolbar-sep" />
            <button className="secondary-button compact" onClick={() => setCommand({ version: command.version + 1, open: true })}>
              Expandir tudo
            </button>
            <button className="secondary-button compact" onClick={() => setCommand({ version: command.version + 1, open: false })}>
              Recolher tudo
            </button>
          </>
        )}
      </Toolbar>
      <TextBanners doc={doc} />
      <div className="viewer-body">
        <div className="pane-fill" hidden={mode !== "text"}>
          <CodeEditor
            tabId={tab.id}
            beforeReveal={() => setMode("text")}
            initialValue={doc.content}
            language="json"
            readOnly={doc.readOnly}
            onChange={onChange}
            onCursor={(line, col) => setStatus(tab.id, { cursor: `Ln ${line}, Col ${col}` })}
          />
        </div>
        {mode === "tree" && parsed && "error" in parsed && (
          <ErrorView title="JSON inválido" message={`${parsed.error}. Use o modo Texto para corrigir.`} />
        )}
        {mode === "tree" && parsed && "value" in parsed && <JsonTree value={parsed.value} command={command} />}
      </div>
    </div>
  );
}
