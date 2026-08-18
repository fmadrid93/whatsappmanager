param(
    [switch]$SkipInstall,
    [switch]$DevelopmentFrontend
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
if (-not $SkipInstall) { & (Join-Path $PSScriptRoot 'install-dependencies.ps1') }

Write-Step 'Compilando backend'
Push-Location (Join-Path $root 'backend')
try {
    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript backend no pasó la validación.' }
    & npm.cmd run test
    if ($LASTEXITCODE -ne 0) { throw 'Las pruebas backend fallaron.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'La compilación backend falló.' }
} finally { Pop-Location }

Write-Step 'Compilando frontend Angular'
Push-Location (Join-Path $root 'frontend')
try {
    if ($DevelopmentFrontend) { & npm.cmd run check } else { & npm.cmd run build }
    if ($LASTEXITCODE -ne 0) { throw 'La compilación frontend falló.' }
    & npm.cmd run test
    if ($LASTEXITCODE -ne 0) { throw 'Las pruebas contractuales del frontend fallaron.' }
} finally { Pop-Location }
Write-Ok 'Backend y frontend compilados.'
