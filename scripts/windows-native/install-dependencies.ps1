param(
    [switch]$ForceInstall
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
Assert-Command 'node.exe' 'Instala Node.js LTS.' | Out-Null
Assert-Command 'npm.cmd' 'npm se instala junto a Node.js.' | Out-Null

foreach ($folder in @('backend','frontend')) {
    $path = Join-Path $root $folder
    Write-Step "Instalando dependencias de $folder"
    Push-Location $path
    try {
        if ((Test-Path 'package-lock.json') -and -not $ForceInstall) {
            & npm.cmd ci --no-audit --no-fund
        } else {
            & npm.cmd install --no-audit --no-fund
        }
        if ($LASTEXITCODE -ne 0) { throw "npm falló en $folder con código $LASTEXITCODE" }
    } finally { Pop-Location }
    if (-not (Test-Path (Join-Path $path 'package-lock.json'))) {
        throw "npm no generó package-lock.json en $folder."
    }
    Write-Ok "Dependencias de $folder instaladas y lockfile verificado."
}
