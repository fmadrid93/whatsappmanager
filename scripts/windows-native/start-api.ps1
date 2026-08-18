param(
    [switch]$Development
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'
Import-DotEnv $envPath | Out-Null
$backend = Join-Path $root 'backend'
Push-Location $backend
try {
    if ($Development) {
        & npm.cmd run dev:api
    } else {
        if (-not (Test-Path 'dist\api\main.js')) { throw 'No existe el build backend. Ejecuta build-application.ps1.' }
        & node.exe --env-file=$envPath dist/api/main.js
    }
    exit $LASTEXITCODE
} finally { Pop-Location }
