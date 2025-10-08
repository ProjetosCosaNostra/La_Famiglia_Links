# ============================================
# Cosa Nostra - Publicacao Automatica no GitHub Pages
# ============================================

$repoPath = "E:\La_Famiglia_Links"
$repoUrl = "https://github.com/ProjetosCosaNostra/La_Famiglia_Links.git"
$branchName = "main"
$commitMessage = "Atualizacao automatica - $(Get-Date -Format 'dd/MM/yyyy HH:mm')"

# Verifica se a pasta existe
if (!(Test-Path $repoPath)) {
    Write-Host "Pasta do projeto nao encontrada em $repoPath" -ForegroundColor Red
    exit
}

# Acessa o diretorio
Set-Location $repoPath

# Verifica se e um repositorio Git
if (!(Test-Path ".git")) {
    Write-Host "Inicializando repositorio Git..."
    git init
    git branch -M $branchName
    git remote add origin $repoUrl
}

# Adiciona e commita alteracoes
Write-Host "Preparando commit..."
git add .
git commit -m "$commitMessage"

# Envia para o GitHub
Write-Host "Enviando para o repositorio remoto..."
git push -u origin $branchName

# Publica no GitHub Pages
Write-Host "Publicando no GitHub Pages..."
gh pages deploy --branch $branchName --dist "." --message "Deploy via PowerShell - $(Get-Date -Format 'dd/MM/yyyy')"

# Mensagem final
Write-Host ""
Write-Host "============================================"
Write-Host "Publicacao concluida com sucesso!"
Write-Host "Site online em: https://projetoscosanostra.github.io/La_Famiglia_Links/"
Write-Host "============================================"
