// Cada visualizador é carregado sob demanda: a biblioteca pesada de um
// formato (pdf.js, CodeMirror, docx-preview...) só baixa quando um arquivo
// daquele tipo é aberto. Para suportar um formato novo, crie o componente,
// registre-o aqui e mapeie as extensões em lib/fileTypes.ts.
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { Tab } from "../app/store";
import type { ViewerId } from "../lib/fileTypes";

export interface ViewerProps {
  tab: Tab;
  /** A aba está visível. Mídia pausa e atalhos só valem quando ativa. */
  active: boolean;
}

type Viewer = LazyExoticComponent<ComponentType<ViewerProps>>;

export const VIEWERS: Record<ViewerId, Viewer> = {
  text: lazy(() => import("./text/TextViewer")),
  markdown: lazy(() => import("./markdown/MarkdownViewer")),
  json: lazy(() => import("./json/JsonViewer")),
  image: lazy(() => import("./image/ImageViewer")),
  audio: lazy(() => import("./media/MediaViewer")),
  video: lazy(() => import("./media/MediaViewer")),
  pdf: lazy(() => import("./pdf/PdfViewer")),
  sheet: lazy(() => import("./sheet/SheetViewer")),
  docx: lazy(() => import("./office/DocxViewer")),
  pptx: lazy(() => import("./office/PptxViewer")),
  extracted: lazy(() => import("./office/ExtractedViewer")),
  zip: lazy(() => import("./archive/ZipViewer")),
  epub: lazy(() => import("./epub/EpubViewer")),
  hex: lazy(() => import("./fallback/HexViewer")),
};
