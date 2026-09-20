$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path $PSScriptRoot -Parent
$Reports = Join-Path $Root '.visual-gate'
New-Item -ItemType Directory -Force -Path $Reports | Out-Null

$Python = (Get-Command python -ErrorAction Stop).Source
$Node = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path (Join-Path $Root 'node_modules\puppeteer-core'))) {
  Push-Location $Root
  try {
    & npm.cmd install --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  }
  finally { Pop-Location }
}

$Port = 8799
$Server = Start-Process -FilePath $Python -ArgumentList @('-m','http.server',$Port,'--bind','127.0.0.1','--directory',$Root) -WindowStyle Hidden -PassThru
try {
  $Ready = $false
  for($i=0;$i -lt 30;$i++){
    Start-Sleep -Milliseconds 250
    try{
      $probe = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/" -TimeoutSec 2
      if($probe.StatusCode -eq 200){$Ready=$true;break}
    }catch{}
  }
  if(-not $Ready){throw 'Static verification server failed to start.'}

  & $Node (Join-Path $PSScriptRoot 'capture_visual.mjs') --base "http://127.0.0.1:$Port/" --out $Reports --prefix candidate
  if($LASTEXITCODE -ne 0){throw 'Explicit viewport capture failed.'}

  $DesktopShot = Join-Path $Reports 'candidate-desktop.png'
  $MobileShot = Join-Path $Reports 'candidate-mobile.png'
  if (!(Test-Path $DesktopShot) -or !(Test-Path $MobileShot)) { throw 'Screenshot capture failed.' }

  & $Python (Join-Path $PSScriptRoot 'outside_catalog_gate.py') --profile desktop --authority (Join-Path $Root 'assets\authority-desktop-approved.png') --candidate $DesktopShot --report (Join-Path $Reports 'desktop.json')
  if ($LASTEXITCODE -ne 0) { throw 'DESKTOP APPROVED-SHELL GATE FAILED. Preview forbidden.' }

  & $Python (Join-Path $PSScriptRoot 'outside_catalog_gate.py') --profile mobile --authority (Join-Path $Root 'assets\authority-mobile-v24.webp') --candidate $MobileShot --report (Join-Path $Reports 'mobile.json')
  if ($LASTEXITCODE -ne 0) { throw 'MOBILE APPROVED-SHELL GATE FAILED. Preview forbidden.' }

  $Index = Get-Content (Join-Path $Root 'index.html') -Raw
  $Js = Get-Content (Join-Path $Root 'app.js') -Raw
  foreach ($Forbidden in @('Miss Dior','Dior Saddle','R$ 649,90','193 produtos ativos')) {
    if ($Index.Contains($Forbidden) -or $Js.Contains($Forbidden)) {
      throw "ZERO-CATALOG GATE FAILED: legacy content found: $Forbidden"
    }
  }

  foreach($Obsolete in @('authority-desktop-v26.webp','authority-mobile-v24.webp','shell.css','shell.js')){
    if(Test-Path (Join-Path $Root $Obsolete)){
      throw "CANONICAL LOCK FAILED: obsolete file still present: $Obsolete"
    }
  }

  $Manifest = Get-Content (Join-Path $Root 'assets\authority-zero-manifest.json') -Raw | ConvertFrom-Json
  if($Manifest.contract -ne 'BLACKGOLD_APPROVED_AUTHORITY_DYNAMIC_CATALOG_V3'){throw 'Unexpected authority contract.'}
  if(($Manifest.desktop.viewport -join 'x') -ne '1448x1086'){throw 'Desktop authority viewport mismatch.'}
  if(($Manifest.mobile.viewport -join 'x') -ne '390x1152'){throw 'Mobile authority viewport mismatch.'}
  foreach($Profile in @('desktop','mobile')){
    $Entry = $Manifest.$Profile
    $AuthorityPath = Join-Path (Join-Path $Root 'assets') $Entry.approvedFile
    if(!(Test-Path $AuthorityPath)){throw "Missing approved authority: $AuthorityPath"}
    $ActualHash = (Get-FileHash -Algorithm SHA256 $AuthorityPath).Hash.ToLowerInvariant()
    if($ActualHash -ne ([string]$Entry.approvedSha256).ToLowerInvariant()){
      throw "Approved authority hash mismatch for $Profile."
    }
  }
  if($Manifest.catalogInitialCount -ne 0){throw 'Authority manifest must keep catalogInitialCount=0.'}
  if($Manifest.previewAutoOpenAllowed -ne $false){throw 'Authority manifest must keep previewAutoOpenAllowed=false.'}
  if($Manifest.productionDeployAllowed -ne $false){throw 'Authority manifest must keep productionDeployAllowed=false.'}

  $Receipt = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    desktopApprovedShell = 'PASS'
    mobileApprovedShell = 'PASS'
    authorityHashes = 'PASS'
    catalog = 'ZERO'
    canonical = 'PASS'
    explicitViewportCapture = 'PASS'
    previewAutoOpenAllowed = $false
    humanApproval = $false
    productionDeployAllowed = $false
  }
  $Receipt | ConvertTo-Json | Set-Content (Join-Path $Reports 'receipt.json') -Encoding UTF8
  Write-Output 'BLACKGOLD_CANONICAL_AUTHORITY_GATE=PASS'
  Write-Output 'PREVIEW_NOT_OPENED'
}
finally {
  if ($Server -and !$Server.HasExited) { Stop-Process -Id $Server.Id -Force -ErrorAction SilentlyContinue }
}
