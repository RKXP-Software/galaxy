import { useEffect, useMemo, useState } from "react";

import { useApp } from "../../app/store";
import { ErrorView, Loading, Toolbar } from "../../components/common";
import { SearchIcon, ViewerIcon } from "../../components/icons";
import { viewerForExtension } from "../../lib/fileTypes";
import { formatBytes } from "../../lib/format";
import { api, errorMessage, type ZipEntryInfo } from "../../lib/tauri";
import type { ViewerProps } from "../registry";

interface Node {
  name: string;
  path: string;
  children: Map<string, Node>;
  entry?: ZipEntryInfo;
  size: number;
  files: number;
}

function buildTree(entries: ZipEntryInfo[]): Node {
  const root: Node = { name: "", path: "", children: new Map(), size: 0, files: 0 };
  for (const entry of entries) {
    const parts = entry.name.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: new Map(), size: 0, files: 0 };
        node.children.set(part, child);
      }
      if (!entry.isDir) {
        node.size += entry.size;
        node.files += 1;
      }
      node = child;
    });
    if (!entry.isDir) {
      node.entry = entry;
      node.size = entry.size;
    }
  }
  return root;
}

const isFolder = (n: Node) => !n.entry || n.children.size > 0;

function sortedChildren(node: Node): Node[] {
  return [...node.children.values()].sort((a, b) =>
    isFolder(a) === isFolder(b) ? a.name.localeCompare(b.name, "pt-BR", { numeric: true }) : isFolder(a) ? -1 : 1,
  );
}

const extOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "");

function EntryRow({ node, depth, onOpen }: { node: Node; depth: number; onOpen: (e: ZipEntryInfo) => void }) {
  const [open, setOpen] = useState(depth === 0 && node.children.size > 0);
  const folder = isFolder(node);
  const entry = node.entry;

  return (
    <>
      <div
        className={`zip-row${entry?.encrypted ? " disabled" : ""}`}
        style={{ paddingLeft: 10 + depth * 18 }}
        title={entry?.encrypted ? "Protegido por senha" : node.path}
        onClick={() => folder && setOpen(!open)}
        onDoubleClick={() => entry && !folder && !entry.encrypted && onOpen(entry)}
      >
        <span className={`json-caret${open ? " open" : ""}`} style={{ visibility: folder ? "visible" : "hidden" }}>
          ▸
        </span>
        <span className="zip-icon">{folder ? "📁" : <ViewerIcon viewer={viewerForExtension(extOf(node.name)) ?? "hex"} size={15} />}</span>
        <span className="zip-name">
          {node.name}
          {entry?.encrypted && " 🔒"}
        </span>
        <span className="zip-size">{folder ? `${node.files} arquivo${node.files === 1 ? "" : "s"}` : formatBytes(node.size)}</span>
        <span className="zip-date">{entry?.modified ?? ""}</span>
      </div>
      {open && folder && sortedChildren(node).map((child) => <EntryRow key={child.path} node={child} depth={depth + 1} onOpen={onOpen} />)}
    </>
  );
}

export default function ZipViewer({ tab }: ViewerProps) {
  const [entries, setEntries] = useState<ZipEntryInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const { openPaths, notify, setStatus } = useApp.getState();

  useEffect(() => {
    api.zipList(tab.info.path).then(
      (list) => {
        setEntries(list);
        const files = list.filter((e) => !e.isDir);
        const total = files.reduce((n, e) => n + e.size, 0);
        setStatus(tab.id, { contents: `${files.length.toLocaleString("pt-BR")} arquivos · ${formatBytes(total)} descompactado` });
      },
      (e) => setError(errorMessage(e)),
    );
  }, [tab.info.path, tab.id, setStatus]);

  const tree = useMemo(() => (entries ? buildTree(entries) : null), [entries]);
  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !entries) return null;
    return entries.filter((e) => !e.isDir && e.name.toLowerCase().includes(q)).slice(0, 2000);
  }, [filter, entries]);

  const openEntry = async (entry: ZipEntryInfo) => {
    try {
      const extracted = await api.zipExtract(tab.info.path, entry.index);
      await openPaths([extracted]);
    } catch (e) {
      notify("error", `Não foi possível extrair "${entry.name}": ${errorMessage(e)}`);
    }
  };

  if (error) return <ErrorView message={error} path={tab.info.path} />;
  if (!tree || !entries) return <Loading label="Lendo arquivo compactado…" />;

  return (
    <div className="viewer">
      <Toolbar>
        <div className="search-box">
          <SearchIcon size={14} />
          <input placeholder="Filtrar arquivos" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <span className="spacer" />
        <span className="toolbar-label">Clique duas vezes num arquivo para abri-lo numa nova aba.</span>
      </Toolbar>
      <div className="zip-header">
        <span>Nome</span>
        <span>Tamanho</span>
        <span>Modificado</span>
      </div>
      <div className="viewer-body zip-list">
        {matches
          ? matches.map((entry) => (
              <div
                key={entry.index}
                className={`zip-row flat${entry.encrypted ? " disabled" : ""}`}
                onDoubleClick={() => !entry.encrypted && void openEntry(entry)}
              >
                <span className="zip-icon">
                  <ViewerIcon viewer={viewerForExtension(extOf(entry.name)) ?? "hex"} size={15} />
                </span>
                <span className="zip-name">{entry.name}</span>
                <span className="zip-size">{formatBytes(entry.size)}</span>
                <span className="zip-date">{entry.modified ?? ""}</span>
              </div>
            ))
          : sortedChildren(tree).map((node) => <EntryRow key={node.path} node={node} depth={0} onOpen={(e) => void openEntry(e)} />)}
        {matches?.length === 0 && <div className="center-message">Nenhum arquivo corresponde ao filtro.</div>}
        {entries.length === 0 && <div className="center-message">O arquivo compactado está vazio.</div>}
      </div>
    </div>
  );
}
