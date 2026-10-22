// Origens possíveis de cada lado de um diff e como obter o texto de cada uma.
//
//   current        texto atual do editor da aba de origem (inclui o que não foi salvo)
//   disk           o arquivo da aba de origem, como está salvo em disco
//   version:<id>   uma versão do histórico de salvamentos da aba de origem
//   tab:<id>       texto atual de outra aba aberta
//   file:<caminho> qualquer arquivo de texto do disco
import { getController } from "../../app/controllers";
import { useApp } from "../../app/store";
import { api, type HistoryVersion } from "../../lib/tauri";

export interface SourceOption {
  key: string;
  label: string;
  group: "Esta aba" | "Histórico" | "Outras abas" | "Arquivos";
}

export interface ResolvedSource {
  text: string;
  /** Aviso a mostrar (ex.: arquivo truncado). */
  warning?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function versionLabel(v: HistoryVersion): string {
  const d = new Date(v.timestamp);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const fileName = (path: string) => path.slice(Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1);

/** Abas que sabem devolver o texto atual (editores de texto, markdown, JSON e CSV em modo texto). */
export function textTabs(excludeId?: string | null) {
  return useApp.getState().tabs.filter((t) => t.id !== excludeId && t.viewer !== "diff" && getController(t.id).getText);
}

export function buildOptions(sourceTabId: string | null, versions: HistoryVersion[], extraFiles: string[]): SourceOption[] {
  const { tabs } = useApp.getState();
  const source = tabs.find((t) => t.id === sourceTabId);
  const options: SourceOption[] = [];
  if (source && getController(source.id).getText) {
    options.push({ key: "current", label: `Atual (editor)${source.dirty ? " · com alterações" : ""}`, group: "Esta aba" });
  }
  if (source?.info.path) options.push({ key: "disk", label: "Salvo em disco", group: "Esta aba" });
  versions.forEach((v, i) =>
    options.push({ key: `version:${v.id}`, label: `${versionLabel(v)}${i === 0 ? " (mais recente)" : ""}`, group: "Histórico" }),
  );
  for (const t of textTabs(sourceTabId)) options.push({ key: `tab:${t.id}`, label: t.info.name, group: "Outras abas" });
  for (const path of extraFiles) options.push({ key: `file:${path}`, label: fileName(path), group: "Arquivos" });
  return options;
}

export async function resolveSource(key: string, sourceTabId: string | null): Promise<ResolvedSource> {
  const { tabs } = useApp.getState();
  const source = tabs.find((t) => t.id === sourceTabId);
  const fromDisk = async (path: string): Promise<ResolvedSource> => {
    const file = await api.readText(path);
    return { text: file.content, warning: file.truncated ? "Arquivo muito grande: só os primeiros 50 MB foram comparados." : undefined };
  };

  if (key === "current") {
    const getText = source && getController(source.id).getText;
    if (!getText) throw new Error("A aba de origem foi fechada ou não é um arquivo de texto.");
    return { text: getText() };
  }
  if (key === "disk") {
    if (!source?.info.path) throw new Error("Esta aba ainda não foi salva em disco.");
    return fromDisk(source.info.path);
  }
  if (key.startsWith("version:")) {
    if (!source?.info.path) throw new Error("Esta aba ainda não foi salva em disco.");
    return { text: await api.historyRead(source.info.path, key.slice("version:".length)) };
  }
  if (key.startsWith("tab:")) {
    const getText = getController(key.slice("tab:".length)).getText;
    if (!getText) throw new Error("Essa aba foi fechada.");
    return { text: getText() };
  }
  if (key.startsWith("file:")) return fromDisk(key.slice("file:".length));
  throw new Error("Origem desconhecida.");
}
