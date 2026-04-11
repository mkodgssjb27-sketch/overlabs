# ============================================
# PONTO DE RESTAURAÇÃO — PRÉ-LOJA CUTS
# ============================================
# Criado em: 2026-04-11
# Descrição: Restaura aluno.html e prof/index.html
#            ao estado anterior à implementação da
#            Loja CUTS + Editor de Artes.
#
# USO:
#   1. Execute: .\restore-pre-loja.ps1
#   2. Os backups estão em .backup-pre-loja/
#   3. Os novos arquivos /cuts/ e /editor/ serão removidos
# ============================================

$backupDir = ".backup-pre-loja"

if (-not (Test-Path $backupDir)) {
    Write-Host "ERRO: Pasta de backup '$backupDir' nao encontrada!" -ForegroundColor Red
    Write-Host "Os backups precisam ter sido criados antes." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host " RESTAURACAO PRE-LOJA CUTS" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Isso vai:" -ForegroundColor Cyan
Write-Host "  - Restaurar aluno.html do backup"
Write-Host "  - Restaurar prof/index.html do backup"
Write-Host "  - Remover pasta /cuts/"
Write-Host "  - Remover pasta /editor/"
Write-Host ""

$confirm = Read-Host "Confirmar restauracao? (s/n)"
if ($confirm -ne "s") {
    Write-Host "Cancelado." -ForegroundColor Gray
    exit 0
}

# Restaurar arquivos
if (Test-Path "$backupDir\aluno.html") {
    Copy-Item "$backupDir\aluno.html" "aluno.html" -Force
    Write-Host "[OK] aluno.html restaurado" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Backup de aluno.html nao encontrado" -ForegroundColor Yellow
}

if (Test-Path "$backupDir\prof-index.html") {
    Copy-Item "$backupDir\prof-index.html" "prof\index.html" -Force
    Write-Host "[OK] prof/index.html restaurado" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Backup de prof/index.html nao encontrado" -ForegroundColor Yellow
}

# Remover novos arquivos
if (Test-Path "cuts") {
    Remove-Item "cuts" -Recurse -Force
    Write-Host "[OK] Pasta /cuts/ removida" -ForegroundColor Green
}
if (Test-Path "editor") {
    Remove-Item "editor" -Recurse -Force
    Write-Host "[OK] Pasta /editor/ removida" -ForegroundColor Green
}

Write-Host ""
Write-Host "Restauracao concluida!" -ForegroundColor Green
Write-Host "O sistema esta no estado anterior a Loja CUTS." -ForegroundColor Cyan
