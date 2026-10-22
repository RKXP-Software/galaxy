import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

export const baseTheme = EditorView.theme({
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

/** Tema do editor (compartilhado entre os editores e o diff). */
export const editorTheme = (dark: boolean): Extension => (dark ? oneDark : lightTheme);

/** Como o baseTheme, mas sem altura fixa: no diff lado a lado quem rola é o contêiner. */
export const mergeBaseTheme = EditorView.theme({
  "&": { fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.55" },
  ".cm-content": { userSelect: "text" },
});
