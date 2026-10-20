import { useEffect, useState } from "react";

import { api, errorMessage } from "../../lib/tauri";

/** Lê o arquivo inteiro como ArrayBuffer (para docx-preview, pptx-preview e epub.js). */
export function useBinary(path: string) {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api.readBinary(path).then(
      (buffer) => !cancelled && setData(buffer),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { data, error };
}
