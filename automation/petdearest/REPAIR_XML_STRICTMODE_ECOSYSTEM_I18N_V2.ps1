param(
    [string]$ProjectRoot = "E:\PetDearest"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Target = Join-Path -Path $ProjectRoot -ChildPath "05_automation\autopilot\APPLY_ECOSYSTEM_I18N_V1.ps1"
$BackupDir = Join-Path -Path $ProjectRoot -ChildPath "08_backups\receipts"
$IncidentDir = Join-Path -Path $ProjectRoot -ChildPath "00_governance\incidents\XML_DYNAMIC_PROPERTY_STRICTMODE"
$RegressionDir = Join-Path -Path $ProjectRoot -ChildPath "04_tests\regression"
$ReportDir = Join-Path -Path $ProjectRoot -ChildPath "06_observability\reports"
$ContractDir = Join-Path -Path $ProjectRoot -ChildPath "00_governance\contracts"

foreach ($Dir in @($BackupDir,$IncidentDir,$RegressionDir,$ReportDir,$ContractDir)) {
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $Target)) {
    throw "TARGET_NOT_FOUND: $Target"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " PETDEAREST - XML STRICTMODE REPAIR V2" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$PreSnapshot = Join-Path -Path $ProjectRoot -ChildPath "05_automation\recovery\CREATE_SNAPSHOT.ps1"
if (Test-Path -LiteralPath $PreSnapshot) {
    & $PreSnapshot -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        throw "PRE_REPAIR_SNAPSHOT_FAILED: $LASTEXITCODE"
    }
}

$Backup = Join-Path -Path $BackupDir -ChildPath "APPLY_ECOSYSTEM_I18N_V1_before_xml_strictmode_v2_$Stamp.ps1"
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

if ($Start -lt 0) { throw "MANIFEST_BLOCK_START_NOT_FOUND" }
if ($End -lt 0 -or $End -le $Start) { throw "MANIFEST_BLOCK_END_NOT_FOUND" }

$Replacement = @(
    'if (Test-Path -LiteralPath $Manifest) {',
    '    [xml]$ManifestXml = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8',
    '    $AndroidNs = "http://schemas.android.com/apk/res/android"',
    '    $PermissionNodes = @(',
    '        $ManifestXml.DocumentElement.ChildNodes | Where-Object {',
    '            $_ -is [System.Xml.XmlElement] -and',
    '            $_.LocalName -eq "uses-permission" -and',
    '            $_.GetAttribute("name", $AndroidNs) -eq "android.permission.INTERNET"',
    '        }',
    '    )',
    '',
    '    if ($PermissionNodes.Count -eq 0) {',
    '        $PermissionNode = $ManifestXml.CreateElement("uses-permission")',
    '        $NameAttribute = $ManifestXml.CreateAttribute("android", "name", $AndroidNs)',
    '        $NameAttribute.Value = "android.permission.INTERNET"',
    '        [void]$PermissionNode.Attributes.Append($NameAttribute)',
    '        [void]$ManifestXml.DocumentElement.PrependChild($PermissionNode)',
    '        $ManifestXml.Save($Manifest)',
    '    }',
    '    elseif ($PermissionNodes.Count -gt 1) {',
    '        throw "ANDROID_MANIFEST_DUPLICATE_INTERNET_PERMISSION"',
    '    }',
    '}',
    ''
)

$NewLines = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $Start; $i++) { $NewLines.Add($Lines[$i]) }
foreach ($Line in $Replacement) { $NewLines.Add($Line) }
for ($i = $End; $i -lt $Lines.Count; $i++) { $NewLines.Add($Lines[$i]) }

[System.IO.File]::WriteAllLines($Target,$NewLines,[System.Text.UTF8Encoding]::new($false))

$Tokens = $null
$ParseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($Target,[ref]$Tokens,[ref]$ParseErrors) | Out-Null
if ($ParseErrors.Count -gt 0) {
    Copy-Item -LiteralPath $Backup -Destination $Target -Force
    $Messages = $ParseErrors | ForEach-Object { $_.Message }
    throw "REPAIRED_AUTOPILOT_PARSE_FAIL: $($Messages -join ' | ')"
}
Write-Host "[PASS] parser do autopilot" -ForegroundColor Green

$RegressionPath = Join-Path -Path $RegressionDir -ChildPath "TEST_ANDROID_MANIFEST_XML_MUTATION.ps1"
$Regression = @'
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$AndroidNs = "http://schemas.android.com/apk/res/android"

function Get-InternetPermissionNodes {
    param([xml]$Xml)
    return @(
        $Xml.DocumentElement.ChildNodes | Where-Object {
            $_ -is [System.Xml.XmlElement] -and
            $_.LocalName -eq "uses-permission" -and
            $_.GetAttribute("name", $AndroidNs) -eq "android.permission.INTERNET"
        }
    )
}

function Ensure-InternetPermission {
    param([xml]$Xml)
    $Nodes = @(Get-InternetPermissionNodes -Xml $Xml)
    if ($Nodes.Count -eq 0) {
        $Node = $Xml.CreateElement("uses-permission")
        $Attr = $Xml.CreateAttribute("android", "name", $AndroidNs)
        $Attr.Value = "android.permission.INTERNET"
        [void]$Node.Attributes.Append($Attr)
        [void]$Xml.DocumentElement.PrependChild($Node)
    }
    elseif ($Nodes.Count -gt 1) {
        throw "DUPLICATE_INTERNET_PERMISSION"
    }
}

[xml]$Without = '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>'
if (@(Get-InternetPermissionNodes -Xml $Without).Count -ne 0) { throw "EMPTY_CASE_DETECTION_FAILED" }
Ensure-InternetPermission -Xml $Without
if (@(Get-InternetPermissionNodes -Xml $Without).Count -ne 1) { throw "INSERT_CASE_FAILED" }
Ensure-InternetPermission -Xml $Without
if (@(Get-InternetPermissionNodes -Xml $Without).Count -ne 1) { throw "IDEMPOTENCE_FAILED" }

[xml]$Existing = '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET"/><application /></manifest>'
if (@(Get-InternetPermissionNodes -Xml $Existing).Count -ne 1) { throw "EXISTING_CASE_DETECTION_FAILED" }
Ensure-InternetPermission -Xml $Existing
if (@(Get-InternetPermissionNodes -Xml $Existing).Count -ne 1) { throw "EXISTING_CASE_IDEMPOTENCE_FAILED" }

Write-Host "ANDROID MANIFEST XML MUTATION REGRESSION: PASS" -ForegroundColor Green
exit 0
'@
[System.IO.File]::WriteAllText($RegressionPath,$Regression,[System.Text.UTF8Encoding]::new($false))

$PolicyPath = Join-Path -Path $ContractDir -ChildPath "STRUCTURED_FILE_MUTATION_POLICY.md"
$Policy = @'
# STRUCTURED FILE MUTATION POLICY

Status: ACTIVE

For XML, JSON, YAML, manifests and other structured files:
- prefer a real parser / DOM over text concatenation;
- do not use dynamic XML property traversal for optional nodes under PowerShell StrictMode;
- query XML through ChildNodes, SelectNodes or an explicit namespace-aware API;
- every structured mutation must have an idempotence regression test;
- parser/preflight must run before applying the mutation to the product.
'@
[System.IO.File]::WriteAllText($PolicyPath,$Policy,[System.Text.UTF8Encoding]::new($false))

$IncidentPath = Join-Path -Path $IncidentDir -ChildPath "INCIDENT_$Stamp.md"
$Incident = @"
# INCIDENTE - XML_DYNAMIC_PROPERTY_STRICTMODE

Data: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## Sintoma
PowerShell falhou ao consultar uses-permission no AndroidManifest com:
The property 'uses-permission' cannot be found on this object.

## Causa raiz
O reparo anterior removeu a concatenacao textual, mas consultava um no XML opcional usando acesso dinamico de propriedade: ManifestXml.manifest.'uses-permission'. Com Set-StrictMode, um elemento ausente deixa de ser tratado como vazio e vira excecao.

## Correcao arquitetural
A consulta agora percorre DocumentElement.ChildNodes e filtra elementos XML pelo LocalName e pelo atributo Android namespace-aware.

## Prevencao permanente
- acesso dinamico a no XML opcional proibido sob StrictMode;
- TEST_ANDROID_MANIFEST_XML_MUTATION.ps1 testa ausencia, insercao, existencia e idempotencia;
- STRUCTURED_FILE_MUTATION_POLICY.md formaliza o padrao;
- snapshot e backup anteriores ao reparo;
- parser obrigatorio antes da execucao.

## Evidencia
Backup: $Backup
Teste: $RegressionPath
Politica: $PolicyPath
"@
[System.IO.File]::WriteAllText($IncidentPath,$Incident,[System.Text.UTF8Encoding]::new($false))

& $RegressionPath
if ($LASTEXITCODE -ne 0) { throw "MANIFEST_XML_REGRESSION_FAILED: $LASTEXITCODE" }

$ReportPath = Join-Path -Path $ReportDir -ChildPath "XML_STRICTMODE_REPAIR_V2_$Stamp.json"
$Report = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    incident = "XML_DYNAMIC_PROPERTY_STRICTMODE"
    root_cause = "OPTIONAL_XML_NODE_DYNAMIC_PROPERTY_UNDER_STRICTMODE"
    repair = "DOCUMENT_ELEMENT_CHILDNODES_NAMESPACE_AWARE"
    parser = "PASS"
    regression = "PASS"
    pre_snapshot = (Test-Path -LiteralPath $PreSnapshot)
    backup = $Backup
    target = $Target
}
$Report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host "[PASS] causa raiz corrigida e regressao instalada" -ForegroundColor Green
Write-Host "[REPORT] $ReportPath" -ForegroundColor DarkGreen
Write-Host ""
Write-Host "Executando Ecosystem + I18N novamente..." -ForegroundColor Cyan

$PowerShellExe = (Get-Process -Id $PID).Path
& $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $Target -ProjectRoot $ProjectRoot
$ApplyExit = $LASTEXITCODE

if ($ApplyExit -ne 0) {
    $FailurePath = Join-Path -Path $ReportDir -ChildPath "ECOSYSTEM_I18N_V2_APPLY_FAILURE_$Stamp.json"
    [ordered]@{
        timestamp = (Get-Date).ToString("o")
        status = "FAIL"
        exit_code = $ApplyExit
        checkpoint = "PRE_REPAIR_SNAPSHOT_AVAILABLE"
        target = $Target
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $FailurePath -Encoding UTF8
    throw "ECOSYSTEM_I18N_APPLY_FAILED: ExitCode=$ApplyExit"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " PETDEAREST - XML STRICTMODE REPAIR V2 CONCLUIDO" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Parser:          PASS"
Write-Host "XML regression:  PASS"
Write-Host "XML strategy:    CHILDNODES + NAMESPACE"
Write-Host "Autopilot apply: PASS"
Write-Host "Bloqueadores:    0"
