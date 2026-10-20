// Integração da janela com o sistema: atalhos, arrastar e soltar,
// arquivos vindos da linha de comando e confirmação ao fechar.
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/tauri";
import { closeActiveTab, openFileDialog, saveActiveTab } from "./actions";
import { useApp } from "./store";

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // Em produção, recarregar a página perderia as abas abertas.
      if (import.meta.env.PROD && (key === "f5" || (e.ctrlKey && key === "r"))) {
        e.preventDefault();
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      const { cycle } = useApp.getState();
      if (key === "o") {
        e.preventDefault();
        void openFileDialog();
      } else if (key === "s") {
        e.preventDefault();
        void saveActiveTab();
      } else if (key === "w" || key === "f4") {
        e.preventDefault();
        void closeActiveTab();
      } else if (key === "tab") {
        e.preventDefault();
        cycle(e.shiftKey ? -1 : 1);
      } else if (key === "pagedown" || key === "pageup") {
        e.preventDefault();
        cycle(key === "pagedown" ? 1 : -1);
      } else if (key === "p") {
        // Imprimir a janela inteira não faz sentido aqui.
        e.preventDefault();
      }
    };
    // Captura: o atalho vale mesmo com o foco dentro do editor.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

/** Liga arrastar e soltar; devolve se há arquivos sendo arrastados sobre a janela. */
function useFileDrop() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        setDragging(true);
      } else if (payload.type === "drop") {
        setDragging(false);
        void useApp.getState().openPaths(payload.paths);
      } else {
        setDragging(false);
      }
    });
    return () => void unlisten.then((fn) => fn());
  }, []);
  return dragging;
}

function useExternalFiles() {
  useEffect(() => {
    void api.startupFiles().then((paths) => useApp.getState().openPaths(paths));
    // Outra execução do Galaxy (ex.: duplo clique no Explorer) repassa os arquivos.
    const unlisten = listen<string[]>("open-files", (e) => void useApp.getState().openPaths(e.payload));
    return () => void unlisten.then((fn) => fn());
  }, []);
}

function useWindowTitleAndClose() {
  const active = useApp((s) => s.tabs.find((t) => t.id === s.activeId));
  const title = active ? `${active.dirty ? "● " : ""}${active.info.name} — Galaxy` : "Galaxy";

  useEffect(() => {
    document.title = title;
    void getCurrentWindow().setTitle(title);
  }, [title]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const dirty = useApp.getState().tabs.filter((t) => t.dirty);
      if (dirty.length === 0) return;
      event.preventDefault();
      const names = dirty.map((t) => `• ${t.info.name}`).join("\n");
      const close = await ask(`Há alterações não salvas em:\n${names}\n\nSair mesmo assim?`, {
        title: "Galaxy",
        kind: "warning",
        okLabel: "Sair sem salvar",
        cancelLabel: "Cancelar",
      });
      if (close) await getCurrentWindow().destroy();
    });
    return () => void unlisten.then((fn) => fn());
  }, []);
}

/** Bloqueia o menu de contexto do navegador (Recarregar, Imprimir...) fora de textos. */
function useContextMenuGuard() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const onMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const editable = target.closest("input, textarea, [contenteditable=true], .cm-content");
      const hasSelection = (window.getSelection()?.toString() ?? "") !== "";
      if (!editable && !hasSelection) e.preventDefault();
    };
    window.addEventListener("contextmenu", onMenu);
    return () => window.removeEventListener("contextmenu", onMenu);
  }, []);
}

export function useAppEvents() {
  useShortcuts();
  useExternalFiles();
  useWindowTitleAndClose();
  useContextMenuGuard();
  return { dragging: useFileDrop() };
}
