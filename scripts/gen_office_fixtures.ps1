# (Salvo em UTF-8 com BOM: o PowerShell 5.1 lê sem BOM como ANSI.)
# Gera fixtures de Office (doc, docx, rtf, odt, pdf, xls, xlsx, ods, pptx, mp4)
# usando o Microsoft Office instalado, via COM. Arquivos reais, como os do dia a dia.
#
#   powershell -ExecutionPolicy Bypass -File scripts\gen_office_fixtures.ps1

$ErrorActionPreference = 'Stop'
$out = (Resolve-Path (Join-Path $PSScriptRoot '..\fixtures')).Path

function Release($obj) {
    if ($obj) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($obj) }
}

# ---------- Word ----------
Write-Host 'Word: documento.docx/.doc/.rtf/.odt/.pdf'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Add()
    $sel = $word.Selection

    $sel.Style = $doc.Styles.Item(-2)   # Título 1
    $sel.TypeText('Relatório Galaxy')
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item(-1)   # Normal
    $sel.TypeText('Este documento foi gerado para testar o visualizador universal. Acentuação: ação, coração, pão de açúcar, €.')
    $sel.TypeParagraph()
    $sel.Font.Bold = 1
    $sel.TypeText('Texto em negrito ')
    $sel.Font.Bold = 0
    $sel.Font.Italic = 1
    $sel.TypeText('e em itálico.')
    $sel.Font.Italic = 0
    $sel.TypeParagraph()

    $sel.Style = $doc.Styles.Item(-3)   # Título 2
    $sel.TypeText('Tabela de exemplo')
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item(-1)
    $table = $doc.Tables.Add($sel.Range, 3, 3)
    $table.Borders.Enable = 1
    $cells = @(@('Formato', 'Visualizador', 'Edita'), @('docx', 'docx-preview', 'Não'), @('txt', 'CodeMirror', 'Sim'))
    for ($r = 0; $r -lt 3; $r++) {
        for ($c = 0; $c -lt 3; $c++) { $table.Cell($r + 1, $c + 1).Range.Text = $cells[$r][$c] }
    }
    $sel.EndKey(6) | Out-Null           # fim do documento
    $sel.TypeParagraph()

    $sel.Style = $doc.Styles.Item(-3)
    $sel.TypeText('Lista e link')
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item(-1)
    $sel.Range.ListFormat.ApplyBulletDefault()
    $sel.TypeText('Primeiro item')
    $sel.TypeParagraph()
    $sel.TypeText('Segundo item')
    $sel.TypeParagraph()
    $sel.Range.ListFormat.RemoveNumbers()
    $sel.TypeText('Visite ')
    [void]$doc.Hyperlinks.Add($sel.Range, 'https://tauri.app', [Type]::Missing, [Type]::Missing, 'o site do Tauri')
    $sel.EndKey(6) | Out-Null
    $sel.TypeText('.')
    $sel.TypeParagraph()

    $sel.InsertBreak(7)                 # quebra de página
    $sel.Style = $doc.Styles.Item(-2)
    $sel.TypeText('Segunda página')
    $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item(-1)
    $sel.TypeText(('Parágrafo longo para preencher a página. ' * 30).Trim())
    $sel.TypeParagraph()

    $doc.SaveAs2("$out\documento.docx", 16)
    $doc.SaveAs2("$out\documento.doc", 0)
    $doc.SaveAs2("$out\documento.rtf", 6)
    $doc.SaveAs2("$out\documento.odt", 23)
    $doc.SaveAs2("$out\documento.pdf", 17)
    $doc.Close(0)
    Release $doc
}
finally {
    $word.Quit()
    Release $word
}

# ---------- Excel ----------
Write-Host 'Excel: planilha.xlsx/.xls/.ods'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Add()
    $ws = $wb.Worksheets.Item(1)
    $ws.Name = 'Vendas'
    $headers = 'Produto', 'Quantidade', 'Preço', 'Total', 'Data', 'Pago'
    for ($c = 0; $c -lt $headers.Count; $c++) { $ws.Cells.Item(1, $c + 1).Value2 = $headers[$c] }
    $produtos = 'Café', 'Pão', 'Açúcar', 'Leite', 'Manteiga'
    for ($r = 2; $r -le 151; $r++) {
        $ws.Cells.Item($r, 1).Value2 = $produtos[$r % 5] + " $r"
        $ws.Cells.Item($r, 2).Value2 = ($r * 7) % 23 + 1
        $ws.Cells.Item($r, 3).Value2 = [math]::Round(($r % 17) * 1.35 + 0.99, 2)
        $ws.Cells.Item($r, 4).Formula = "=B$r*C$r"
        $ws.Cells.Item($r, 5).Value2 = 46000 + $r
        $ws.Cells.Item($r, 6).Value2 = ($r % 3 -ne 0)
    }
    $ws.Range('E2:E151').NumberFormat = 'dd/mm/yyyy'
    $ws.Cells.Item(153, 1).Value2 = 'Erro de exemplo'
    $ws.Cells.Item(153, 4).Formula = '=1/0'

    $resumo = $wb.Worksheets.Add([Type]::Missing, $ws)
    $resumo.Name = 'Resumo'
    $resumo.Cells.Item(2, 2).Value2 = 'Total vendido'
    $resumo.Cells.Item(2, 3).Formula = '=SUM(Vendas!D2:D151)'
    $resumo.Cells.Item(3, 2).Value2 = 'Hora'
    $resumo.Cells.Item(3, 3).Value2 = 0.5
    $resumo.Cells.Item(3, 3).NumberFormat = 'hh:mm:ss'

    $vazia = $wb.Worksheets.Add([Type]::Missing, $resumo)
    $vazia.Name = 'Vazia'
    $ws.Activate()

    $wb.SaveAs("$out\planilha.xlsx", 51)
    $wb.SaveAs("$out\planilha.xls", 56)
    $wb.SaveAs("$out\planilha.ods", 60)
    $wb.Close($false)
    Release $wb
}
finally {
    $excel.Quit()
    Release $excel
}

# ---------- PowerPoint ----------
Write-Host 'PowerPoint: apresentacao.pptx e video.mp4'
$ppt = New-Object -ComObject PowerPoint.Application
try {
    $pres = $ppt.Presentations.Add(0)   # sem janela
    $s1 = $pres.Slides.Add(1, 1)        # título
    $s1.Shapes.Item(1).TextFrame.TextRange.Text = 'Galaxy'
    $s1.Shapes.Item(2).TextFrame.TextRange.Text = 'Apresentação de teste — ação e coração'

    $s2 = $pres.Slides.Add(2, 2)        # título e texto
    $s2.Shapes.Item(1).TextFrame.TextRange.Text = 'Formatos suportados'
    $s2.Shapes.Item(2).TextFrame.TextRange.Text = "Documentos: docx, doc, pdf`rPlanilhas: xlsx, csv`rMídia: mp3, mp4, imagens"

    $s3 = $pres.Slides.Add(3, 12)       # em branco
    $shape = $s3.Shapes.AddShape(1, 120, 100, 480, 220)
    $shape.Fill.ForeColor.RGB = 0xFF5B63  # BGR do #635bff
    $shape.TextFrame.TextRange.Text = 'Forma com texto'
    $shape.TextFrame.TextRange.Font.Size = 32

    $pres.SaveAs("$out\apresentacao.pptx", 24)
    $pres.CreateVideo("$out\video.mp4", $false, 2, 360, 24, 60)
    $deadline = (Get-Date).AddMinutes(4)
    while ($pres.CreateVideoStatus -lt 3 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if ($pres.CreateVideoStatus -ne 3) { Write-Warning "Falha ao gerar o vídeo (status $($pres.CreateVideoStatus))" }
    $pres.Close()
    Release $pres
}
finally {
    $ppt.Quit()
    Release $ppt
}

[GC]::Collect()
Write-Host "Pronto: fixtures do Office em $out"
