import { Suspense } from "react";

import { ErrorBoundary, Loading } from "../components/common";
import { VIEWERS, type ViewerProps } from "./registry";

export function ViewerHost({ tab, active }: ViewerProps) {
  const Viewer = VIEWERS[tab.viewer];
  return (
    // A chave inclui o visualizador: trocar em "Abrir como" recria tudo.
    <ErrorBoundary key={`${tab.id}:${tab.viewer}:${tab.version}`} path={tab.info.path}>
      <Suspense fallback={<Loading />}>
        <Viewer tab={tab} active={active} />
      </Suspense>
    </ErrorBoundary>
  );
}
