import { EditorState } from "@codemirror/state";

/** Textos do CodeMirror (busca, dobras, diff) em português. */
export const portuguesePhrases = EditorState.phrases.of({
  // Busca e substituição (Ctrl+F)
  Find: "Buscar",
  Replace: "Substituir",
  next: "próximo",
  previous: "anterior",
  all: "todos",
  "match case": "diferenciar maiúsculas",
  regexp: "regex",
  "by word": "palavra inteira",
  replace: "substituir",
  "replace all": "substituir todos",
  close: "fechar",
  "current match": "ocorrência atual",
  "replaced $ matches": "$ ocorrências substituídas",
  "replaced match on line $": "ocorrência substituída na linha $",
  "Go to line": "Ir para a linha",
  go: "ir",
  // Dobras de código
  "Fold line": "Dobrar linha",
  "Unfold line": "Desdobrar linha",
  "Folded lines": "Linhas dobradas",
  "Unfolded lines": "Linhas desdobradas",
  "folded code": "código dobrado",
  unfold: "desdobrar",
  "Control character": "Caractere de controle",
  // Diff
  "$ unchanged lines": "$ linhas iguais",
});
