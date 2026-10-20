// Cada visualizador editável registra aqui como salvar a sua aba;
// o atalho Ctrl+S chama o da aba ativa.
type Saver = () => Promise<void>;

const savers = new Map<string, Saver>();

export function registerSaver(tabId: string, saver: Saver): () => void {
  savers.set(tabId, saver);
  return () => {
    if (savers.get(tabId) === saver) savers.delete(tabId);
  };
}

export function unregisterSaver(tabId: string) {
  savers.delete(tabId);
}

export function getSaver(tabId: string): Saver | undefined {
  return savers.get(tabId);
}
