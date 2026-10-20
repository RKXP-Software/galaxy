// Leitura e gravação de arquivos de texto, compartilhada pelos visualizadores
// de texto, markdown, JSON e CSV (modo texto).
import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";

import { registerSaver } from "../../app/savers";
import { useApp, type Tab } from "../../app/store";
import { encodingLabel } from "../../lib/format";
import { api, errorMessage, UNMAPPABLE, type TextFile } from "../../lib/tauri";

function publishStatus(tabId: string, doc: TextFile) {
  useApp.getState().setStatus(tabId, {
    encoding: encodingLabel(doc.encoding, doc.bom),
    lineEnding: doc.lineEnding.toUpperCase(),
  });
}

export function useTextDocument(tab: Tab, { onSaved }: { onSaved?: () => void } = {}) {
  const [doc, setDoc] = useState<TextFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<TextFile | null>(null);
  const getValue = useRef<() => string>(() => "");
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const path = tab.info.path;
  const tabId = tab.id;

  useEffect(() => {
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
  }, [path, tabId]);

  const onChange = useCallback(
    (getter: () => string) => {
      getValue.current = getter;
      useApp.getState().setDirty(tabId, true);
    },
    [tabId],
  );

  const save = useCallback(async () => {
    const current = docRef.current;
    if (!current || current.readOnly) return;
    const { notify, setDirty, updateInfo } = useApp.getState();
    const content = getValue.current();
    const write = (encoding: string, bom: boolean) => api.writeText(path, content, encoding, bom, current.lineEnding);

    try {
      let info;
      try {
        info = await write(current.encoding, current.bom);
      } catch (e) {
        const message = errorMessage(e);
        if (!message.startsWith(UNMAPPABLE)) throw e;
        const toUtf8 = await ask(`${message.slice(UNMAPPABLE.length + 2)}\n\nSalvar o arquivo em UTF-8?`, {
          title: "Galaxy",
          kind: "warning",
          okLabel: "Salvar em UTF-8",
          cancelLabel: "Cancelar",
        });
        if (!toUtf8) return;
        info = await write("UTF-8", false);
        docRef.current = { ...current, encoding: "UTF-8", bom: false };
        publishStatus(tabId, docRef.current);
      }
      setDirty(tabId, false);
      updateInfo(tabId, info);
      notify("info", `"${info.name}" salvo.`);
      onSavedRef.current?.();
    } catch (e) {
      notify("error", `Não foi possível salvar: ${errorMessage(e)}`);
    }
  }, [path, tabId]);

  useEffect(() => {
    if (!doc || doc.readOnly) return;
    return registerSaver(tabId, save);
  }, [doc, save, tabId]);

  return { doc, error, onChange, save, getValue: () => getValue.current() };
}
