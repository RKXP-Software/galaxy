import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { showMinimap } from "@replit/codemirror-minimap";

import { usePrefersDark } from "../../lib/usePrefersDark";
import { registerController } from "../../app/controllers";
import { loadLanguage } from "./languages";
import { portuguesePhrases } from "./phrases";
import { baseTheme, editorTheme } from "./theme";

interface Props {
  /** Conteúdo inicial. O editor só é recriado quando `docKey` muda. */
  initialValue: string;
  docKey?: string | number;
  language: string | null;
  readOnly?: boolean;
  wrap?: boolean;
  /** Aba dona do editor: permite à busca e ao diff levar o cursor até uma linha. */
  tabId?: string;
  /** Chamado antes de ir até uma linha, para o visualizador mostrar o editor se estiver oculto. */
  beforeReveal?: () => void;
  /** Miniatura do arquivo na lateral, como no VS Code. */
  minimap?: boolean;
  /** Recebe uma função que lê o texto atual (evita copiar o documento a cada tecla). */
  onChange?: (getValue: () => string) => void;
  onCursor?: (line: number, column: number) => void;
}

/** Acima disso o minimapa pesa mais do que ajuda. */
const MINIMAP_MAX_CHARS = 2_000_000;

function minimapExtension(enabled: boolean) {
  if (!enabled) return [];
  return showMinimap.compute(["doc"], () => ({
    create: () => ({ dom: document.createElement("div") }),
    displayText: "characters",
    showOverlay: "always",
  }));
}

export function CodeEditor({ initialValue, docKey, language, readOnly = false, wrap = false, minimap = true, tabId, beforeReveal, onChange, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onCursor, beforeReveal });
  callbacks.current = { onChange, onCursor, beforeReveal };
  const compartments = useRef({
    language: new Compartment(),
    theme: new Compartment(),
    readOnly: new Compartment(),
    wrap: new Compartment(),
    minimap: new Compartment(),
  });
  const dark = usePrefersDark();

  useEffect(() => {
    const c = compartments.current;
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          baseTheme,
          portuguesePhrases,
          c.language.of([]),
          c.theme.of(editorTheme(dark)),
          c.readOnly.of(EditorState.readOnly.of(readOnly)),
          c.wrap.of(wrap ? EditorView.lineWrapping : []),
          c.minimap.of(minimapExtension(minimap && initialValue.length <= MINIMAP_MAX_CHARS)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const state = update.state;
              callbacks.current.onChange?.(() => state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              callbacks.current.onCursor?.(line.number, head - line.from + 1);
            }
          }),
        ],
      }),
    });
    view.current = editor;
    callbacks.current.onCursor?.(1, 1);
    const unregister = tabId
      ? registerController(tabId, {
          reveal: (line, column, length) => {
            callbacks.current.beforeReveal?.();
            // Dois quadros: dá tempo de o editor aparecer e ser medido antes de rolar.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const doc = editor.state.doc;
                const ln = doc.line(Math.min(Math.max(line, 1), doc.lines));
                const from = Math.min(ln.from + Math.max(column - 1, 0), ln.to);
                const to = Math.min(from + length, ln.to);
                editor.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
                editor.focus();
              }),
            );
          },
        })
      : undefined;
    return () => {
      unregister?.();
      editor.destroy();
      view.current = null;
    };
    // O editor é recriado só quando o documento muda; o resto é reconfigurado abaixo.
  }, [docKey]);

  useEffect(() => {
    let cancelled = false;
    void loadLanguage(language).then((ext) => {
      if (!cancelled) view.current?.dispatch({ effects: compartments.current.language.reconfigure(ext) });
    });
    return () => {
      cancelled = true;
    };
  }, [language, docKey]);

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.current.theme.reconfigure(editorTheme(dark)) });
  }, [dark]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.readOnly.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const big = (view.current?.state.doc.length ?? 0) > MINIMAP_MAX_CHARS;
    view.current?.dispatch({ effects: compartments.current.minimap.reconfigure(minimapExtension(minimap && !big)) });
  }, [minimap]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  return <div className="code-editor" ref={host} />;
}
