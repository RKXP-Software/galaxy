// Cada visualizador publica aqui o que sabe fazer com a sua aba: salvar,
// devolver o texto atual (inclusive não salvo) e levar o cursor a uma linha.
// Atalhos, busca entre abas e diff consultam este registro.
export interface TabController {
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  /** Texto atual do editor, com as edições ainda não salvas. */
  getText: () => string;
  /** Linhas e colunas começam em 1. */
  reveal: (line: number, column: number, length: number) => void;
}

const controllers = new Map<string, Partial<TabController>>();

/** Registra funções da aba; devolve a limpeza (só remove o que ainda é desta chamada). */
export function registerController(tabId: string, parts: Partial<TabController>): () => void {
  const entry = controllers.get(tabId) ?? {};
  Object.assign(entry, parts);
  controllers.set(tabId, entry);
  return () => {
    const current = controllers.get(tabId);
    if (!current) return;
    for (const key of Object.keys(parts) as (keyof TabController)[]) {
      if (current[key] === parts[key]) delete current[key];
    }
  };
}

export function getController(tabId: string): Partial<TabController> {
  return controllers.get(tabId) ?? {};
}

export function unregisterController(tabId: string) {
  controllers.delete(tabId);
}
