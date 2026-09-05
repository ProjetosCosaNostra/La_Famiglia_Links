$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[1/2] Construindo a BlackGold Beauty Finds..." -ForegroundColor Cyan
node build.mjs

Write-Host "[2/2] Implantando no projeto oficial Cloudflare Pages..." -ForegroundColor Cyan
npx --yes wrangler@4.119.0 pages deploy dist `
  --project-name blackgold-beauty-finds-br `
  --branch main `
  --commit-dirty=true

if ($LASTEXITCODE -ne 0) {
  throw "A implantação da Cloudflare falhou."
}

Write-Host "Implantação concluída: https://blackgold-beauty-finds-br.pages.dev/" -ForegroundColor Green
