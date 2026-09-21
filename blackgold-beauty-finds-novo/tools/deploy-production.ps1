param(
  [Parameter(Mandatory=$true)][ValidatePattern('^https://')][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$AdminToken,
  [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$ProductionBranch,
  [string]$ProjectName='blackgold-beauty-finds-novo',
  [switch]$Execute
)

$ErrorActionPreference='Stop'
$Root=Split-Path $PSScriptRoot -Parent
Push-Location $Root
try {
  node .\tools\release_preflight.mjs
  if($LASTEXITCODE -ne 0){throw 'Production release gate is blocked.'}

  $head=(git rev-parse HEAD).Trim()
  if(-not $head){throw 'Git HEAD unavailable.'}

  $adminTokenNormalized=$AdminToken.Trim()
  if($adminTokenNormalized.Length -lt 32 -or $adminTokenNormalized.Length -gt 512){
    throw 'AdminToken must contain between 32 and 512 non-whitespace characters.'
  }

  $wranglerPath=Join-Path $Root 'wrangler.toml'
  $wranglerRaw=Get-Content -LiteralPath $wranglerPath -Raw
  $baseMatch=[regex]::Match($wranglerRaw,'(?m)^\s*PUBLIC_BASE_URL\s*=\s*"([^"]+)"\s*$')
  if(-not $baseMatch.Success){throw 'PUBLIC_BASE_URL missing from wrangler.toml.'}

  $configuredBase=$baseMatch.Groups[1].Value.TrimEnd('/')
  $requestedBase=$BaseUrl.TrimEnd('/')
  if($requestedBase -ne $configuredBase){
    throw ("BaseUrl does not match PUBLIC_BASE_URL. Requested: "+$requestedBase+" Configured: "+$configuredBase)
  }

  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupRoot=Join-Path $Root 'backups'
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

  $env:BLACKGOLD_BASE=$configuredBase
  $env:BLACKGOLD_ADMIN_TOKEN=$adminTokenNormalized
  $env:BLACKGOLD_BACKUP_DIR=Join-Path $backupRoot ("predeploy-"+$stamp)

  node .\tools\catalog_backup.mjs
  if($LASTEXITCODE -ne 0){throw 'Mandatory pre-deploy disaster backup failed.'}

  if(-not $Execute){
    Write-Host 'BLACKGOLD_PRODUCTION_DEPLOY=READY_NOT_EXECUTED' -ForegroundColor Yellow
    Write-Host 'Use -Execute only after the final human approval is pinned to this exact commit.' -ForegroundColor Yellow
    return
  }

  & npx wrangler pages deploy . --project-name $ProjectName --branch $ProductionBranch --commit-hash $head --commit-message ("BlackGold approved production "+$head)
  if($LASTEXITCODE -ne 0){throw 'Cloudflare Pages production deployment failed.'}

  $health=$null
  for($i=0;$i -lt 20;$i++){
    try{
      $health=Invoke-RestMethod -Uri ($env:BLACKGOLD_BASE+'/api/health') -Method Get -TimeoutSec 8
      if($health){break}
    }catch{}
    Start-Sleep -Seconds 2
  }
  if(-not $health){throw 'Post-deploy health verification failed.'}

  $rootResponse=Invoke-WebRequest -Uri ($env:BLACKGOLD_BASE+'/') -Method Get -TimeoutSec 12 -UseBasicParsing
  $csp=[string]$rootResponse.Headers['Content-Security-Policy']
  if($csp -notmatch 'fonts\.googleapis\.com' -or $csp -notmatch 'fonts\.gstatic\.com'){
    throw 'Post-deploy CSP verification failed.'
  }

  $catalog=Invoke-RestMethod -Uri ($env:BLACKGOLD_BASE+'/api/products?deploy-check='+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Method Get -TimeoutSec 12
  if($null -eq $catalog.total){throw 'Post-deploy public catalog verification failed.'}

  $receipt=[ordered]@{
    contract='BLACKGOLD_PRODUCTION_DEPLOY_RECEIPT_V1'
    deployedAt=(Get-Date).ToUniversalTime().ToString('o')
    commit=$head
    project=$ProjectName
    productionBranch=$ProductionBranch
    baseUrl=$env:BLACKGOLD_BASE
    health='PASS'
    productionCsp='PASS'
    catalogTotal=[int]$catalog.total
    predeployBackup=$env:BLACKGOLD_BACKUP_DIR
  }
  $receiptPath=Join-Path $backupRoot ("deploy-receipt-"+$stamp+".json")
  $receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $receiptPath -Encoding UTF8

  Write-Host 'BLACKGOLD_PRODUCTION_DEPLOY=PASS' -ForegroundColor Green
  Write-Host ("Receipt: "+$receiptPath) -ForegroundColor Green
}
finally {
  Remove-Item Env:BLACKGOLD_ADMIN_TOKEN -ErrorAction SilentlyContinue
  Pop-Location
}
