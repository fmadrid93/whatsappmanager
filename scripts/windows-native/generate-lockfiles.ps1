param([switch]$Force)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
Assert-Command 'npm.cmd' 'npm se instala con Node.js.' | Out-Null
foreach ($folder in @('backend','frontend')) {
    $path = Join-Path $root $folder
    $lock = Join-Path $path 'package-lock.json'
    if ((Test-Path $lock) -and -not $Force) {
        Write-Ok "$folder/package-lock.json ya existe."
        continue
    }
    Write-Step "Generando lockfile de $folder"
    Push-Location $path
    try {
        & npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "No se pudo generar el lockfile de $folder." }
    } finally { Pop-Location }
}
Write-Ok 'Lockfiles generados.'
