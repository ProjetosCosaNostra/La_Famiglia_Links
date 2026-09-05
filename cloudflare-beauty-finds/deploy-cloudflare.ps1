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
    $status = (& curl.exe -sS -L -o NUL -w "%{http_code}" --connect-timeout 15 --max-time 45 -X POST -H "Content-Type: application/json" --data $Body $Url).Trim()
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
  throw "A pasta functions nao existe. O deploy seria apenas estatico e foi bloqueado por seguranca."
}

Step "2/7 - Validando sessao Cloudflare"
& npx --yes $Wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "A sessao Cloudflare precisa ser autenticada uma unica vez. Abrindo o login oficial..." -ForegroundColor Yellow
  & npx --yes $Wrangler login
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel autenticar o Wrangler na Cloudflare."
  }
}

Step "3/7 - Construindo a BlackGold Beauty Finds"
& node build.mjs
if ($LASTEXITCODE -ne 0) {
  throw "O build da loja falhou."
}
if (-not (Test-Path (Join-Path $PSScriptRoot "dist\index.html"))) {
  throw "O build terminou sem gerar dist\index.html."
}

Step "4/7 - Compilando Pages Functions explicitamente"
# Compilamos a arvore /functions em um unico Worker dentro do pacote publicado.
# Isso elimina a ambiguidade observada quando a loja estatica estava online,
# mas /api/* caia no fallback estatico (GET 200 / POST 405).
& npx --yes $Wrangler pages functions build functions --outfile "dist/_worker.js"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $PSScriptRoot "dist\_worker.js"))) {
  throw "Falha ao compilar Pages Functions para dist/_worker.js."
}

# Somente /api/* invoca o Worker. O restante continua sendo servido como asset estatico,
# preservando o custo/limite de Functions para as rotas que realmente precisam de backend.
$routesPath = Join-Path $PSScriptRoot "dist\_routes.json"
$routesJson = '{"version":1,"include":["/api/*"],"exclude":[]}'
[System.IO.File]::WriteAllText($routesPath, $routesJson, (New-Object System.Text.UTF8Encoding($false)))

Step "5/7 - Implantando a versao oficial no Cloudflare Pages"
& npx --yes $Wrangler pages deploy dist `
  --project-name $ProjectName `
  --commit-dirty=true

if ($LASTEXITCODE -ne 0) {
  throw "A implantacao da Cloudflare falhou. A versao anterior continua preservada."
}

Step "6/7 - Verificando loja e callback Mercado Livre"
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
  Write-Host "Callback registrado: HTTP $callbackRawStatus -> redirecionamento canonico esperado" -ForegroundColor Green
} else {
  Write-Host "Callback registrado: HTTP $callbackRawStatus" -ForegroundColor Green
}
Write-Host "Callback final/canonico: HTTP $callbackFinalStatus / $callbackCanonicalStatus" -ForegroundColor Green

Step "7/7 - Validando backend real /api/*"
$statsStatus = Get-HttpStatusFollow $StatsUrl
$eventsStatus = Get-PostStatus $EventsUrl '{}'
$adminStatus = Get-PostStatus $AdminUrl '{}'

# Com as Functions realmente ativas:
# /api/stats sem Bearer = 401 (configurado) ou 503 (binding/token pendente)
# /api/events com payload vazio = 400 (D1 configurado) ou 503 (D1 pendente)
# /api/admin/products sem Bearer = 401 (segredos configurados) ou 503 (segredos pendentes)
if ($statsStatus -notin @(401,503)) {
  throw "Backend nao passou na prova de roteamento: /api/stats retornou HTTP $statsStatus; esperado 401 ou 503."
}
if ($eventsStatus -notin @(400,503)) {
  throw "Backend nao passou na prova de roteamento: /api/events retornou HTTP $eventsStatus; esperado 400 ou 503."
}
if ($adminStatus -notin @(401,503)) {
  throw "Backend nao passou na prova de roteamento: /api/admin/products retornou HTTP $adminStatus; esperado 401 ou 503."
}

Write-Host "API /api/stats:          HTTP $statsStatus" -ForegroundColor Green
Write-Host "API /api/events:         HTTP $eventsStatus" -ForegroundColor Green
Write-Host "API /api/admin/products: HTTP $adminStatus" -ForegroundColor Green

if ($statsStatus -eq 503 -or $eventsStatus -eq 503 -or $adminStatus -eq 503) {
  Write-Host "Pages Functions estao ATIVAS. Ainda existe configuracao de binding/segredo pendente na Cloudflare." -ForegroundColor Yellow
} else {
  Write-Host "Pages Functions estao ATIVAS e os bindings/segredos basicos responderam como esperado." -ForegroundColor Green
}

Write-Host "`n============================================================" -ForegroundColor DarkYellow
Write-Host "BLACKGOLD BEAUTY FINDS - IMPLANTACAO VALIDADA" -ForegroundColor Green
Write-Host "Loja:               $StoreUrl"
Write-Host "Callback registrado: HTTP $callbackRawStatus"
Write-Host "Callback final:      HTTP $callbackFinalStatus"
Write-Host "API stats/events/admin: $statsStatus / $eventsStatus / $adminStatus"
Write-Host "============================================================" -ForegroundColor DarkYellow
