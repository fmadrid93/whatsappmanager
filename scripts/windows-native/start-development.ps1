param(
    [switch]$SkipMigration
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'
Import-DotEnv $envPath | Out-Null
if (-not $SkipMigration) { & (Join-Path $PSScriptRoot 'migrate-database.ps1') }

$apiScript = Join-Path $PSScriptRoot 'start-api.ps1'
$workerScript = Join-Path $PSScriptRoot 'start-worker.ps1'
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$apiScript`"",'-Development') -WorkingDirectory $root
Start-Sleep -Seconds 2
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$workerScript`"",'-Development') -WorkingDirectory $root
Start-Sleep -Seconds 2
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-Command',"Set-Location '$root\frontend'; npm.cmd start") -WorkingDirectory $root
Start-Sleep -Seconds 5
Start-Process 'http://localhost:4200'
Write-Ok 'API, Worker y Angular se iniciaron en ventanas separadas.'
Write-Host 'API: http://localhost:3000'
Write-Host 'Web: http://localhost:4200'
