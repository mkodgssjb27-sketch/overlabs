<#
  OVER LABS - Script de Deploy
  USO: .\deploy.ps1
  USO: .\deploy.ps1 -Msg "Descricao da mudanca"
#>

param(
  [string]$Msg = "Atualizacao do app"
)

$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$swFile = Join-Path $PSScriptRoot "sw.js"
$swProfFile = Join-Path (Join-Path $PSScriptRoot "prof") "sw.js"

# Bump versao SW aluno
$content = Get-Content $swFile -Raw
if ($content -match 'overlabs-v(\d+)') {
  $oldVersion = [int]$Matches[1]
  $newVersion = $oldVersion + 1
  $content = $content -replace "overlabs-v$oldVersion", "overlabs-v$newVersion"
  Set-Content $swFile $content -NoNewline
  Write-Host ""
  Write-Host "  OVER LABS - Deploy" -ForegroundColor Yellow
  Write-Host "  Aluno SW: v$oldVersion -> v$newVersion" -ForegroundColor Cyan
} else {
  Write-Host "  ERRO: Nao encontrei a versao no sw.js" -ForegroundColor Red
  exit 1
}

# Bump versao SW professor
if (Test-Path $swProfFile) {
  $contentProf = Get-Content $swProfFile -Raw
  if ($contentProf -match 'overhost-v(\d+)') {
    $oldProf = [int]$Matches[1]
    $newProf = $oldProf + 1
    $contentProf = $contentProf -replace "overhost-v$oldProf", "overhost-v$newProf"
    Set-Content $swProfFile $contentProf -NoNewline
    Write-Host "  Prof  SW: v$oldProf -> v$newProf" -ForegroundColor Cyan
  }
}

Write-Host "  Enviando para GitHub..." -ForegroundColor Gray
git add -A
git commit -m "v$newVersion - $Msg"
git push origin main

Write-Host ""
Write-Host "  Deploy concluido! (v$newVersion)" -ForegroundColor Green
Write-Host "  Alunos e professor verao a nova versao ao abrir o app." -ForegroundColor Gray
Write-Host ""
