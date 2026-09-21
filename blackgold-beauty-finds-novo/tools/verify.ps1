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
  if($Manifest.contract -ne 'BLACKGOLD_APPROVED_AUTHORITY_DYNAMIC_CATALOG_V3'){throw 'Authority manifest contract drift.'}
  if($Manifest.toleranceOutsideDynamicRegionsPixels -ne 0){throw 'Outside dynamic-region tolerance must remain zero.'}
  if($Manifest.desktop.approvedFile -ne 'authority-desktop-approved.png'){throw 'Desktop approved authority drift.'}
  if($Manifest.mobile.approvedFile -ne 'authority-mobile-v24.webp'){throw 'Mobile approved authority drift.'}
  if($Manifest.desktop.viewport[0] -ne 1448 -or $Manifest.desktop.viewport[1] -ne 1086){throw 'Desktop authority viewport drift.'}
  if($Manifest.mobile.viewport[0] -ne 390 -or $Manifest.mobile.viewport[1] -ne 1152){throw 'Mobile authority viewport drift.'}

  $DesktopAuthority = Join-Path $Root 'assets\authority-desktop-approved.png'
  $MobileAuthority = Join-Path $Root 'assets\authority-mobile-v24.webp'
  $DesktopHash = (Get-FileHash -Algorithm SHA256 $DesktopAuthority).Hash.ToLowerInvariant()
  $MobileHash = (Get-FileHash -Algorithm SHA256 $MobileAuthority).Hash.ToLowerInvariant()
  if($DesktopHash -ne '5e3e6cef8f0f5e14bde52b5c9f0be9ae9c1d92fd771f3e424b9cf75fbb59f722'){throw 'Desktop approved authority hash mismatch.'}
  if($MobileHash -ne '8c817a1bcf7641fddbf1a083ae9c1bf195186e65cf48d5cdb86ed64452de2a26'){throw 'Mobile approved authority hash mismatch.'}
  if($DesktopHash -ne $Manifest.desktop.approvedSha256){throw 'Desktop manifest hash mismatch.'}
  if($MobileHash -ne $Manifest.mobile.approvedSha256){throw 'Mobile manifest hash mismatch.'}

  if($Manifest.catalogInitialCount -ne 0){throw 'Authority manifest must keep catalogInitialCount=0.'}
  if($Manifest.previewAutoOpenAllowed -ne $false){throw 'Authority manifest must keep previewAutoOpenAllowed=false.'}
  if($Manifest.productionDeployAllowed -ne $false){throw 'Authority manifest must keep productionDeployAllowed=false.'}

  $Receipt = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    desktop = 'PASS'
    mobile = 'PASS'
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
