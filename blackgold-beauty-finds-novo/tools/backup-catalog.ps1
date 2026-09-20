param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$AdminToken,
  [string]$OutputRoot = ".\\backups"
)
$ErrorActionPreference='Stop'
$env:BLACKGOLD_BASE=$BaseUrl.TrimEnd('/')
$env:BLACKGOLD_ADMIN_TOKEN=$AdminToken
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$dir=Join-Path $OutputRoot ("catalog-"+$stamp)
$env:BLACKGOLD_BACKUP_DIR=(Resolve-Path (New-Item -ItemType Directory -Force -Path $dir)).Path
node (Join-Path $PSScriptRoot 'catalog_backup.mjs')
if($LASTEXITCODE -ne 0){throw 'Catalog backup failed.'}
$zip=$env:BLACKGOLD_BACKUP_DIR+'.zip'
Compress-Archive -LiteralPath $env:BLACKGOLD_BACKUP_DIR -DestinationPath $zip -Force
Write-Output "BLACKGOLD_BACKUP_ZIP=$zip"
