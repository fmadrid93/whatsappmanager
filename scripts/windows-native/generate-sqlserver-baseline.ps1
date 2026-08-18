param(
    [switch]$Force
)

. (Join-Path $PSScriptRoot 'Common.ps1')

$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'

Import-DotEnv $envPath | Out-Null

$backend = Join-Path $root 'backend'
$migrationsRoot = Join-Path $backend 'prisma\migrations'
$baselineDir = Join-Path $migrationsRoot '20260726000000_sqlserver_baseline'
$migrationFile = Join-Path $baselineDir 'migration.sql'
$stderrFile = $null

if ((Test-Path $migrationFile) -and -not $Force) {
    Write-Ok "La migración baseline ya existe: $migrationFile"
    return
}

if (-not (Test-Path (Join-Path $backend 'node_modules'))) {
    throw 'Faltan dependencias del backend. Ejecuta install-dependencies.ps1.'
}

New-Item `
    -ItemType Directory `
    -Force `
    -Path $baselineDir |
    Out-Null

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

[IO.File]::WriteAllText(
    (Join-Path $migrationsRoot 'migration_lock.toml'),
    'provider = "mssql"' + [Environment]::NewLine,
    $utf8WithoutBom
)

Push-Location $backend

try {
    Write-Step 'Seleccionando proveedor Prisma SQL Server'

    & npm.cmd run prisma:select

    if ($LASTEXITCODE -ne 0) {
        throw 'Falló prisma:select.'
    }

    Write-Step 'Generando baseline SQL Server desde el esquema Prisma'

    $stderrFile = Join-Path `
        ([IO.Path]::GetTempPath()) `
        ("prisma-diff-" + [Guid]::NewGuid().ToString("N") + ".log")

    $previousErrorActionPreference = $ErrorActionPreference

    try {
        # Prisma puede escribir avisos en stderr aunque finalice correctamente.
        $ErrorActionPreference = 'Continue'

        $output = @(
            & npx.cmd prisma migrate diff `
                --from-empty `
                --to-schema-datamodel prisma/schema.prisma `
                --script `
                2> $stderrFile
        )

        $prismaExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    $stderrText = ''

    if (Test-Path $stderrFile) {
        $stderrText = (
            Get-Content `
                -LiteralPath $stderrFile `
                -Raw `
                -ErrorAction SilentlyContinue
        ).Trim()
    }

    if ($prismaExitCode -ne 0) {
        Remove-Item `
            $baselineDir `
            -Recurse `
            -Force `
            -ErrorAction SilentlyContinue

        $details = @(
            $output
            $stderrText
        ) |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

        throw "Falló prisma migrate diff:`n$($details -join [Environment]::NewLine)"
    }

    if ($stderrText) {
        $stderrText -split "`r?`n" |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            ForEach-Object {
                Write-Warn $_
            }
    }

    $sql = ($output -join [Environment]::NewLine).Trim()

    if (
        [string]::IsNullOrWhiteSpace($sql) -or
        $sql -notmatch '(?i)CREATE\s+TABLE'
    ) {
        Remove-Item `
            $baselineDir `
            -Recurse `
            -Force `
            -ErrorAction SilentlyContinue

        throw 'Prisma no generó una migración SQL Server válida.'
    }

    [IO.File]::WriteAllText(
        $migrationFile,
        $sql + [Environment]::NewLine,
        $utf8WithoutBom
    )
}
finally {
    if ($stderrFile) {
        Remove-Item `
            $stderrFile `
            -Force `
            -ErrorAction SilentlyContinue
    }

    Pop-Location
}

Write-Ok "Baseline SQL Server generado: $migrationFile"

