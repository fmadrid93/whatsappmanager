param(
    [int]$IisPort = 80,
    [switch]$SkipDatabaseCreation,
    [switch]$ForceIis,
    [switch]$StartServices
)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = Get-ProjectRoot
& (Join-Path $PSScriptRoot 'check-requirements.ps1') -RequireIIS -RequireAws
if ($LASTEXITCODE -ne 0) { throw 'El servidor no cumple los requisitos.' }
if (-not (Test-Path (Join-Path $root '.env'))) { throw 'Configura .env antes de desplegar.' }
& (Join-Path $PSScriptRoot 'install-dependencies.ps1')
if (-not $SkipDatabaseCreation) { & (Join-Path $PSScriptRoot 'create-database.ps1') }
& (Join-Path $PSScriptRoot 'migrate-database.ps1')
& (Join-Path $PSScriptRoot 'build-application.ps1') -SkipInstall
& (Join-Path $PSScriptRoot 'configure-iis.ps1') -Port $IisPort -Force:$ForceIis
& (Join-Path $PSScriptRoot 'install-windows-services.ps1') -StartServices:$StartServices
Write-Ok 'Despliegue nativo en Windows Server completado.'
