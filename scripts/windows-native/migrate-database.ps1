param(
    [switch]$SkipSeed,
    [switch]$RegenerateBaseline
)

. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'
Import-DotEnv $envPath | Out-Null
$backend = Join-Path $root 'backend'
if (-not (Test-Path (Join-Path $backend 'node_modules'))) { throw 'Faltan dependencias del backend. Ejecuta install-dependencies.ps1.' }
if ($env:PRISMA_PROVIDER -ne 'sqlserver') { throw "PRISMA_PROVIDER debe ser sqlserver. Actual: $env:PRISMA_PROVIDER" }

& (Join-Path $PSScriptRoot 'generate-sqlserver-baseline.ps1') -Force:$RegenerateBaseline

Push-Location $backend
try {
    Write-Step 'Seleccionando proveedor Prisma'
    & npm.cmd run prisma:select
    if ($LASTEXITCODE -ne 0) { throw 'Falló prisma:select.' }

    Write-Step 'Generando Prisma Client'
    & npm.cmd run prisma:generate
    if ($LASTEXITCODE -ne 0) { throw 'Falló prisma:generate.' }

    Write-Step 'Aplicando migraciones SQL Server'
    & npm.cmd run prisma:migrate:deploy
    if ($LASTEXITCODE -ne 0) { throw 'Falló prisma migrate deploy.' }

    if (-not $SkipSeed) {
        Write-Step 'Creando/verificando usuario administrador inicial'
        & npm.cmd run seed
        if ($LASTEXITCODE -ne 0) { throw 'Falló el seed inicial.' }
    }
} finally { Pop-Location }
Write-Ok 'Migraciones SQL Server y seed completados.'
