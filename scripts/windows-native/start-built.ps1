param(
    [switch]$SkipMigration,
    [switch]$OpenBrowser
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
if (-not $SkipMigration) { & (Join-Path $PSScriptRoot 'migrate-database.ps1') }
$apiScript = Join-Path $PSScriptRoot 'start-api.ps1'
$workerScript = Join-Path $PSScriptRoot 'start-worker.ps1'
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$apiScript`"") -WorkingDirectory $root
Start-Sleep -Seconds 2
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$workerScript`"") -WorkingDirectory $root
if ($OpenBrowser) { Start-Sleep -Seconds 4; Start-Process 'http://localhost:8080' }
Write-Ok 'API y Worker compilados iniciados en ventanas separadas.'
