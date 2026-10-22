import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getChunks, goToNextChunk, goToPreviousChunk, MergeView, unifiedMergeView } from "@codemirror/merge";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { useApp } from "../../app/store";
import { ErrorView, Loading, Segmented, Toolbar } from "../../components/common";
import { ChevronLeftIcon, ChevronRightIcon, RotateIcon } from "../../components/icons";
import { GROUPS } from "../../lib/fileTypes";
import { api, errorMessage, type HistoryVersion } from "../../lib/tauri";
import { usePrefersDark } from "../../lib/usePrefersDark";
import type { ViewerProps } from "../registry";
import { languageKey, loadLanguage } from "../text/languages";
import { portuguesePhrases } from "../text/phrases";
import { baseTheme, editorTheme, mergeBaseTheme } from "../text/theme";
import { buildOptions, resolveSource, type ResolvedSource, type SourceOption } from "./sources";

type Mode = "side" | "unified";

const MODES: { value: Mode; label: string }[] = [
  { value: "side", label: "Lado a lado" },
  { value: "unified", label: "Unificado" },
];

const GROUP_ORDER: SourceOption["group"][] = ["Esta aba", "Histórico", "Outras abas", "Arquivos"];

const COLLAPSE = { margin: 3, minSize: 4 };

function SourceSelect({
  label,
  value,
  options,
  onChange,
  onPickFile,
}: {
  label: string;
  value: string;
  options: SourceOption[];
  onChange: (key: string) => void;
  onPickFile: () => void;
}) {
  return (
    <label className="toolbar-label diff-source">
      {label}
      <select
        className="text-input compact"
        value={options.some((o) => o.key === value) ? value : ""}
        onChange={(e) => (e.target.value === "__file" ? onPickFile() : onChange(e.target.value))}
      >
        {!options.some((o) => o.key === value) && <option value="">(indisponível)</option>}
        {GROUP_ORDER.map((group) => {
          const items = options.filter((o) => o.group === group);
          return items.length ? (
            <optgroup key={group} label={group}>
              {items.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
        <option value="__file">Escolher arquivo…</option>
      </select>
    </label>
  );
}

export default function DiffViewer({ tab }: ViewerProps) {
  const spec = tab.diff!;
  const source = useApp((s) => s.tabs.find((t) => t.id === spec.sourceTabId));
  const setStatus = useApp((s) => s.setStatus);
  const dark = usePrefersDark();

  const [left, setLeft] = useState(spec.left);
  const [right, setRight] = useState(spec.right);
  const [mode, setMode] = useState<Mode>("side");
  const [collapse, setCollapse] = useState(true);
  const [versions, setVersions] = useState<HistoryVersion[]>([]);
  const [extraFiles, setExtraFiles] = useState<string[]>(() =>
    [spec.left, spec.right].filter((k) => k.startsWith("file:")).map((k) => k.slice(5)),
  );
  const [texts, setTexts] = useState<{ left: ResolvedSource; right: ResolvedSource } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [diffCount, setDiffCount] = useState<number | null>(null);
  const [language, setLanguage] = useState<Extension>([]);

  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);

  const path = source?.info.path;
  useEffect(() => {
    if (path) void api.historyList(path).then(setVersions, () => setVersions([]));
  }, [path, refresh]);

  const options = useMemo(
    () => buildOptions(spec.sourceTabId, versions, extraFiles),
    // refresh: as abas abertas e o texto atual podem ter mudado.
    [spec.sourceTabId, versions, extraFiles, refresh, source?.dirty],
  );

  // Texto de cada lado.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([resolveSource(left, spec.sourceTabId), resolveSource(right, spec.sourceTabId)]).then(
      ([l, r]) => !cancelled && setTexts({ left: l, right: r }),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [left, right, spec.sourceTabId, refresh]);

  // Destaque de sintaxe pela extensão do arquivo de origem.
  const langKey = source ? languageKey(source.info.ext, source.info.name) : null;
  useEffect(() => {
    let cancelled = false;
    void loadLanguage(langKey).then((ext) => !cancelled && setLanguage(ext));
    return () => {
      cancelled = true;
    };
  }, [langKey]);

  // Monta o editor de diff sempre que algo muda.
  useEffect(() => {
    const parent = host.current;
    if (!parent || !texts) return;
    const shared: Extension[] = [basicSetup, portuguesePhrases, language, editorTheme(dark), EditorState.readOnly.of(true)];
    const warnings = [texts.left.warning, texts.right.warning].filter(Boolean);
    let destroy: () => void;
    let countChunks: () => number;

    if (mode === "side") {
      const view = new MergeView({
        a: { doc: texts.left.text, extensions: [...shared, mergeBaseTheme] },
        b: { doc: texts.right.text, extensions: [...shared, mergeBaseTheme] },
        parent,
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: collapse ? COLLAPSE : undefined,
      });
      editor.current = view.b;
      destroy = () => view.destroy();
      countChunks = () => view.chunks.length;
    } else {
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: texts.right.text,
          extensions: [
            ...shared,
            baseTheme,
            unifiedMergeView({
              original: texts.left.text,
              mergeControls: false,
              highlightChanges: true,
              gutter: true,
              collapseUnchanged: collapse ? COLLAPSE : undefined,
            }),
          ],
        }),
      });
      editor.current = view;
      destroy = () => view.destroy();
      countChunks = () => getChunks(view.state)?.chunks.length ?? 0;
    }

    // O diff é calculado depois da criação; lê a contagem no quadro seguinte.
    const frame = requestAnimationFrame(() => {
      const n = countChunks();
      setDiffCount(n);
      setStatus(tab.id, { diff: n === 0 ? "Sem diferenças" : `${n} ${n === 1 ? "diferença" : "diferenças"}` });
    });
    if (warnings.length) useApp.getState().notify("info", warnings.join(" "));

    return () => {
      cancelAnimationFrame(frame);
      destroy();
      editor.current = null;
    };
  }, [texts, mode, collapse, dark, language, setStatus, tab.id]);

  const pickFile = useCallback(
    async (side: "left" | "right") => {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: "Escolher arquivo para comparar",
        filters: [
          { name: "Arquivos de texto", extensions: GROUPS.filter((g) => ["text", "markdown", "json"].includes(g.viewer)).flatMap((g) => g.extensions).concat(["csv", "tsv"]) },
          { name: "Todos os arquivos", extensions: ["*"] },
        ],
      });
      if (typeof selected !== "string") return;
      setExtraFiles((files) => (files.includes(selected) ? files : [...files, selected]));
      (side === "left" ? setLeft : setRight)(`file:${selected}`);
    },
    [],
  );

  const step = (direction: 1 | -1) => {
    const view = editor.current;
    if (!view) return;
    (direction === 1 ? goToNextChunk : goToPreviousChunk)(view);
  };

  if (error) {
    return (
      <div className="viewer">
        <Toolbar>
          <button className="secondary-button compact" onClick={() => setRefresh((n) => n + 1)}>
            Tentar de novo
          </button>
        </Toolbar>
        <ErrorView title="Não foi possível comparar" message={error} />
      </div>
    );
  }

  return (
    <div className="viewer">
      <Toolbar>
        <SourceSelect label="Esquerda" value={left} options={options} onChange={setLeft} onPickFile={() => void pickFile("left")} />
        <button
          className="icon-button"
          title="Trocar os lados"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
        >
          <RotateIcon />
        </button>
        <SourceSelect label="Direita" value={right} options={options} onChange={setRight} onPickFile={() => void pickFile("right")} />
        <span className="toolbar-sep" />
        <Segmented value={mode} options={MODES} onChange={setMode} />
        <label className="toolbar-label checkbox">
          <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} /> Ocultar trechos iguais
        </label>
        <span className="toolbar-sep" />
        <button className="icon-button" title="Diferença anterior" disabled={!diffCount} onClick={() => step(-1)}>
          <ChevronLeftIcon />
        </button>
        <button className="icon-button" title="Próxima diferença" disabled={!diffCount} onClick={() => step(1)}>
          <ChevronRightIcon />
        </button>
        <button className="secondary-button compact" title="Ler os dois lados de novo" onClick={() => setRefresh((n) => n + 1)}>
          Atualizar
        </button>
      </Toolbar>
      {diffCount === 0 && texts && <div className="banner">Os dois lados são idênticos.</div>}
      <div className={`viewer-body diff-body${dark ? " dark" : ""}`}>
        {!texts && <Loading label="Comparando…" />}
        <div ref={host} className={`diff-host mode-${mode}`} />
      </div>
    </div>
  );
}
