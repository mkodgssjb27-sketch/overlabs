<#
  OVER LABS — Script de Deploy (Atualização do App)
  
  Este script:
  1. Incrementa a versão no sw.js (força atualização nos celulares)
  2. Faz commit das alterações
  3. Envia para o GitHub Pages
  
  USO: Abra o terminal no VS Code e execute:
    .\deploy.ps1
  
  Ou com mensagem personalizada:
    .\deploy.ps1 -Msg "Adicionei tela de torneios"
#>

param(
  [string]$Msg = "Atualização do app"
)

$ErrorActionPreference = "Stop"
$swFile = Join-Path $PSScriptRoot "sw.js"

# 1. Ler versão atual do sw.js
$content = Get-Content $swFile -Raw
if ($content -match 'overlabs-v(\d+)') {
  $oldVersion = [int]$Matches[1]
  $newVersion = $oldVersion + 1
  $content = $content -replace "overlabs-v$oldVersion", "overlabs-v$newVersion"
  Set-Content $swFile $content -NoNewline
  Write-Host ""
  Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Yellow
  Write-Host "  ║     🚀 OVER LABS — Deploy            ║" -ForegroundColor Yellow
  Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Versão: v$oldVersion → v$newVersion" -ForegroundColor Cyan
} else {
  Write-Host "  ⚠ Não encontrei a versão no sw.js" -ForegroundColor Red
  exit 1
}

# 2. Git add + commit + push
Write-Host "  Enviando para GitHub..." -ForegroundColor Gray
git add -A
git commit -m "v$newVersion — $Msg"
git push origin main

Write-Host ""
Write-Host "  ✅ Deploy concluído! (v$newVersion)" -ForegroundColor Green
Write-Host "  Os alunos verão 'Nova versão disponível' ao abrir o app." -ForegroundColor Gray
Write-Host ""
