$ErrorActionPreference = "Stop"

git config --global user.name "O Capo da Criacao"
git config --global user.email "projetoscosanostra@gmail.com"

if (!(Test-Path ".git")) {
    git init
}

$readme = @"
# La Famiglia Links — Cosa Nostra

Painel central da Familia das Ideias.
Reune projetos, produtos e conexoes que mantem a Familia unida pela:
Familia, Honra, Respeito e Palavra.

---
Estrutura:
- /data → Configuracoes
- /assets → Logos e imagens
- /docs → Documentos internos
- /logs → Registros de publicacao
---

Cosa Nostra — A Familia das Ideias
Criado por Felipe, O Capo da Criacao
"@
$readme | Out-File -Encoding utf8 "README.md"

$mensagemCommit = "Publicacao automatica - $(Get-Date -Format 'dd/MM/yyyy HH:mm')"
git add .
git commit -m "$mensagemCommit" 2>$null

git remote remove origin 2>$null
git remote add origin https://github.com/ProjetosCosaNostra/La_Famiglia_Links.git

git branch -M main
git push -u origin main -f

Write-Host "============================================"
Write-Host "Publicacao concluida com sucesso, Capo!"
Write-Host "Site online em: https://projetoscosanostra.github.io/La_Famiglia_Links/"
Write-Host "Registro salvo em: logs/publicacao.txt"
Write-Host "============================================"
