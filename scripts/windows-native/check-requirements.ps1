param(
    [switch]$RequireIIS,
    [switch]$RequireAws
)

. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$results = [ordered]@{}
$failed = $false

Write-Step 'Comprobando requisitos para Windows Native SQL Server Edition'

try {
    $node = Assert-Command 'node.exe' 'Instala Node.js 22 LTS.'
    $nodeVersion = (& $node --version).Trim()
    $major = [int](($nodeVersion -replace '^v','').Split('.')[0])
    if ($major -lt 22) { throw "Se requiere Node.js 22 o superior. Detectado: $nodeVersion" }
    $results.node = @{ ok = $true; version = $nodeVersion; path = $node }
    Write-Ok "Node.js $nodeVersion"
} catch { $results.node = @{ ok = $false; error = $_.Exception.Message }; Write-Warn $_.Exception.Message; $failed = $true }

try {
    $npm = Assert-Command 'npm.cmd' 'npm se instala con Node.js.'
    $npmVersion = (& $npm --version).Trim()
    $results.npm = @{ ok = $true; version = $npmVersion; path = $npm }
    Write-Ok "npm $npmVersion"
} catch { $results.npm = @{ ok = $false; error = $_.Exception.Message }; Write-Warn $_.Exception.Message; $failed = $true }

$sqlcmd = Find-SqlCmd
if ($sqlcmd) {
    $sqlcmdVersion = (& $sqlcmd '-?' 2>&1 | Select-Object -First 1).ToString().Trim()
    $results.sqlcmd = @{ ok = $true; path = $sqlcmd; version = $sqlcmdVersion }
    Write-Ok "sqlcmd encontrado: $sqlcmd"
} else {
    $results.sqlcmd = @{ ok = $false; error = 'No se encontró sqlcmd.exe.' }
    Write-Warn 'No se encontró sqlcmd.exe. Instala Microsoft sqlcmd o las herramientas de línea de comandos de SQL Server.'
    $failed = $true
}

$sqlServices = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' }
if ($sqlServices) {
    $results.sqlServerServices = @($sqlServices | ForEach-Object { @{ name=$_.Name; status=$_.Status.ToString(); displayName=$_.DisplayName } })
    foreach ($service in $sqlServices) {
        if ($service.Status -eq 'Running') { Write-Ok "SQL Server activo: $($service.Name)" }
        else { Write-Warn "SQL Server detenido: $($service.Name)"; $failed = $true }
    }
} else {
    $results.sqlServerServices = @()
    Write-Warn 'No se detectó un servicio MSSQLSERVER o MSSQL$INSTANCIA.'
    $failed = $true
}

$python = Get-Command python.exe -ErrorAction SilentlyContinue
$isStoreAlias = $python -and $python.Source -like "$env:LOCALAPPDATA\Microsoft\WindowsApps\*"

if ($python -and -not $isStoreAlias) {
    try {
        $pyVersion = (& $python.Source --version 2>&1 | Out-String).Trim()
        $results.python = @{
            ok = $true
            version = $pyVersion
            path = $python.Source
        }
        Write-Ok $pyVersion
    } catch {
        $results.python = @{
            ok = $false
            warning = 'Python es opcional para algunos validadores.'
        }
        Write-Warn 'Python no está disponible; se omitirán validadores auxiliares.'
    }
} else {
    $results.python = @{
        ok = $false
        warning = 'Python es opcional para algunos validadores.'
    }
    Write-Warn 'Python no está instalado; se ignoró el acceso directo de Microsoft Store.'
}
$aws = Get-Command aws.exe -ErrorAction SilentlyContinue
if ($aws) {
    $awsVersion = (& $aws.Source --version 2>&1).Trim()
    $results.aws = @{ ok = $true; version = $awsVersion }
    Write-Ok $awsVersion
} else {
    $results.aws = @{ ok = $false; warning = 'AWS CLI es opcional en modo MOCK y recomendado para S3 real.' }
    if ($RequireAws) { $failed = $true }
    Write-Warn 'AWS CLI no está instalado.'
}

$iisFeature = Get-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole -ErrorAction SilentlyContinue
$iisEnabled = $iisFeature -and $iisFeature.State -eq 'Enabled'
$rewriteDll = Join-Path $env:windir 'System32\inetsrv\rewrite.dll'
$rewriteInstalled = Test-Path $rewriteDll
$results.iis = @{ enabled = $iisEnabled; urlRewrite = $rewriteInstalled }
if ($iisEnabled) { Write-Ok 'IIS está habilitado.' } else { Write-Warn 'IIS todavía no está habilitado.' }
if ($rewriteInstalled) { Write-Ok 'IIS URL Rewrite está instalado.' } else { Write-Warn 'IIS URL Rewrite todavía no está instalado.' }
if ($RequireIIS -and (-not $iisEnabled -or -not $rewriteInstalled)) { $failed = $true }

$envPath = Join-Path $root '.env'
$results.environment = @{ exists = Test-Path $envPath; path = $envPath }
if (Test-Path $envPath) { Write-Ok '.env existe.' } else { Write-Warn '.env todavía no existe; ejecuta configure-environment.ps1.' }

$results.timestamp = (Get-Date).ToString('o')
$results.decision = if ($failed) { 'FAIL-WINDOWS-SQLSERVER-REQUIREMENTS' } else { 'PASS-WINDOWS-SQLSERVER-REQUIREMENTS' }
$outDir = Join-Path $root 'release-evidence\windows-native'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir 'requirements.json'
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outFile -Encoding UTF8

Write-Host "`nResultado: $($results.decision)" -ForegroundColor $(if ($failed) { 'Red' } else { 'Green' })
Write-Host "Informe: $outFile"
if ($failed) { exit 1 }

