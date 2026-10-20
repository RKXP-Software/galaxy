<p align="center">
  <img src="assets/icons/galaxy.svg" width="96" alt="Galaxy" />
</p>

<h1 align="center">Galaxy</h1>

<p align="center">Um único app para abrir quase qualquer arquivo no Windows: textos, markdown, JSON, imagens, áudio, vídeo, PDF, planilhas, documentos do Office, zip e e-books.</p>

Feito com **Tauri 2** (Rust) + **React** + **TypeScript**. O instalador tem poucos MB e o app usa o WebView2 que já vem no Windows, em vez de embutir um navegador inteiro.

## Formatos

| Grupo | Extensões | Como abre | Edita |
|---|---|---|---|
| Texto e código | txt, log, ini, js, ts, py, html, css, xml, yaml, sql, rs, cs... | CodeMirror com destaque de sintaxe | sim |
| Markdown | md | editor + pré-visualização | sim |
| JSON | json, jsonc, geojson | árvore recolhível ou texto | sim |
| Imagens | png, jpg, gif, webp, svg, bmp, ico, avif | zoom, arrastar e girar | não |
| Áudio | mp3, wav, ogg, flac, m4a, aac | player com velocidade e atalhos | não |
| Vídeo | mp4, webm, mov (H.264) | player com streaming do disco | não |
| PDF | pdf | pdf.js: busca, zoom, páginas sob demanda | não |
| Planilhas | csv, tsv, xls, xlsx, xlsm, ods | grade virtualizada, lida em Rust | csv como texto |
| Word | docx | docx-preview | não |
| Word antigo, RTF, ODT | doc, rtf, odt | texto extraído (sem formatação completa) | não |
| PowerPoint | pptx | pptx-preview (visualização aproximada) | não |
| Compactados | zip | lista de arquivos; abre itens em nova aba | não |
| E-books | epub | leitor com sumário | não |
| Outros | qualquer arquivo | visualização hexadecimal | não |

Arquivos de texto são lidos com a codificação detectada (UTF-8, UTF-16, Windows-1252...) e salvos na mesma codificação e com as mesmas quebras de linha.

## Recursos

- Abas, com encolhimento automático e menu com todas as abas abertas
- Arrastar e soltar, Ctrl+O, arquivos recentes
- Ctrl+S salva; indicador de alterações não salvas
- Tema claro/escuro seguindo o Windows
- Instância única: abrir outro arquivo vira aba na janela já aberta
- "Abrir com" do Windows (o instalador registra as extensões suportadas)

Atalhos: `Ctrl+O` abrir · `Ctrl+S` salvar · `Ctrl+W` fechar aba · `Ctrl+Tab` / `Ctrl+Shift+Tab` trocar de aba · `Ctrl+F` buscar (PDF).

## Instalação

Baixe o instalador `Galaxy_x.y.z_x64-setup.exe` na página de [Releases](../../releases) e execute. A instalação é por usuário e não exige administrador.

> O instalador não é assinado digitalmente; o Windows SmartScreen pode avisar na primeira execução. Clique em "Mais informações" › "Executar assim mesmo".

O Windows não permite que um programa se defina como padrão sozinho. Para abrir, por exemplo, todos os PDFs no Galaxy, use "Abrir com" › "Escolher outro aplicativo" › Galaxy › "Sempre".

## Desenvolvimento

Requisitos: Node 20+, [Rust](https://rustup.rs) e as ferramentas de build C++ do Visual Studio (necessárias ao Tauri no Windows).

```bash
npm install
npm run tauri dev      # app em modo desenvolvimento
npm run tauri build    # gera o instalador em src-tauri/target/release/bundle/nsis
```

Testes e verificações:

```bash
npm run test:rust      # back-end Rust (detecção, texto, CSV, zip, doc/rtf/odt)
npm run typecheck      # TypeScript
npm test               # testes do front (vitest)
```

Arquivos de exemplo para testar cada visualizador:

```bash
python scripts/gen_fixtures.py            # gera fixtures/ (use --grandes para arquivos pesados)
powershell -File scripts/gen_office_fixtures.ps1   # doc, docx, xls, xlsx, pptx, mp4 (requer Microsoft Office)
```

### Estrutura

```
src/                    front-end React
  app/                  store de abas, atalhos, ações
  components/           abas, barra de status, tela inicial
  lib/                  wrappers dos comandos Rust, mapa de formatos
  viewers/              um visualizador por formato, carregado sob demanda
    registry.ts         extensão → visualizador
src-tauri/src/          back-end Rust
  detect.rs             identifica o tipo pelos bytes
  commands/             texto, planilhas, zip, extração de documentos
  formats/              leitores de doc, rtf e odt
assets/icons/galaxy.svg ícone do app (fonte)
```

Para suportar um formato novo: crie o componente em `src/viewers/`, registre-o em `registry.ts` e mapeie as extensões em `src/lib/fileTypes.ts`.

## Limitações conhecidas

- `.doc` (Word 97-2003), `.rtf` e `.odt` mostram só o texto, sem imagens e formatação.
- Vídeo e áudio dependem dos codecs do WebView2: MP4 precisa ser H.264; MKV e HEVC não tocam.
- A visualização de `.pptx` é aproximada.
- Planilhas são somente leitura (CSV pode ser editado no modo Texto).
