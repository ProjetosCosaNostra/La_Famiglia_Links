$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$ProjectName = "blackgold-beauty-finds-br"
$StoreUrl = "https://blackgold-beauty-finds-br.pages.dev/"
$CallbackRegisteredUrl = "https://blackgold-beauty-finds-br.pages.dev/mercadolivre-callback.html"
$CallbackCanonicalUrl = "https://blackgold-beauty-finds-br.pages.dev/mercadolivre-callback"
$StatsUrl = "https://blackgold-beauty-finds-br.pages.dev/api/stats"
$EventsUrl = "https://blackgold-beauty-finds-br.pages.dev/api/events"
$AdminUrl = "https://blackgold-beauty-finds-br.pages.dev/api/admin/products"
$Wrangler = "wrangler@4.119.0"

function Step([string]$Text) {
  Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Get-HttpStatusFollow([string]$Url) {
  try {
    $status = (& curl.exe -sS -L -o NUL -w "%{http_code}" --connect-timeout 15 --max-time 45 $Url).Trim()
    if ($status -match '^\d{3}$') { return [int]$status }
    return 0
  }
  catch { return 0 }
}

function Get-HttpStatusRaw([string]$Url) {
  try {
    $status = (& curl.exe -sS -o NUL -w "%{http_code}" --connect-timeout 15 --max-time 45 $Url).Trim()
    if ($status -match '^\d{3}$') { return [int]$status }
    return 0
  }
  catch { return 0 }
}

function Get-PostStatus([string]$Url, [string]$Body = '{}') {
  try {
    $status = (& curl.exe -sS -o NUL -w "%{http_code}" --connect-timeout 15 --max-time 45 -X POST -H "Content-Type: application/json" --data $Body $Url).Trim()
    if ($status -match '^\d{3}$') { return [int]$status }
    return 0
  }
  catch { return 0 }
}

Step "1/7 - Validando ferramentas"
foreach ($tool in @('node','npx','curl.exe')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool nao foi encontrado no PATH."
  }
}
if (-not (Test-Path (Join-Path $PSScriptRoot "functions"))) {
  throw "A pasta functions nao existe."
}

Step "2/7 - Validando sessao Cloudflare"
& npx --yes $Wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
  & npx --yes $Wrangler login
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel autenticar o Wrangler na Cloudflare."
  }
}

Step "3/7 - Descobrindo a production branch REAL do projeto"
$projectsRaw = (& npx --yes $Wrangler pages project list --json | Out-String)
if ($LASTEXITCODE -ne 0) {
  throw "Nao foi possivel consultar os projetos Cloudflare Pages."
}
$projects = $projectsRaw | ConvertFrom-Json
$project = $projects | Where-Object { $_.name -eq $ProjectName } | Select-Object -First 1
if (-not $project) {
  throw "Projeto Cloudflare $ProjectName nao encontrado."
}
$ProductionBranch = [string]$project.production_branch
if ([string]::IsNullOrWhiteSpace($ProductionBranch)) {
  throw "Cloudflare nao informou production_branch para $ProjectName."
}
Write-Host "Production branch detectada: $ProductionBranch" -ForegroundColor Green

Step "4/7 - Construindo a BlackGold Beauty Finds"
& node build.mjs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $PSScriptRoot "dist\index.html"))) {
  throw "O build da loja falhou."
}

Step "5/7 - Implantando explicitamente em PRODUCAO"
# IMPORTANTE: nao compilar _worker.js manualmente e nao deixar o Wrangler inferir
# a branch Git atual. O projeto e Direct Upload; se a branch Git for inferida,
# o deploy pode virar PREVIEW e a raiz oficial continuar na versao estatica anterior.
# Executado desta pasta, o Wrangler detecta /functions e envia Pages Functions junto.
& npx --yes $Wrangler pages deploy dist `
  --project-name $ProjectName `
  --branch $ProductionBranch `
  --commit-dirty=true

if ($LASTEXITCODE -ne 0) {
  throw "A implantacao da Cloudflare falhou. A versao anterior continua preservada."
}

Start-Sleep -Seconds 8

Step "6/7 - Verificando loja e callback Mercado Livre"
$storeStatus = Get-HttpStatusFollow $StoreUrl
$callbackRawStatus = Get-HttpStatusRaw $CallbackRegisteredUrl
$callbackFinalStatus = Get-HttpStatusFollow $CallbackRegisteredUrl
$callbackCanonicalStatus = Get-HttpStatusFollow $CallbackCanonicalUrl

if ($storeStatus -ne 200) {
  throw "Loja Oficial nao respondeu HTTP 200. Status: $storeStatus"
}
if ($callbackFinalStatus -ne 200 -or $callbackCanonicalStatus -ne 200) {
  throw "Callback Mercado Livre nao chegou ao conteudo final HTTP 200. Registrada=$callbackRawStatus Final=$callbackFinalStatus Canonica=$callbackCanonicalStatus"
}

Write-Host "Loja Oficial: HTTP $storeStatus" -ForegroundColor Green
Write-Host "Callback registrado/final/canonico: $callbackRawStatus / $callbackFinalStatus / $callbackCanonicalStatus" -ForegroundColor Green

Step "7/7 - Validando backend real /api/*"
$statsStatus = Get-HttpStatusRaw $StatsUrl
$eventsStatus = Get-PostStatus $EventsUrl '{}'
$adminStatus = Get-PostStatus $AdminUrl '{}'

if ($statsStatus -notin @(401,503)) {
  throw "Roteamento incorreto em /api/stats: HTTP $statsStatus; esperado 401 ou 503."
}
if ($eventsStatus -notin @(400,503)) {
  throw "Roteamento incorreto em /api/events: HTTP $eventsStatus; esperado 400 ou 503."
}
if ($adminStatus -notin @(401,503)) {
  throw "Roteamento incorreto em /api/admin/products: HTTP $adminStatus; esperado 401 ou 503."
}

Write-Host "API stats/events/admin: $statsStatus / $eventsStatus / $adminStatus" -ForegroundColor Green
if ($statsStatus -eq 503 -or $eventsStatus -eq 503 -or $adminStatus -eq 503) {
  Write-Host "Pages Functions estao em PRODUCAO. Ainda existem bindings/secrets pendentes." -ForegroundColor Yellow
} else {
  Write-Host "Pages Functions e protecoes basicas responderam como esperado." -ForegroundColor Green
}
