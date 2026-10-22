// Leitura e gravação de arquivos de texto, compartilhada pelos visualizadores
// de texto, markdown, JSON e CSV (modo texto).
import { useCallback, useEffect, useRef, useState } from "react";
import { ask, save as saveDialog } from "@tauri-apps/plugin-dialog";

import { registerController } from "../../app/controllers";
import { useApp, type Tab } from "../../app/store";
import { GROUPS } from "../../lib/fileTypes";
import { encodingLabel } from "../../lib/format";
import { api, errorMessage, UNMAPPABLE, type TextFile } from "../../lib/tauri";

function publishStatus(tabId: string, doc: TextFile) {
  useApp.getState().setStatus(tabId, {
    encoding: encodingLabel(doc.encoding, doc.bom),
    lineEnding: doc.lineEnding.toUpperCase(),
  });
}

/** Documento de um arquivo novo: vazio, UTF-8, quebras de linha do Windows. */
const EMPTY_DOC: TextFile = {
  content: "",
  encoding: "UTF-8",
  bom: false,
  lineEnding: "crlf",
  truncated: false,
  readOnly: false,
  hadErrors: false,
};

export function useTextDocument(tab: Tab, { onSaved }: { onSaved?: () => void } = {}) {
  const [doc, setDoc] = useState<TextFile | null>(tab.untitled ? EMPTY_DOC : null);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<TextFile | null>(tab.untitled ? EMPTY_DOC : null);
  const getValue = useRef<() => string>(() => "");
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const path = tab.info.path;
  const tabId = tab.id;

  useEffect(() => {
    if (tab.untitled) {
      publishStatus(tabId, EMPTY_DOC);
      return;
    }
    let cancelled = false;
    api
      .readText(path)
      .then((d) => {
        if (cancelled) return;
        docRef.current = d;
        getValue.current = () => d.content;
        setDoc(d);
        publishStatus(tabId, d);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [path, tabId, tab.untitled]);

  const onChange = useCallback(
    (getter: () => string) => {
      getValue.current = getter;
      useApp.getState().setDirty(tabId, true);
    },
    [tabId],
  );

  /** Grava em `target`; se a codificação não representar o texto, oferece UTF-8. */
  const writeTo = useCallback(
    async (target: string) => {
      const current = docRef.current;
      if (!current) return null;
      const content = getValue.current();
      const write = (encoding: string, bom: boolean) => api.writeText(target, content, encoding, bom, current.lineEnding);
      try {
        return await write(current.encoding, current.bom);
      } catch (e) {
        const message = errorMessage(e);
        if (!message.startsWith(UNMAPPABLE)) throw e;
        const toUtf8 = await ask(`${message.slice(UNMAPPABLE.length + 2)}\n\nSalvar o arquivo em UTF-8?`, {
          title: "Galaxy",
          kind: "warning",
          okLabel: "Salvar em UTF-8",
          cancelLabel: "Cancelar",
        });
        if (!toUtf8) return null;
        const info = await write("UTF-8", false);
        docRef.current = { ...current, encoding: "UTF-8", bom: false };
        publishStatus(tabId, docRef.current);
        return info;
      }
    },
    [tabId],
  );

  const saveAs = useCallback(async () => {
    const { notify, replaceFile } = useApp.getState();
    const current = useApp.getState().tabs.find((t) => t.id === tabId);
    if (!current || !docRef.current) return;
    try {
      const target = await saveDialog({
        title: "Salvar como",
        defaultPath: current.untitled ? current.info.name : current.info.path,
        filters: [
          ...GROUPS.filter((g) => ["text", "markdown", "json"].includes(g.viewer)).map((g) => ({
            name: g.label,
            extensions: g.viewer === "text" ? ["txt", "log", "csv"] : g.extensions,
          })),
          { name: "Todos os arquivos", extensions: ["*"] },
        ],
      });
      if (!target) return;
      const info = await writeTo(target);
      if (!info) return;
      replaceFile(tabId, info);
      notify("info", `"${info.name}" salvo.`);
      onSavedRef.current?.();
    } catch (e) {
      notify("error", `Não foi possível salvar: ${errorMessage(e)}`);
    }
  }, [tabId, writeTo]);

  const save = useCallback(async () => {
    const current = docRef.current;
    if (!current || current.readOnly) return;
    const { notify, setDirty, updateInfo } = useApp.getState();
    // Arquivo novo: o primeiro Ctrl+S pergunta onde salvar.
    if (useApp.getState().tabs.find((t) => t.id === tabId)?.untitled) return saveAs();
    try {
      const info = await writeTo(path);
      if (!info) return;
      setDirty(tabId, false);
      updateInfo(tabId, info);
      notify("info", `"${info.name}" salvo.`);
      onSavedRef.current?.();
    } catch (e) {
      notify("error", `Não foi possível salvar: ${errorMessage(e)}`);
    }
  }, [path, tabId, writeTo, saveAs]);

  useEffect(() => {
    if (!doc) return;
    return registerController(tabId, {
      getText: () => getValue.current(),
      ...(doc.readOnly ? {} : { save, saveAs }),
    });
  }, [doc, save, saveAs, tabId]);

  return { doc, error, onChange, save, saveAs, getValue: () => getValue.current() };
}

