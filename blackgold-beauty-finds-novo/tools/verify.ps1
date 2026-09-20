$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path $PSScriptRoot -Parent
$Reports = Join-Path $Root '.visual-gate'
New-Item -ItemType Directory -Force -Path $Reports | Out-Null

$ChromeCandidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$Chrome = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Chrome) { throw 'Chrome/Edge not found.' }

$Python = (Get-Command python -ErrorAction Stop).Source
$Port = 8799
$Server = Start-Process -FilePath $Python -ArgumentList @('-m','http.server',$Port,'--bind','127.0.0.1','--directory',$Root) -WindowStyle Hidden -PassThru
try {
  Start-Sleep -Milliseconds 800
  $DesktopShot = Join-Path $Reports 'candidate-desktop.png'
  $MobileShot = Join-Path $Reports 'candidate-mobile.png'
  $DesktopProfile = Join-Path $Reports 'chrome-desktop'
  $MobileProfile = Join-Path $Reports 'chrome-mobile'

  & $Chrome '--headless=new' '--disable-gpu' '--hide-scrollbars' '--no-first-run' "--user-data-dir=$DesktopProfile" '--window-size=1448,1086' '--force-device-scale-factor=1' "--screenshot=$DesktopShot" "http://127.0.0.1:$Port/" | Out-Null
  & $Chrome '--headless=new' '--disable-gpu' '--hide-scrollbars' '--no-first-run' "--user-data-dir=$MobileProfile" '--window-size=390,1152' '--force-device-scale-factor=1' "--screenshot=$MobileShot" "http://127.0.0.1:$Port/" | Out-Null

  if (!(Test-Path $DesktopShot) -or !(Test-Path $MobileShot)) { throw 'Screenshot capture failed.' }

  & $Python (Join-Path $PSScriptRoot 'visual_gate.py') --profile desktop --authority (Join-Path $Root 'authority-desktop-v26.webp') --candidate $DesktopShot --report (Join-Path $Reports 'desktop.json')
  if ($LASTEXITCODE -ne 0) { throw 'DESKTOP VISUAL GATE FAILED. Preview forbidden.' }

  & $Python (Join-Path $PSScriptRoot 'visual_gate.py') --profile mobile --authority (Join-Path $Root 'authority-mobile-v24.webp') --candidate $MobileShot --report (Join-Path $Reports 'mobile.json')
  if ($LASTEXITCODE -ne 0) { throw 'MOBILE VISUAL GATE FAILED. Preview forbidden.' }

  $Index = Get-Content (Join-Path $Root 'index.html') -Raw
  $Js = Get-Content (Join-Path $Root 'shell.js') -Raw
  foreach ($Forbidden in @('Miss Dior','Dior Saddle','R$ 649,90','193 produtos ativos')) {
    if ($Index.Contains($Forbidden) -or $Js.Contains($Forbidden)) {
      throw "ZERO-CATALOG GATE FAILED: legacy content found: $Forbidden"
    }
  }

  $Receipt = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    desktop = 'PASS'
    mobile = 'PASS'
    catalog = 'ZERO'
    previewAllowed = $true
    humanApproval = $false
    productionDeployAllowed = $false
  }
  $Receipt | ConvertTo-Json | Set-Content (Join-Path $Reports 'receipt.json') -Encoding UTF8
  Write-Output 'BLACKGOLD_AUTHORITY_GATE=PASS'
  Write-Output 'PREVIEW_ELIGIBLE_BUT_NOT_AUTO_OPENED'
}
finally {
  if ($Server -and !$Server.HasExited) { Stop-Process -Id $Server.Id -Force -ErrorAction SilentlyContinue }
}
