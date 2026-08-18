param(
    [ValidateRange(1, 10)]
    [int]$Count = 2,
    [ValidateRange(2, 100)]
    [int]$StartIndex = 2,
    [ValidateRange(1024, 65500)]
    [int]$BaseMetricsPort = 9465,
    [switch]$Development
)

. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$workerScript = Join-Path $PSScriptRoot 'start-worker.ps1'

Write-Host "Iniciando $Count Worker(s) adicional(es)." -ForegroundColor Cyan
Write-Host "Proyecto: $root"
Write-Host "Cada Worker tendrá WORKER_ID y METRICS_PORT propios."
Write-Host "Los leases existentes repartirán las sesiones; no se duplica una sesión entre workers."
Write-Host ""

for ($offset = 0; $offset -lt $Count; $offset += 1) {
    $number = $StartIndex + $offset
    $workerId = "windows-worker-$number"
    $metricsPort = $BaseMetricsPort + $offset

    $arguments = @(
        '-NoExit',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$workerScript`"",
        '-WorkerId', $workerId,
        '-MetricsPort', [string]$metricsPort
    )
    if ($Development) { $arguments += '-Development' }

    Start-Process powershell.exe -ArgumentList $arguments -WorkingDirectory $root | Out-Null
    Write-Host "[OK] $workerId  métricas: http://127.0.0.1:$metricsPort" -ForegroundColor Green
    Start-Sleep -Milliseconds 700
}

Write-Host ""
Write-Host "Workers adicionales iniciados." -ForegroundColor Green
Write-Host "Nota: más workers ayudan cuando existen varias sesiones conectadas; no evitan una cuarentena 463."
