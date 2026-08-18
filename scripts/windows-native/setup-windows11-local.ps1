param(
    [ValidateSet('Mock','Real')][string]$Mode = 'Mock',
    [string]$SqlServerHost = 'localhost',
    [string]$SqlServerInstance = '',
    [int]$SqlServerPort = 1433,
    [switch]$SkipBuild,
    [switch]$StartAfterSetup
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
Write-Step 'Validando requisitos'
& (Join-Path $PSScriptRoot 'check-requirements.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Faltan requisitos.' }
if (-not (Test-Path (Join-Path $root '.env'))) {
    & (Join-Path $PSScriptRoot 'configure-environment.ps1') `
        -Mode $Mode `
        -SqlServerHost $SqlServerHost `
        -SqlServerInstance $SqlServerInstance `
        -SqlServerPort $SqlServerPort
}
& (Join-Path $PSScriptRoot 'install-dependencies.ps1')
& (Join-Path $PSScriptRoot 'create-database.ps1') -AdminAuthentication Windows
& (Join-Path $PSScriptRoot 'migrate-database.ps1')
if (-not $SkipBuild) { & (Join-Path $PSScriptRoot 'build-application.ps1') -SkipInstall }
if ($StartAfterSetup) { & (Join-Path $PSScriptRoot 'start-development.ps1') -SkipMigration }
Write-Ok 'Preparación local SQL Server completada.'
