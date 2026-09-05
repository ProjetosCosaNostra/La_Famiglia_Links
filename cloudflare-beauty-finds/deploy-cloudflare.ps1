$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$ProjectName = "blackgold-beauty-finds-br"
$StoreUrl = "https://blackgold-beauty-finds-br.pages.dev/"
# O Mercado Livre foi configurado com a URL .html. Cloudflare Pages redireciona
# arquivos HTML para a rota canonica sem extensao (308), preservando a requisicao.
$CallbackRegisteredUrl = "https://blackgold-beauty-finds-br.pages.dev/mercadolivre-callback.html"
$CallbackCanonicalUrl = "https://blackgold-beauty-finds-br.pages.dev/mercadolivre-callback"
$StatsUrl = "https://blackgold-beauty-finds-br.pages.dev/api/stats"
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

Step "1/6 - Validando ferramentas"
foreach ($tool in @('node','npx','curl.exe')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool nao foi encontrado no PATH."
  }
}
if (-not (Test-Path (Join-Path $PSScriptRoot "functions"))) {
  throw "A pasta functions nao existe. O deploy seria apenas estatico e foi bloqueado por seguranca."
}

Step "2/6 - Validando sessao Cloudflare"
& npx --yes $Wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "A sessao Cloudflare precisa ser autenticada uma unica vez. Abrindo o login oficial..." -ForegroundColor Yellow
  & npx --yes $Wrangler login
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel autenticar o Wrangler na Cloudflare."
  }
}

Step "3/6 - Construindo a BlackGold Beauty Finds"
& node build.mjs
if ($LASTEXITCODE -ne 0) {
  throw "O build da loja falhou."
}
if (-not (Test-Path (Join-Path $PSScriptRoot "dist\index.html"))) {
  throw "O build terminou sem gerar dist\index.html."
}

Step "4/6 - Implantando a versao oficial no Cloudflare Pages"
# IMPORTANTE: o comando e executado a partir de cloudflare-beauty-finds,
# onde a pasta functions existe. Assim o Wrangler envia os assets E as Pages Functions.
# Nao usamos --branch aqui: em Direct Upload, este e o deploy de producao do projeto oficial.
& npx --yes $Wrangler pages deploy dist `
  --project-name $ProjectName `
  --commit-dirty=true

if ($LASTEXITCODE -ne 0) {
  throw "A implantacao da Cloudflare falhou. A versao anterior continua preservada."
}

Step "5/6 - Verificando a loja e o callback"
$storeStatus = Get-HttpStatusFollow $StoreUrl
$callbackRawStatus = Get-HttpStatusRaw $CallbackRegisteredUrl
$callbackFinalStatus = Get-HttpStatusFollow $CallbackRegisteredUrl
$callbackCanonicalStatus = Get-HttpStatusFollow $CallbackCanonicalUrl

if ($storeStatus -ne 200) {
  throw "Deploy enviado, mas a Loja Oficial nao respondeu HTTP 200. Status observado: $storeStatus"
}
if ($callbackFinalStatus -ne 200 -or $callbackCanonicalStatus -ne 200) {
  throw "Deploy enviado, mas o callback Mercado Livre nao chegou ao conteudo final HTTP 200. Registrada=$callbackRawStatus Final=$callbackFinalStatus Canonica=$callbackCanonicalStatus"
}

Write-Host "Loja Oficial: HTTP $storeStatus" -ForegroundColor Green
if ($callbackRawStatus -in @(301,302,307,308)) {
  Write-Host "Callback registrado: HTTP $callbackRawStatus -> redirecionamento canonico esperado do Cloudflare Pages" -ForegroundColor Green
} else {
  Write-Host "Callback registrado: HTTP $callbackRawStatus" -ForegroundColor Green
}
Write-Host "Callback final/canonico: HTTP $callbackFinalStatus / $callbackCanonicalStatus" -ForegroundColor Green

Step "6/6 - Verificando Pages Functions / backend"
$statsStatus = Get-HttpStatusFollow $StatsUrl

switch ($statsStatus) {
  401 {
    Write-Host "Pages Functions ATIVAS. /api/stats esta protegido e respondeu 401 sem token, como esperado." -ForegroundColor Green
  }
  503 {
    Write-Host "Pages Functions chegaram a producao, mas D1 e/ou STATS_EXPORT_TOKEN ainda nao estao configurados." -ForegroundColor Yellow
  }
  404 {
    Write-Host "ATENCAO: /api/stats respondeu 404. As Pages Functions nao foram publicadas corretamente." -ForegroundColor Red
    exit 2
  }
  0 {
    Write-Host "Nao foi possivel consultar /api/stats depois do deploy. Repetir a verificacao quando a rede estabilizar." -ForegroundColor Yellow
  }
  default {
    Write-Host "Resposta inesperada de /api/stats: HTTP $statsStatus. Registrar para diagnostico antes de marcar backend como concluido." -ForegroundColor Yellow
  }
}

Write-Host "`n============================================================" -ForegroundColor DarkYellow
Write-Host "BLACKGOLD BEAUTY FINDS - IMPLANTACAO WRANGLER CONCLUIDA" -ForegroundColor Green
Write-Host "Loja:               $StoreUrl"
Write-Host "Callback registrado: $CallbackRegisteredUrl (HTTP $callbackRawStatus)"
Write-Host "Callback canonico:   $CallbackCanonicalUrl (HTTP $callbackCanonicalStatus)"
Write-Host "Backend:             HTTP $statsStatus em /api/stats"
Write-Host "============================================================" -ForegroundColor DarkYellow
