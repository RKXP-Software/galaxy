// Copia os recursos de que o pdf.js precisa em tempo de execução (mapas de
// caracteres, fontes padrão, decodificadores wasm e perfis de cor) para
// public/pdfjs, de onde o PdfViewer os carrega. Roda antes de dev e build.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "pdfjs-dist");
const target = join(root, "public", "pdfjs");

if (!existsSync(source)) {
  console.error("pdfjs-dist não encontrado. Rode npm install.");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const from = join(source, dir);
  if (existsSync(from)) cpSync(from, join(target, dir), { recursive: true });
}
console.log("Recursos do pdf.js copiados para public/pdfjs");
