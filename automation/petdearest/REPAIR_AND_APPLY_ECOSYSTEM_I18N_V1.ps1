param(
    [string]$ProjectRoot = "E:\PetDearest"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Target = Join-Path -Path $ProjectRoot -ChildPath "05_automation\autopilot\APPLY_ECOSYSTEM_I18N_V1.ps1"
$BackupDir = Join-Path -Path $ProjectRoot -ChildPath "08_backups\receipts"
$IncidentDir = Join-Path -Path $ProjectRoot -ChildPath "00_governance\incidents\ECOSYSTEM_I18N_AUTOPILOT_PARSE"
$RegressionDir = Join-Path -Path $ProjectRoot -ChildPath "04_tests\regression"
$ReportDir = Join-Path -Path $ProjectRoot -ChildPath "06_observability\reports"

foreach ($Dir in @($BackupDir, $IncidentDir, $RegressionDir, $ReportDir)) {
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $Target)) {
    throw "TARGET_NOT_FOUND: $Target"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " PETDEAREST - REPAIR ECOSYSTEM/I18N AUTOPILOT" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$Backup = Join-Path -Path $BackupDir -ChildPath "APPLY_ECOSYSTEM_I18N_V1_before_parse_repair_$Stamp.ps1"
Copy-Item -LiteralPath $Target -Destination $Backup -Force
Write-Host "[BACKUP] $Backup" -ForegroundColor DarkGreen

$Lines = @(Get-Content -LiteralPath $Target -Encoding UTF8)
$Start = -1
$End = -1

for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Start -lt 0 -and $Lines[$i].Trim() -eq 'if (Test-Path -LiteralPath $Manifest) {') {
        $Start = $i
        continue
    }
    if ($Start -ge 0 -and $Lines[$i].Trim() -eq '$Compliance = @''') {
        $End = $i
        break
    }
}

if ($Start -lt 0) {
    throw "MANIFEST_BLOCK_START_NOT_FOUND"
}
if ($End -lt 0 -or $End -le $Start) {
    throw "MANIFEST_BLOCK_END_NOT_FOUND"
}

$Replacement = @(
    'if (Test-Path -LiteralPath $Manifest) {',
    '    [xml]$ManifestXml = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8',
    '    $AndroidNs = "http://schemas.android.com/apk/res/android"',
    '    $PermissionExists = @($ManifestXml.manifest.''uses-permission'' | Where-Object {',
    '        $_.GetAttribute("name", $AndroidNs) -eq "android.permission.INTERNET"',
    '    }).Count -gt 0',
    '',
    '    if (-not $PermissionExists) {',
    '        $PermissionNode = $ManifestXml.CreateElement("uses-permission")',
    '        $NameAttribute = $ManifestXml.CreateAttribute("android", "name", $AndroidNs)',
    '        $NameAttribute.Value = "android.permission.INTERNET"',
    '        [void]$PermissionNode.Attributes.Append($NameAttribute)',
    '        [void]$ManifestXml.DocumentElement.PrependChild($PermissionNode)',
    '        $ManifestXml.Save($Manifest)',
    '    }',
    '}',
    ''
)

$NewLines = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $Start; $i++) {
    $NewLines.Add($Lines[$i])
}
foreach ($Line in $Replacement) {
    $NewLines.Add($Line)
}
for ($i = $End; $i -lt $Lines.Count; $i++) {
    $NewLines.Add($Lines[$i])
}

[System.IO.File]::WriteAllLines(
    $Target,
    $NewLines,
    [System.Text.UTF8Encoding]::new($false)
)

$Tokens = $null
$ParseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    $Target,
    [ref]$Tokens,
    [ref]$ParseErrors
) | Out-Null

if ($ParseErrors.Count -gt 0) {
    Copy-Item -LiteralPath $Backup -Destination $Target -Force
    $Messages = $ParseErrors | ForEach-Object { $_.Message }
    throw "REPAIRED_AUTOPILOT_PARSE_FAIL: $($Messages -join ' | ')"
}

Write-Host "[PASS] autopilot reparado passa no parser" -ForegroundColor Green

$RegressionPath = Join-Path -Path $RegressionDir -ChildPath "TEST_ECOSYSTEM_I18N_AUTOPILOT_PARSE.ps1"
$Regression = @'
param([string]$ProjectRoot = "E:\PetDearest")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Target = Join-Path -Path $ProjectRoot -ChildPath "05_automation\autopilot\APPLY_ECOSYSTEM_I18N_V1.ps1"
if (-not (Test-Path -LiteralPath $Target)) {
    throw "AUTOPILOT_NOT_FOUND: $Target"
}

$Tokens = $null
$Errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    $Target,
    [ref]$Tokens,
    [ref]$Errors
) | Out-Null

if ($Errors.Count -gt 0) {
    $Errors | ForEach-Object { Write-Host $_.Message -ForegroundColor Red }
    throw "ECOSYSTEM_I18N_AUTOPILOT_PARSE_REGRESSION"
}

$Content = Get-Content -LiteralPath $Target -Raw -Encoding UTF8
if ($Content -match 'android:name=\\"android\.permission\.INTERNET\\"') {
    throw "LEGACY_XML_QUOTE_PATTERN_RETURNED"
}

Write-Host "ECOSYSTEM/I18N AUTOPILOT PARSE REGRESSION: PASS" -ForegroundColor Green
exit 0
'@
[System.IO.File]::WriteAllText(
    $RegressionPath,
    $Regression,
    [System.Text.UTF8Encoding]::new($false)
)

$IncidentPath = Join-Path -Path $IncidentDir -ChildPath "INCIDENT_$Stamp.md"
$Incident = @"
# INCIDENTE - ECOSYSTEM_I18N_AUTOPILOT_PARSE

Data: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## Sintoma
O preflight do PowerShell bloqueou APPLY_ECOSYSTEM_I18N_V1.ps1 antes da execucao.

## Causa raiz
O AndroidManifest estava sendo alterado por interpolacao textual contendo aspas XML dentro de uma string PowerShell. Backslash nao e escape de aspas em PowerShell, portanto o parser encerrava a string antes de android.permission.INTERNET.

## Correcao arquitetural
A manipulacao textual do XML foi removida. O AndroidManifest agora e alterado como documento XML, criando o elemento uses-permission e o atributo Android namespace de forma estruturada.

## Prevencao permanente
- parser obrigatorio antes de executar autopilots;
- teste de regressao TEST_ECOSYSTEM_I18N_AUTOPILOT_PARSE.ps1;
- padrao legado de aspas XML proibido;
- backup automatico antes de reparar;
- restauracao automatica do backup se o reparo nao passar no parser.

## Evidencia
Backup: $Backup
Autopilot reparado: $Target
Teste: $RegressionPath
"@
[System.IO.File]::WriteAllText(
    $IncidentPath,
    $Incident,
    [System.Text.UTF8Encoding]::new($false)
)

& $RegressionPath -ProjectRoot $ProjectRoot
if ($LASTEXITCODE -ne 0) {
    throw "REGRESSION_TEST_FAILED: $LASTEXITCODE"
}

$ReportPath = Join-Path -Path $ReportDir -ChildPath "ECOSYSTEM_I18N_PARSE_REPAIR_$Stamp.json"
$Report = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    incident = "ECOSYSTEM_I18N_AUTOPILOT_PARSE"
    root_cause = "XML_QUOTING_IN_POWERSHELL_STRING"
    repair = "XML_DOM_MANIPULATION"
    parser = "PASS"
    regression = "PASS"
    backup = $Backup
    target = $Target
}
$Report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "[PASS] causa raiz corrigida e regressao instalada" -ForegroundColor Green
Write-Host "[REPORT] $ReportPath" -ForegroundColor DarkGreen
Write-Host ""
Write-Host "Executando o autopilot Ecosystem + I18N reparado..." -ForegroundColor Cyan

$PowerShellExe = (Get-Process -Id $PID).Path
& $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $Target -ProjectRoot $ProjectRoot
$ApplyExit = $LASTEXITCODE

if ($ApplyExit -ne 0) {
    throw "ECOSYSTEM_I18N_APPLY_FAILED: ExitCode=$ApplyExit"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " PETDEAREST - REPAIR + APPLY CONCLUIDO" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Parser:          PASS"
Write-Host "Regression:      PASS"
Write-Host "Manifest XML:    STRUCTURED"
Write-Host "Autopilot apply: PASS"
Write-Host "Bloqueadores:    0"
