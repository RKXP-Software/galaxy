import { useEffect, useRef, useState, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { openUrl } from "@tauri-apps/plugin-opener";

import { useApp } from "../../app/store";
import { resolvePath } from "../../lib/format";
import { api, assetUrl } from "../../lib/tauri";

const md = new MarkdownIt({ html: true, linkify: true });

/** Gera ids nos títulos (estilo GitHub) para os links internos #secao funcionarem. */
md.core.ruler.push("heading_ids", (state) => {
  const used = new Map<string, number>();
  state.tokens.forEach((token, i) => {
    if (token.type !== "heading_open") return;
    const base =
      state.tokens[i + 1].content
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-") || "secao";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    token.attrSet("id", n ? `${base}-${n}` : base);
  });
});

const EXTERNAL = /^(https?:|mailto:)/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Renderiza, sanitiza e troca imagens locais (caminhos relativos) por URLs do
 * asset protocol, liberando cada uma antes de exibir.
 */
async function renderMarkdown(source: string, baseDir: string): Promise<string> {
  const fragment = DOMPurify.sanitize(md.render(source), { RETURN_DOM_FRAGMENT: true });
  const local: Promise<void>[] = [];
  fragment.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (ANY_SCHEME.test(src) && !/^file:/i.test(src)) return;
    const path = resolvePath(baseDir, decodeURI(src.replace(/^file:\/+/i, "").split(/[?#]/)[0]));
    img.setAttribute("src", assetUrl(path));
    local.push(api.allowAsset(path).catch(() => undefined));
  });
  await Promise.all(local);
  const container = document.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

export function MarkdownPreview({ source, baseDir }: { source: string; baseDir: string }) {
  const [html, setHtml] = useState("");
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void renderMarkdown(source, baseDir).then((out) => !cancelled && setHtml(out));
    return () => {
      cancelled = true;
    };
  }, [source, baseDir]);

  const onClick = (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1));
      ref.current?.querySelector(`[id="${CSS.escape(id)}"], a[name="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth" });
    } else if (EXTERNAL.test(href)) {
      void openUrl(href);
    } else if (href && !ANY_SCHEME.test(href)) {
      // Link para outro arquivo local: abre numa nova aba.
      void useApp.getState().openPaths([resolvePath(baseDir, decodeURI(href.split("#")[0]))]);
    }
  };

  return <article ref={ref} className="markdown-body selectable" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
