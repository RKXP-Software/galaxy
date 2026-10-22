// Pontos de entrada do diff: cada um decide o que comparar e abre a aba de comparação.
import { open } from "@tauri-apps/plugin-dialog";

import { GROUPS } from "../lib/fileTypes";
import { api, errorMessage } from "../lib/tauri";
import { getController } from "./controllers";
import { useApp, type Tab } from "./store";

const TEXT_FILTER = GROUPS.filter((g) => ["text", "markdown", "json"].includes(g.viewer))
  .flatMap((g) => g.extensions)
  .concat(["csv", "tsv"]);

/** Aba ativa, se for um arquivo de texto que sabe informar o conteúdo atual. */
function activeTextTab(): Tab | null {
  const { tabs, activeId, notify } = useApp.getState();
  const tab = tabs.find((t) => t.id === activeId);
  if (!tab || !getController(tab.id).getText) {
    notify("info", "Abra um arquivo de texto, markdown ou JSON para comparar.");
    return null;
  }
  return tab;
}

/** Alterações não salvas: o arquivo em disco contra o que está no editor. */
export function diffUnsaved() {
  const tab = activeTextTab();
  if (!tab) return;
  if (!tab.info.path) {
    useApp.getState().notify("info", "Salve o arquivo antes: ele ainda não existe em disco para comparar.");
    return;
  }
  useApp.getState().openDiff({ sourceTabId: tab.id, left: "disk", right: "current" }, `Alterações · ${tab.info.name}`);
}

/** Histórico: a versão anterior contra a mais recente (ou contra o editor, se houver alterações). */
export async function diffHistory() {
  const tab = activeTextTab();
  if (!tab) return;
  const { notify, openDiff } = useApp.getState();
  if (!tab.info.path) {
    notify("info", "Salve o arquivo primeiro: o histórico começa no primeiro salvamento.");
    return;
  }
  try {
    const versions = await api.historyList(tab.info.path);
    if (versions.length === 0) {
      notify("info", "Este arquivo ainda não tem versões guardadas. Elas são criadas a cada salvamento no Galaxy.");
      return;
    }
    const spec =
      tab.dirty || versions.length === 1
        ? { left: `version:${versions[0].id}`, right: "current" }
        : { left: `version:${versions[1].id}`, right: `version:${versions[0].id}` };
    openDiff({ sourceTabId: tab.id, ...spec }, `Histórico · ${tab.info.name}`);
  } catch (e) {
    notify("error", `Não foi possível ler o histórico: ${errorMessage(e)}`);
  }
}

/** Comparar o arquivo desta aba com outro escolhido no disco. */
export async function diffWithFile() {
  const tab = activeTextTab();
  if (!tab) return;
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Comparar com o arquivo…",
    filters: [
      { name: "Arquivos de texto", extensions: TEXT_FILTER },
      { name: "Todos os arquivos", extensions: ["*"] },
    ],
  });
  if (typeof selected !== "string") return;
  const other = selected.slice(Math.max(selected.lastIndexOf("\\"), selected.lastIndexOf("/")) + 1);
  useApp.getState().openDiff({ sourceTabId: tab.id, left: "current", right: `file:${selected}` }, `${tab.info.name} ↔ ${other}`);
}
