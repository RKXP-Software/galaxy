import { useEffect, useState } from "react";

import { useApp, type Tab } from "../../app/store";
import { ErrorView, Loading, Segmented, Toolbar } from "../../components/common";
import { SaveIcon } from "../../components/icons";
import { encodingLabel } from "../../lib/format";
import { api, errorMessage, type SheetDims, type WorkbookInfo } from "../../lib/tauri";
import type { ViewerProps } from "../registry";
import { CodeEditor } from "../text/CodeEditor";
import { TextBanners } from "../text/TextBanners";
import { useTextDocument } from "../text/useTextDocument";
import { SheetGrid } from "./SheetGrid";

type Mode = "grid" | "text";

const MODES: { value: Mode; label: string }[] = [
  { value: "grid", label: "Grade" },
  { value: "text", label: "Texto" },
];

const DELIMITER_NAMES: Record<string, string> = { ",": "vírgula", ";": "ponto e vírgula", tab: "tabulação", "|": "barra vertical" };

/** Modo texto do CSV: edita e salva o arquivo bruto. */
function CsvText({ tab, onSaved }: { tab: Tab; onSaved: () => void }) {
  const { doc, error, onChange, save } = useTextDocument(tab, { onSaved });
  const setStatus = useApp((s) => s.setStatus);
  if (error) return <ErrorView message={error} path={tab.info.path} />;
  if (!doc) return <Loading />;
  return (
    <div className="viewer">
      <Toolbar>
        <button className="icon-button" title="Salvar (Ctrl+S)" disabled={!tab.dirty || doc.readOnly} onClick={() => void save()}>
          <SaveIcon />
        </button>
        <span className="toolbar-label">Edite o CSV como texto; a grade é atualizada ao salvar.</span>
      </Toolbar>
      <TextBanners doc={doc} />
      <div className="viewer-body">
        <CodeEditor
          initialValue={doc.content}
          language={null}
          readOnly={doc.readOnly}
          onChange={onChange}
          onCursor={(line, col) => setStatus(tab.id, { cursor: `Ln ${line}, Col ${col}` })}
        />
      </div>
    </div>
  );
}

export default function SheetViewer({ tab }: ViewerProps) {
  const path = tab.info.path;
  const [book, setBook] = useState<WorkbookInfo | null>(null);
  const [sheet, setSheet] = useState(0);
  const [dims, setDims] = useState<SheetDims | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("grid");
  const [textOpened, setTextOpened] = useState(false);
  const [version, setVersion] = useState(0);
  const setStatus = useApp((s) => s.setStatus);

  useEffect(() => {
    api.sheetOpen(path).then(setBook, (e) => setError(errorMessage(e)));
  }, [path]);

  useEffect(() => {
    if (!book) return;
    setDims(null);
    let cancelled = false;
    api.sheetLoad(path, sheet).then(
      (d) => {
        if (cancelled) return;
        setDims(d);
        setStatus(tab.id, {
          dims: `${d.rows.toLocaleString("pt-BR")} linhas × ${d.cols} colunas`,
          ...(d.delimiter ? { delimiter: `Separador: ${DELIMITER_NAMES[d.delimiter] ?? d.delimiter}` } : {}),
          ...(d.encoding ? { encoding: encodingLabel(d.encoding) } : {}),
        });
      },
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [book, path, sheet, version, setStatus, tab.id]);

  if (error && mode === "grid") return <ErrorView message={error} path={path} />;
  if (!book) return <Loading label="Abrindo planilha…" />;

  return (
    <div className="viewer">
      {book.isCsv && (
        <Toolbar>
          <Segmented
            value={mode}
            options={MODES}
            onChange={(m) => {
              setMode(m);
              if (m === "text") setTextOpened(true);
            }}
          />
          {tab.dirty && mode === "grid" && <span className="toolbar-label">Há alterações não salvas no modo Texto.</span>}
        </Toolbar>
      )}
      <div className="viewer-body sheet-body" hidden={mode !== "grid"}>
        {dims ? (
          dims.rows === 0 ? (
            <div className="center-message">Esta planilha está vazia.</div>
          ) : (
            <SheetGrid key={`${sheet}:${version}`} path={path} sheet={sheet} dims={dims} />
          )
        ) : (
          <Loading label="Lendo dados…" />
        )}
      </div>
      {/* Montado na primeira vez que o modo Texto é aberto, para preservar as edições. */}
      {textOpened && (
        <div className="viewer-body" hidden={mode !== "text"}>
          <CsvText tab={tab} onSaved={() => setVersion((v) => v + 1)} />
        </div>
      )}
      {!book.isCsv && book.sheets.length > 1 && (
        <div className="sheet-tabs">
          {book.sheets.map((name, i) => (
            <button key={name + i} className={i === sheet ? "active" : ""} onClick={() => setSheet(i)}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
