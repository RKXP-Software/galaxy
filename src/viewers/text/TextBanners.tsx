import type { TextFile } from "../../lib/tauri";

export function TextBanners({ doc }: { doc: TextFile }) {
  return (
    <>
      {doc.truncated && (
        <div className="banner warning">
          Arquivo muito grande: mostrando só os primeiros 50 MB, em modo somente leitura.
        </div>
      )}
      {doc.hadErrors && (
        <div className="banner warning">
          Alguns bytes não correspondem à codificação detectada e aparecem como �. Salvar pode alterá-los.
        </div>
      )}
    </>
  );
}
