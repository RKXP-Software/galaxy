import { describe, expect, it } from "vitest";

import { resolveViewerId, viewerForExtension, ALL_EXTENSIONS, GROUPS } from "./fileTypes";
import { dirname, encodingLabel, formatBytes, resolvePath } from "./format";
import { nameMatches, searchText } from "./tabSearch";
import { columnName } from "../viewers/sheet/columnName";

const file = (name: string, extra: Partial<Parameters<typeof resolveViewerId>[0]> = {}) => ({
  name,
  ext: name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "",
  sniffedExt: null,
  isText: false,
  ...extra,
});

describe("resolveViewerId", () => {
  it("escolhe o visualizador pela extensão, sem diferenciar maiúsculas", () => {
    expect(resolveViewerId(file("Relatorio.PDF"))).toBe("pdf");
    expect(resolveViewerId(file("dados.csv"))).toBe("sheet");
    expect(resolveViewerId(file("planilha.xlsx"))).toBe("sheet");
    expect(resolveViewerId(file("notas.md"))).toBe("markdown");
    expect(resolveViewerId(file("config.json"))).toBe("json");
    expect(resolveViewerId(file("musica.mp3"))).toBe("audio");
    expect(resolveViewerId(file("video.mp4"))).toBe("video");
    expect(resolveViewerId(file("foto.jpeg"))).toBe("image");
    expect(resolveViewerId(file("antigo.doc"))).toBe("extracted");
    expect(resolveViewerId(file("novo.docx"))).toBe("docx");
  });

  it("usa os bytes quando a extensão é desconhecida ou enganosa", () => {
    expect(resolveViewerId(file("sem-extensao", { sniffedExt: "png" }))).toBe("image");
    expect(resolveViewerId(file("renomeado.doc", { sniffedExt: "docx" }))).toBe("docx");
  });

  it("trata texto desconhecido como texto e binário como hexadecimal", () => {
    expect(resolveViewerId(file("LICENSE", { isText: true }))).toBe("text");
    expect(resolveViewerId(file("estranho.xyz", { isText: true }))).toBe("text");
    expect(resolveViewerId(file("estranho.xyz", { isText: false }))).toBe("hex");
  });

  it("não repete extensões entre grupos", () => {
    const seen = new Set<string>();
    for (const ext of GROUPS.flatMap((g) => g.extensions)) {
      expect(seen.has(ext), `extensão duplicada: ${ext}`).toBe(false);
      seen.add(ext);
    }
    expect(ALL_EXTENSIONS.length).toBe(seen.size);
  });

  it("cobre todos os formatos pedidos", () => {
    for (const ext of ["txt", "md", "json", "mp3", "mp4", "png", "jpg", "jpeg", "pdf", "doc", "docx", "csv", "xls"]) {
      expect(viewerForExtension(ext), ext).toBeDefined();
    }
  });
});

describe("format", () => {
  it("formata tamanhos", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1.023 B");
    expect(formatBytes(1536)).toMatch(/^1,5 KB$/);
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("rotula codificações", () => {
    expect(encodingLabel("windows-1252")).toBe("Windows-1252");
    expect(encodingLabel("UTF-8", true)).toBe("UTF-8 com BOM");
  });

  it("resolve caminhos relativos do Windows", () => {
    expect(dirname("C:\\docs\\notas.md")).toBe("C:\\docs");
    expect(resolvePath("C:\\docs", "img/foto.png")).toBe("C:\\docs\\img\\foto.png");
    expect(resolvePath("C:\\docs\\sub", "../foto.png")).toBe("C:\\docs\\foto.png");
    expect(resolvePath("C:\\docs", "D:\\outra\\a.png")).toBe("D:\\outra\\a.png");
    // ".." nunca sobe acima da raiz da unidade.
    expect(resolvePath("C:\\", "../../a.png")).toBe("C:\\a.png");
  });
});

describe("columnName", () => {
  it("numera colunas como o Excel", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
    expect(columnName(702)).toBe("AAA");
  });
});

describe("searchText", () => {
  const text = "Primeira linha\r\nsegunda LINHA com Linha extra\nterceira";

  it("acha ocorrências sem diferenciar maiúsculas e informa linha e coluna", () => {
    const { hits, total } = searchText(text, "linha");
    expect(total).toBe(3);
    expect(hits.map((h) => [h.line, h.column])).toEqual([
      [1, 10],
      [2, 9],
      [2, 19],
    ]);
  });

  it("limita os achados mas conta todos", () => {
    const { hits, total } = searchText("a a a a a a", "a", 2);
    expect(hits).toHaveLength(2);
    expect(total).toBe(6);
  });

  it("monta o trecho com reticências e aponta o achado dentro dele", () => {
    const long = "x".repeat(100) + "ALVO" + "y".repeat(100);
    const { hits } = searchText(long, "alvo");
    const [h] = hits;
    expect(h.snippet.startsWith("…") && h.snippet.endsWith("…")).toBe(true);
    expect(h.snippet.slice(h.snippetStart, h.snippetStart + h.length)).toBe("ALVO");
  });

  it("ignora busca vazia e o texto sem ocorrências", () => {
    expect(searchText(text, "").total).toBe(0);
    expect(searchText(text, "inexistente").total).toBe(0);
  });

  it("compara nomes e caminhos", () => {
    expect(nameMatches("Relatorio.PDF", "C:/docs/Relatorio.PDF", "relat")).toBe(true);
    expect(nameMatches("a.txt", "C:/Projetos/a.txt", "projetos")).toBe(true);
    expect(nameMatches("a.txt", "C:/x/a.txt", "zzz")).toBe(false);
  });
});
