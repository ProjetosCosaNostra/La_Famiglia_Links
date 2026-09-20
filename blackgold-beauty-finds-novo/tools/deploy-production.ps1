param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$AdminToken
)
$ErrorActionPreference='Stop'
$Root=Split-Path $PSScriptRoot -Parent
Push-Location $Root
try {
  node .\tools\release_preflight.mjs
  if($LASTEXITCODE -ne 0){throw 'Production release gate is blocked.'}

  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupRoot=Join-Path $Root 'backups'
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $env:BLACKGOLD_BASE=$BaseUrl.TrimEnd('/')
  $env:BLACKGOLD_ADMIN_TOKEN=$AdminToken
  $env:BLACKGOLD_BACKUP_DIR=Join-Path $backupRoot ("predeploy-"+$stamp)

  node .\tools\catalog_backup.mjs
  if($LASTEXITCODE -ne 0){throw 'Mandatory pre-deploy disaster backup failed.'}

  throw 'DEPLOY INTENTIONALLY STOPPED: production command is not enabled until the human-approved release file is created and production Cloudflare bindings are configured.'
}
finally {
  Pop-Location
}
