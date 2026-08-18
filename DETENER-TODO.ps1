Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Stop-Port([int]$Port) {
    $ids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($processId in $ids) {
        if ($processId -and $processId -ne $PID) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Write-Host "[OK] Puerto $Port liberado (PID $processId)." -ForegroundColor Green
        }
    }
}

Stop-Port 3000
Stop-Port 9464
Stop-Port 4200

$escapedRoot = [regex]::Escape($root)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -and
        $_.CommandLine -match $escapedRoot -and
        ($_.CommandLine -match 'src[\\/]api[\\/]main\.ts' -or
         $_.CommandLine -match 'src[\\/]worker[\\/]main\.ts' -or
         $_.CommandLine -match 'ng serve')
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

Write-Host "`nWhatsApp SaaS detenido." -ForegroundColor Cyan
Start-Sleep -Seconds 2
