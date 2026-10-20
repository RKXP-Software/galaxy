import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

import { usePrefersDark } from "../../lib/usePrefersDark";
import { loadLanguage } from "./languages";

interface Props {
  /** Conteúdo inicial. O editor só é recriado quando `docKey` muda. */
  initialValue: string;
  docKey?: string | number;
  language: string | null;
  readOnly?: boolean;
  wrap?: boolean;
  /** Recebe uma função que lê o texto atual (evita copiar o documento a cada tecla). */
  onChange?: (getValue: () => string) => void;
  onCursor?: (line: number, column: number) => void;
}

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.55" },
  ".cm-content": { userSelect: "text" },
});

const lightTheme = EditorView.theme({
  "&": { backgroundColor: "var(--bg-elev)", color: "var(--fg)" },
  ".cm-gutters": { backgroundColor: "var(--bg-elev)", borderRight: "1px solid var(--border)", color: "var(--fg-muted)" },
  ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "var(--bg-hover)" },
});

export function CodeEditor({ initialValue, docKey, language, readOnly = false, wrap = false, onChange, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onCursor });
  callbacks.current = { onChange, onCursor };
  const compartments = useRef({
    language: new Compartment(),
    theme: new Compartment(),
    readOnly: new Compartment(),
    wrap: new Compartment(),
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
          c.language.of([]),
          c.theme.of(dark ? oneDark : lightTheme),
          c.readOnly.of(EditorState.readOnly.of(readOnly)),
          c.wrap.of(wrap ? EditorView.lineWrapping : []),
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
    return () => {
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
    view.current?.dispatch({ effects: compartments.current.theme.reconfigure(dark ? oneDark : lightTheme) });
  }, [dark]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.readOnly.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  return <div className="code-editor" ref={host} />;
}
