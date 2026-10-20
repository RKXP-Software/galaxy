import { create } from "zustand";
import { ask } from "@tauri-apps/plugin-dialog";
import { load, type Store } from "@tauri-apps/plugin-store";

import { resolveViewerId, type ViewerId } from "../lib/fileTypes";
import { api, errorMessage, type FileInfo } from "../lib/tauri";
import { unregisterSaver } from "./savers";

export interface Tab {
  id: string;
  info: FileInfo;
  viewer: ViewerId;
  dirty: boolean;
  /** Itens que o visualizador publica na barra de status (codificação, zoom, página...). */
  status: Record<string, string>;
}

export interface Notice {
  id: number;
  kind: "error" | "info";
  text: string;
}

interface AppState {
  tabs: Tab[];
  activeId: string | null;
  notices: Notice[];
  recent: string[];
  openPaths(paths: string[]): Promise<void>;
  closeTab(id: string): Promise<void>;
  activate(id: string): void;
  cycle(step: number): void;
  setViewer(id: string, viewer: ViewerId): void;
  setDirty(id: string, dirty: boolean): void;
  setStatus(id: string, status: Record<string, string>): void;
  updateInfo(id: string, info: FileInfo): void;
  notify(kind: Notice["kind"], text: string): void;
  dismiss(noticeId: number): void;
  loadRecent(): Promise<void>;
  removeRecent(path: string): Promise<void>;
  clearRecent(): Promise<void>;
}

const MAX_RECENT = 15;
let nextTabId = 1;
let nextNoticeId = 1;

let storePromise: Promise<Store> | null = null;
const settings = () => (storePromise ??= load("galaxy.json", { autoSave: 300, defaults: {} }));

async function saveRecent(recent: string[]) {
  try {
    await (await settings()).set("recent", recent);
  } catch {
    // Sem persistência a lista continua funcionando na sessão atual.
  }
}

/** Caminhos no Windows não diferenciam maiúsculas. */
const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const useApp = create<AppState>((set, get) => ({
  tabs: [],
  activeId: null,
  notices: [],
  recent: [],

  async openPaths(paths) {
    for (const path of paths) {
      const existing = get().tabs.find((t) => samePath(t.info.path, path));
      if (existing) {
        set({ activeId: existing.id });
        continue;
      }
      try {
        const info = await api.fileInfo(path);
        const tab: Tab = {
          id: `tab-${nextTabId++}`,
          info,
          viewer: resolveViewerId(info),
          dirty: false,
          status: {},
        };
        const recent = [info.path, ...get().recent.filter((p) => !samePath(p, info.path))].slice(0, MAX_RECENT);
        set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id, recent }));
        void saveRecent(recent);
      } catch (e) {
        get().notify("error", `Não foi possível abrir "${path}": ${errorMessage(e)}`);
      }
    }
  },

  async closeTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.dirty) {
      const discard = await ask(`"${tab.info.name}" tem alterações não salvas. Fechar mesmo assim?`, {
        title: "Galaxy",
        kind: "warning",
        okLabel: "Fechar sem salvar",
        cancelLabel: "Cancelar",
      });
      if (!discard) return;
    }
    unregisterSaver(id);
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeId = s.activeId === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : s.activeId;
      return { tabs, activeId };
    });
  },

  activate(id) {
    set({ activeId: id });
  },

  cycle(step) {
    const { tabs, activeId } = get();
    if (tabs.length < 2) return;
    const index = tabs.findIndex((t) => t.id === activeId);
    set({ activeId: tabs[(index + step + tabs.length) % tabs.length].id });
  },

  setViewer(id, viewer) {
    unregisterSaver(id);
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, viewer, dirty: false, status: {} } : t)) }));
  },

  setDirty(id, dirty) {
    if (get().tabs.find((t) => t.id === id)?.dirty === dirty) return;
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)) }));
  },

  setStatus(id, status) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, status: { ...t.status, ...status } } : t)) }));
  },

  updateInfo(id, info) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, info } : t)) }));
  },

  notify(kind, text) {
    const notice = { id: nextNoticeId++, kind, text };
    set((s) => ({ notices: [...s.notices, notice].slice(-4) }));
    setTimeout(() => get().dismiss(notice.id), kind === "error" ? 10000 : 5000);
  },

  dismiss(noticeId) {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== noticeId) }));
  },

  async loadRecent() {
    try {
      const recent = (await (await settings()).get<string[]>("recent")) ?? [];
      set({ recent });
    } catch {
      set({ recent: [] });
    }
  },

  async removeRecent(path) {
    const recent = get().recent.filter((p) => !samePath(p, path));
    set({ recent });
    await saveRecent(recent);
  },

  async clearRecent() {
    set({ recent: [] });
    await saveRecent([]);
  },
}));

export const useActiveTab = () => useApp((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
