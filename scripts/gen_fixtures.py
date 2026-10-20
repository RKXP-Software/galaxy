"""Gera arquivos de exemplo em fixtures/ para testar cada visualizador.

Só usa a biblioteca padrão; Pillow e lameenc são opcionais (imagens extras e MP3).
Os formatos do Office (.doc, .docx, .xls, .pptx, .mp4...) vêm de
scripts/gen_office_fixtures.ps1, que usa o próprio Office instalado.

    python scripts/gen_fixtures.py            # fixtures pequenos
    python scripts/gen_fixtures.py --grandes  # também arquivos grandes, em fixtures/grandes
"""

import argparse
import json
import math
import os
import random
import struct
import wave
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fixtures"

TEXTO = """Galaxy — arquivo de texto de exemplo
=====================================

Acentuação: ação, coração, pão, maçã, órgão, você, à, ü.
Símbolos: € £ © ® ™ … “aspas” ‘simples’ — travessão.
Emoji: 🚀🌌✨

Linha com tabulação:\tcoluna 2\tcoluna 3
"""


def write_text(name: str, content: str, encoding: str = "utf-8", newline: str = "\r\n") -> None:
    data = content.replace("\n", newline).encode(encoding)
    (OUT / name).write_bytes(data)


def png_bytes(width: int, height: int) -> bytes:
    """PNG RGBA com degradê, escrito à mão (sem Pillow)."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            r = int(255 * x / max(width - 1, 1))
            g = int(255 * y / max(height - 1, 1))
            b = int(128 + 127 * math.sin((x + y) / 18))
            a = 255 if (x // 40 + y // 40) % 5 else 90
            rows += bytes((r, g, b, a))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")


def make_images() -> None:
    (OUT / "imagem.png").write_bytes(png_bytes(640, 400))
    (OUT / "vetor.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#635bff"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
  <rect width="400" height="300" rx="24" fill="#15161d"/>
  <circle cx="200" cy="150" r="50" fill="url(#g)"/>
  <ellipse cx="200" cy="150" rx="150" ry="50" fill="none" stroke="url(#g)" stroke-width="8" transform="rotate(-20 200 150)"/>
  <text x="200" y="275" font-family="Segoe UI" font-size="22" fill="#e4e6f0" text-anchor="middle">Galaxy SVG</text>
  <script>document.title = "script não deve rodar"</script>
</svg>
""",
        encoding="utf-8",
    )
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("  Pillow ausente: pulando jpg, gif, webp, bmp e ico")
        return
    base = Image.open(OUT / "imagem.png").convert("RGB")
    base.save(OUT / "foto.jpg", quality=88)
    base.save(OUT / "foto.jpeg", quality=70)
    base.save(OUT / "imagem.webp", quality=85)
    base.save(OUT / "imagem.bmp")
    base.resize((256, 256)).save(OUT / "icone.ico", sizes=[(16, 16), (32, 32), (256, 256)])
    frames = []
    for i in range(12):
        frame = Image.new("RGB", (200, 200), (21, 22, 29))
        draw = ImageDraw.Draw(frame)
        angle = i * math.pi / 6
        x, y = 100 + 60 * math.cos(angle), 100 + 60 * math.sin(angle)
        draw.ellipse((x - 18, y - 18, x + 18, y + 18), fill=(99, 91, 255))
        draw.ellipse((88, 88, 112, 112), fill=(168, 85, 247))
        frames.append(frame)
    frames[0].save(OUT / "animacao.gif", save_all=True, append_images=frames[1:], duration=80, loop=0)


def make_audio() -> None:
    rate = 44100
    seconds = 4
    samples = bytearray()
    for i in range(rate * seconds):
        t = i / rate
        # Acorde de dó maior com volume decrescente.
        v = sum(math.sin(2 * math.pi * f * t) for f in (261.63, 329.63, 392.0)) / 3
        v *= 0.4 * (1 - t / seconds)
        samples += struct.pack("<h", int(v * 32767))
    with wave.open(str(OUT / "som.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(samples))
    try:
        import lameenc
    except ImportError:
        print("  lameenc ausente: pulando mp3")
        return
    enc = lameenc.Encoder()
    enc.set_bit_rate(128)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    (OUT / "musica.mp3").write_bytes(enc.encode(bytes(samples)) + enc.flush())


def make_text_files() -> None:
    write_text("texto.txt", TEXTO)
    write_text("latin1.txt", "Arquivo antigo em Windows-1252.\nAção, coração e pão de açúcar.\nPreço: R$ 10,50 — ok\n", "cp1252")
    write_text("utf16.txt", "Texto em UTF-16 com BOM: olá, mundo!\n", "utf-16", "\n")
    write_text("LICENSE", "Arquivo sem extensão, mas é texto.\n", newline="\n")
    write_text(
        "notas.md",
        """# Notas do Galaxy

Um **markdown** com _formatação_, `código` e [link para o texto](texto.txt).

## Lista

- Item um
- Item dois com [link externo](https://tauri.app)
  - Subitem

1. Primeiro
2. Segundo

## Tabela

| Formato | Visualizador | Edita |
|---------|--------------|:-----:|
| md      | Markdown     | ✔     |
| pdf     | pdf.js       | ✘     |

## Código

```rust
fn main() {
    println!("Olá, Galaxy!");
}
```

> Citação com acentuação: ação e coração.

## Imagem local

![degradê](imagem.png)

[Voltar ao topo](#notas-do-galaxy)

<details><summary>HTML embutido</summary>Conteúdo escondido.</details>

<script>alert("não deve rodar")</script>
""",
        newline="\n",
    )
    data = {
        "app": "Galaxy",
        "versao": "0.1.0",
        "ativo": True,
        "nulo": None,
        "preco": 1234.56,
        "formatos": ["txt", "md", "json", "pdf", "docx", "xlsx", "mp4"],
        "autor": {"nome": "Equipe", "cidade": "São Paulo", "tags": ["desktop", "rust", "react"]},
        "itens": [{"id": i, "nome": f"Item {i}", "valor": round(i * 1.5, 2)} for i in range(500)],
    }
    write_text("dados.json", json.dumps(data, ensure_ascii=False, indent=2), newline="\n")
    write_text("invalido.json", '{\n  "aberto": true,\n  "faltou": "fechar"\n', newline="\n")

    rows = ["id;nome;cidade;valor;data"]
    cities = ["São Paulo", "Brasília", "Belém", "Florianópolis", "Goiânia"]
    for i in range(1, 2001):
        rows.append(f'{i};"Cliente {i}";{cities[i % 5]};{i * 3.7:.2f}'.replace(".", ",") + f";{(i % 28) + 1:02d}/03/2026")
    write_text("tabela.csv", "\n".join(rows) + "\n", "cp1252")
    write_text("virgula.csv", 'a,b,c\n1,"texto, com vírgula",3\n4,5,6\n', newline="\n")
    (OUT / "utf8-bom.csv").write_bytes("\ufeffproduto,preço\nCafé,12.50\nPão,0.75\n".encode("utf-8"))

    code = {
        "codigo.py": 'def saudacao(nome: str) -> str:\n    """Cumprimenta."""\n    return f"Olá, {nome}!"\n\n\nif __name__ == "__main__":\n    print(saudacao("Galaxy"))\n',
        "script.ts": "interface Arquivo {\n  nome: string;\n  tamanho: number;\n}\n\nexport const abrir = (a: Arquivo): string => `${a.nome} (${a.tamanho} bytes)`;\n",
        "estilo.css": ":root {\n  --accent: #635bff;\n}\n\nbody {\n  font-family: system-ui;\n  color: var(--accent);\n}\n",
        "pagina.html": "<!doctype html>\n<html lang=\"pt-BR\">\n<head><title>Teste</title></head>\n<body>\n  <h1>Olá</h1>\n  <script>console.log('oi')</script>\n</body>\n</html>\n",
        "config.yaml": "app:\n  nome: Galaxy\n  janelas:\n    - principal\n    - preferencias\n  depurar: false\n",
        "consulta.sql": "SELECT c.nome, SUM(p.valor) AS total\nFROM clientes c\nJOIN pedidos p ON p.cliente_id = c.id\nWHERE p.data >= '2026-01-01'\nGROUP BY c.nome\nORDER BY total DESC;\n",
        "main.rs": 'use std::fs;\n\nfn main() -> std::io::Result<()> {\n    let texto = fs::read_to_string("texto.txt")?;\n    println!("{} caracteres", texto.chars().count());\n    Ok(())\n}\n',
        "Program.cs": 'using System;\n\nclass Program\n{\n    static void Main() => Console.WriteLine("Olá do C#");\n}\n',
        "dados.xml": '<?xml version="1.0" encoding="UTF-8"?>\n<catalogo>\n  <livro id="1"><titulo>Dom Casmurro</titulo></livro>\n</catalogo>\n',
        "deploy.ps1": '$destino = "C:\\Apps\\Galaxy"\nif (-not (Test-Path $destino)) {\n    New-Item -ItemType Directory $destino | Out-Null\n}\nWrite-Host "Pronto"\n',
    }
    for name, content in code.items():
        write_text(name, content, newline="\n")


def make_zip() -> None:
    with zipfile.ZipFile(OUT / "pacote.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("leia-me.txt", "Arquivo dentro do zip. Ação!\n")
        z.writestr("docs/", "")
        z.writestr("docs/notas.md", "# Dentro do zip\n\nMarkdown compactado.\n")
        z.writestr("docs/dados/config.json", json.dumps({"dentro": "do zip", "nivel": 3}))
        z.write(OUT / "imagem.png", "imagens/imagem.png")
        z.writestr("../fora.txt", "tentativa de zip-slip: não deve ser extraído fora da pasta")


def make_epub() -> None:
    chapters = [
        ("Capítulo 1 — A partida", "Era uma vez um aplicativo que abria qualquer arquivo. " * 40),
        ("Capítulo 2 — A viagem", "Pelas estrelas, entre PDFs e planilhas, seguia a jornada. " * 40),
        ("Capítulo 3 — A chegada", "E assim, todos os formatos encontraram um lar. " * 40),
    ]
    with zipfile.ZipFile(OUT / "livro.epub", "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        manifest = "".join(f'<item id="c{i}" href="cap{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1, 4))
        spine = "".join(f'<itemref idref="c{i}"/>' for i in range(1, 4))
        z.writestr(
            "OEBPS/content.opf",
            '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">'
            '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">galaxy-livro</dc:identifier>'
            "<dc:title>A Jornada do Galaxy</dc:title><dc:language>pt-BR</dc:language>"
            '<meta property="dcterms:modified">2026-10-20T00:00:00Z</meta></metadata>'
            f'<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>{manifest}</manifest>'
            f"<spine>{spine}</spine></package>",
        )
        links = "".join(f'<li><a href="cap{i}.xhtml">{t}</a></li>' for i, (t, _) in enumerate(chapters, 1))
        z.writestr(
            "OEBPS/nav.xhtml",
            '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
            f'<head><title>Sumário</title></head><body><nav epub:type="toc"><ol>{links}</ol></nav></body></html>',
        )
        for i, (title, body) in enumerate(chapters, 1):
            paragraphs = "".join(f"<p>{body}</p>" for _ in range(4))
            z.writestr(
                f"OEBPS/cap{i}.xhtml",
                '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml">'
                f"<head><title>{title}</title></head><body><h1>{title}</h1>{paragraphs}</body></html>",
            )


def make_pdf(path: Path, pages: int) -> None:
    """PDF de texto com N páginas, escrito à mão."""
    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)

    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    pages_id = len(objects) + 1 + pages * 2
    kids = []
    for n in range(1, pages + 1):
        lines = [f"BT /F1 28 Tf 72 740 Td (Pagina {n} de {pages}) Tj ET"]
        for i in range(30):
            lines.append(f"BT /F1 11 Tf 72 {700 - i * 20} Td (Linha {i + 1}: texto pesquisavel galaxy pdf {n}-{i}) Tj ET")
        stream = "\n".join(lines).encode("latin-1")
        content = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        kids.append(
            add(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (pages_id, font, content)
            )
        )
    add(b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(b"%d 0 R" % k for k in kids), pages))
    catalog = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog, xref)
    path.write_bytes(bytes(out))


def make_misc() -> None:
    rng = random.Random(42)
    (OUT / "desconhecido.bin").write_bytes(b"GLXY\x00\x01" + bytes(rng.randrange(256) for _ in range(5000)))
    (OUT / "vazio.txt").write_bytes(b"")
    make_pdf(OUT / "simples.pdf", 3)


def make_large() -> None:
    big = OUT / "grandes"
    big.mkdir(exist_ok=True)
    print("  csv de ~200 MB…")
    with open(big / "grande.csv", "w", encoding="utf-8", newline="\n") as f:
        f.write("id,nome,email,cidade,valor,data\n")
        for i in range(2_600_000):
            f.write(f"{i},Pessoa {i},pessoa{i}@exemplo.com,Cidade {i % 997},{i * 1.37:.2f},2026-{i % 12 + 1:02d}-{i % 28 + 1:02d}\n")
    print("  pdf de 600 páginas…")
    make_pdf(big / "grande.pdf", 600)
    print("  log de ~80 MB…")
    with open(big / "grande.log", "w", encoding="utf-8", newline="\n") as f:
        for i in range(1_000_000):
            f.write(f"2026-10-20 12:{i % 60:02d}:{i % 60:02d} INFO [modulo-{i % 17}] mensagem numero {i} processada\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--grandes", action="store_true", help="gera também arquivos grandes")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    print("Gerando fixtures em", OUT)
    make_text_files()
    make_images()
    make_audio()
    make_zip()
    make_epub()
    make_misc()
    if args.grandes:
        make_large()
    print("Pronto:", len([p for p in OUT.iterdir() if p.is_file()]), "arquivos")


if __name__ == "__main__":
    main()
