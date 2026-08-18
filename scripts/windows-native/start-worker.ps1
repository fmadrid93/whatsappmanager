param(
    [switch]$Development,
    [string]$WorkerId = 'windows-worker-1',
    [int]$MetricsPort = 9464
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'
Import-DotEnv $envPath | Out-Null
$env:WORKER_ID = $WorkerId
$env:METRICS_PORT = [string]$MetricsPort
$backend = Join-Path $root 'backend'
Push-Location $backend
try {
    if ($Development) {
        & npm.cmd run dev:worker
    } else {
        if (-not (Test-Path 'dist\worker\main.js')) { throw 'No existe el build backend. Ejecuta build-application.ps1.' }
        & node.exe --env-file=$envPath dist/worker/main.js
    }
    exit $LASTEXITCODE
} finally { Pop-Location }
