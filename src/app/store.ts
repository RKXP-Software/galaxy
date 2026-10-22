import { create } from "zustand";
import { ask } from "@tauri-apps/plugin-dialog";
import { load, type Store } from "@tauri-apps/plugin-store";

import { resolveViewerId, type ViewerId } from "../lib/fileTypes";
import { api, errorMessage, type FileInfo } from "../lib/tauri";
import { unregisterController } from "./controllers";

export type ThemeMode = "system" | "light" | "dark";

/** De onde vem cada lado de um diff. Chaves: current, disk, version:<id>, tab:<id>, file:<caminho>. */
export interface DiffSpec {
  /** Aba de origem (a que estava ativa ao abrir o diff). */
  sourceTabId: string | null;
  left: string;
  right: string;
}

export interface Tab {
  id: string;
  info: FileInfo;
  viewer: ViewerId;
  dirty: boolean;
  /** Itens que o visualizador publica na barra de status (codificação, zoom, página...). */
  status: Record<string, string>;
  /** Arquivo novo que ainda não foi salvo em disco. */
  untitled?: boolean;
  /** Incrementa quando o arquivo da aba muda (Salvar como), para recriar o visualizador. */
  version: number;
  diff?: DiffSpec;
}

export interface Notice {
  id: number;
  kind: "error" | "info";
  text: string;
}

export type NewFileKind = "txt" | "md" | "json";

interface AppState {
  tabs: Tab[];
  activeId: string | null;
  notices: Notice[];
  recent: string[];
  theme: ThemeMode;
  openPaths(paths: string[]): Promise<void>;
  newFile(kind: NewFileKind): void;
  openDiff(spec: DiffSpec, title: string): void;
  closeTab(id: string): Promise<void>;
  activate(id: string): void;
  cycle(step: number): void;
  setViewer(id: string, viewer: ViewerId): void;
  setDirty(id: string, dirty: boolean): void;
  setStatus(id: string, status: Record<string, string>): void;
  updateInfo(id: string, info: FileInfo): void;
  /** A aba passa a apontar para outro arquivo (depois de Salvar como). */
  replaceFile(id: string, info: FileInfo): void;
  notify(kind: Notice["kind"], text: string): void;
  dismiss(noticeId: number): void;
  loadSettings(): Promise<void>;
  setTheme(theme: ThemeMode): Promise<void>;
  removeRecent(path: string): Promise<void>;
  clearRecent(): Promise<void>;
}

const MAX_RECENT = 15;
let nextTabId = 1;
let nextNoticeId = 1;
let untitledCount = 0;
let settingsLoaded: Promise<void> | null = null;

let storePromise: Promise<Store> | null = null;
const settings = () => (storePromise ??= load("galaxy.json", { autoSave: 300, defaults: {} }));

async function saveSetting(key: string, value: unknown) {
  try {
    await (await settings()).set(key, value);
  } catch {
    // Sem persistência a configuração continua valendo na sessão atual.
  }
}

/** Caminhos no Windows não diferenciam maiúsculas. */
const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const NEW_FILE_VIEWER: Record<NewFileKind, ViewerId> = { txt: "text", md: "markdown", json: "json" };

function blankInfo(name: string, ext: string, extra: Partial<FileInfo> = {}): FileInfo {
  return { path: "", name, ext, size: 0, modified: null, sniffedExt: null, mime: null, isText: true, ...extra };
}

export const useApp = create<AppState>((set, get) => ({
  tabs: [],
  activeId: null,
  notices: [],
  recent: [],
  theme: "system",

  async openPaths(paths) {
    for (const path of paths) {
      const existing = get().tabs.find((t) => t.info.path && samePath(t.info.path, path));
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
          version: 0,
        };
        const recent = [info.path, ...get().recent.filter((p) => !samePath(p, info.path))].slice(0, MAX_RECENT);
        set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id, recent }));
        void saveSetting("recent", recent);
      } catch (e) {
        get().notify("error", `Não foi possível abrir "${path}": ${errorMessage(e)}`);
      }
    }
  },

  newFile(kind) {
    const name = `Sem título-${++untitledCount}.${kind}`;
    const tab: Tab = {
      id: `tab-${nextTabId++}`,
      info: blankInfo(name, kind),
      viewer: NEW_FILE_VIEWER[kind],
      dirty: false,
      status: {},
      untitled: true,
      version: 0,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  },

  openDiff(spec, title) {
    const tab: Tab = {
      id: `tab-${nextTabId++}`,
      info: blankInfo(title, "diff", { isText: false }),
      viewer: "diff",
      dirty: false,
      status: {},
      version: 0,
      diff: spec,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
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
    unregisterController(id);
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
    unregisterController(id);
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

  replaceFile(id, info) {
    unregisterController(id);
    const recent = [info.path, ...get().recent.filter((p) => !samePath(p, info.path))].slice(0, MAX_RECENT);
    set((s) => ({
      recent,
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, info, viewer: resolveViewerId(info), dirty: false, status: {}, untitled: false, version: t.version + 1 }
          : t,
      ),
    }));
    void saveSetting("recent", recent);
  },

  notify(kind, text) {
    const notice = { id: nextNoticeId++, kind, text };
    set((s) => ({ notices: [...s.notices, notice].slice(-4) }));
    setTimeout(() => get().dismiss(notice.id), kind === "error" ? 10000 : 5000);
  },

  dismiss(noticeId) {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== noticeId) }));
  },

  loadSettings() {
    // Uma só leitura por execução: quem chamar depois recebe a mesma promessa.
    return (settingsLoaded ??= (async () => {
      try {
        const store = await settings();
        const stored = (await store.get<string[]>("recent")) ?? [];
        const theme = (await store.get<ThemeMode>("theme")) ?? "system";
        // Junta com o que já estiver na memória em vez de sobrescrever.
        const recent: string[] = [];
        for (const path of [...get().recent, ...stored]) {
          if (!recent.some((p) => samePath(p, path))) recent.push(path);
        }
        set({ recent: recent.slice(0, MAX_RECENT), theme });
      } catch {
        set({ recent: get().recent, theme: "system" });
      }
    })());
  },

  async setTheme(theme) {
    set({ theme });
    await saveSetting("theme", theme);
  },

  async removeRecent(path) {
    const recent = get().recent.filter((p) => !samePath(p, path));
    set({ recent });
    await saveSetting("recent", recent);
  },

  async clearRecent() {
    set({ recent: [] });
    await saveSetting("recent", []);
  },
}));

export const useActiveTab = () => useApp((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
