import { open } from "@tauri-apps/plugin-dialog";

import { ALL_EXTENSIONS, GROUPS } from "../lib/fileTypes";
import { api, errorMessage } from "../lib/tauri";
import { getSaver } from "./savers";
import { useApp } from "./store";

export async function openFileDialog() {
  const selected = await open({
    multiple: true,
    directory: false,
    title: "Abrir arquivos",
    filters: [
      { name: "Todos os suportados", extensions: ALL_EXTENSIONS },
      ...GROUPS.map((g) => ({ name: g.label, extensions: g.extensions })),
      { name: "Todos os arquivos", extensions: ["*"] },
    ],
  });
  if (!selected) return;
  await useApp.getState().openPaths(Array.isArray(selected) ? selected : [selected]);
}

export async function saveActiveTab() {
  const { activeId, notify } = useApp.getState();
  const saver = activeId ? getSaver(activeId) : undefined;
  if (!saver) {
    if (activeId) notify("info", "Este tipo de arquivo não pode ser editado.");
    return;
  }
  await saver();
}

export async function closeActiveTab() {
  const { activeId, closeTab } = useApp.getState();
  if (activeId) await closeTab(activeId);
}

export async function openWithSystem(path: string) {
  try {
    await api.openWithSystem(path);
  } catch (e) {
    useApp.getState().notify("error", `Não foi possível abrir no app padrão: ${errorMessage(e)}`);
  }
}

export async function revealInExplorer(path: string) {
  try {
    await api.revealInExplorer(path);
  } catch (e) {
    useApp.getState().notify("error", errorMessage(e));
  }
}
