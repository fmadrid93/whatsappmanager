param(
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
[System.Environment]::CurrentDirectory = $root

$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$envPath = Join-Path $root '.env'
$runtimeDir = Join-Path $root 'logs\development'
$apiLog = Join-Path $runtimeDir 'api.log'
$workerLog = Join-Path $runtimeDir 'worker.log'
$frontendLog = Join-Path $runtimeDir 'frontend.log'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Read-DotEnv([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "No existe $Path"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $index = $trimmed.IndexOf('=')
        if ($index -lt 1) { continue }

        $key = $trimmed.Substring(0, $index).Trim()
        $value = $trimmed.Substring($index + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }
    return $values
}

function Import-DotEnv([string]$Path) {
    $values = Read-DotEnv $Path
    foreach ($entry in $values.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    return $values
}

function Stop-PortListener([int]$Port) {
    $connections = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )

    foreach ($processId in $connections) {
        if (-not $processId -or $processId -eq $PID) { continue }
        try {
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
            $description = if ($processInfo) {
                "$($processInfo.Name) PID=$processId"
            } else {
                "PID=$processId"
            }
            Write-Warn "Cerrando proceso anterior en puerto ${Port}: $description"
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            throw "No se pudo liberar el puerto $Port. Cierra manualmente el proceso PID $processId."
        }
    }
}

function Stop-OrphanProjectProcesses {
    $escapedRoot = [regex]::Escape($root)
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and
            $_.CommandLine -and
            $_.CommandLine -match $escapedRoot -and
            ($_.CommandLine -match 'src[\\/]api[\\/]main\.ts' -or
             $_.CommandLine -match 'src[\\/]worker[\\/]main\.ts' -or
             $_.CommandLine -match 'ng serve')
        }

    foreach ($processInfo in $processes) {
        try {
            Write-Warn "Cerrando proceso anterior del proyecto: $($processInfo.Name) PID=$($processInfo.ProcessId)"
            Stop-Process -Id $processInfo.ProcessId -Force -ErrorAction SilentlyContinue
        }
        catch { }
    }
}

function Wait-Health([string]$Uri, [string]$ExpectedStatus, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-RestMethod -Uri $Uri -Method Get -TimeoutSec 3
            if ($response.status -eq $ExpectedStatus) {
                return $true
            }
        }
        catch { }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Wait-Web([string]$Uri, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch { }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Show-LogTail([string]$Title, [string]$Path) {
    Write-Host "`n----- $Title -----" -ForegroundColor Yellow
    if (Test-Path -LiteralPath $Path) {
        Get-Content -LiteralPath $Path -Tail 80
    } else {
        Write-Host 'No se generó el archivo de log.'
    }
}

function Stop-All {
    Stop-PortListener 3000
    Stop-PortListener 9464
    Stop-PortListener 4200
    Stop-OrphanProjectProcesses
}

Write-Host 'WhatsApp SaaS - Inicio completo para Windows' -ForegroundColor Cyan
Write-Host "Proyecto: $root"

Write-Step 'Comprobando archivos básicos'
foreach ($requiredPath in @(
    $envPath,
    (Join-Path $backend 'package.json'),
    (Join-Path $frontend 'package.json'),
    (Join-Path $backend 'node_modules'),
    (Join-Path $frontend 'node_modules')
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Falta: $requiredPath"
    }
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw 'No se encontró node.exe en PATH.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'No se encontró npm.cmd en PATH.'
}
Write-Ok "Node $(node.exe --version)"

Write-Step 'Cargando configuración'
$vars = Import-DotEnv $envPath

# WHATSAPPSAAS-EXPORT-ENV
# Exportar la configuracion leida del .env al process environment
# para que API, Worker, Prisma y procesos hijos la reciban.
foreach ($entry in $vars.GetEnumerator()) {
    $variableName = [string]$entry.Key
    $variableValue = [string]$entry.Value

    if (-not [string]::IsNullOrWhiteSpace($variableName)) {
        [System.Environment]::SetEnvironmentVariable(
            $variableName,
            $variableValue,
            [System.EnvironmentVariableTarget]::Process
        )
    }
}
foreach ($key in @('DATABASE_URL','JWT_SECRET','ENCRYPTION_KEY_BASE64','S3_BUCKET')) {
    if (-not $vars.ContainsKey($key) -or [string]::IsNullOrWhiteSpace([string]$vars[$key])) {
        throw "La variable $key falta o está vacía en .env"
    }
}
Write-Ok "Modo WhatsApp: $($vars['WHATSAPP_GATEWAY_MODE'])"
Write-Ok "Modo almacenamiento: $($vars['OBJECT_STORAGE_MODE'])"

Write-Step 'Cerrando procesos anteriores y liberando puertos'
Stop-All
Start-Sleep -Seconds 2
Write-Ok 'Puertos 3000, 9464 y 4200 disponibles.'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Remove-Item $apiLog,$workerLog,$frontendLog -Force -ErrorAction SilentlyContinue

$apiLauncher = Join-Path $runtimeDir 'run-api.cmd'
$workerLauncher = Join-Path $runtimeDir 'run-worker.cmd'
$frontendLauncher = Join-Path $runtimeDir 'run-frontend.cmd'

@"
@echo off
cd /d "$backend"
npm.cmd run dev:api >> "$apiLog" 2>&1
"@ | Set-Content -LiteralPath $apiLauncher -Encoding ASCII

@"
@echo off
cd /d "$backend"
npm.cmd run dev:worker >> "$workerLog" 2>&1
"@ | Set-Content -LiteralPath $workerLauncher -Encoding ASCII

@"
@echo off
set NG_CLI_ANALYTICS=false
cd /d "$frontend"
npm.cmd start >> "$frontendLog" 2>&1
"@ | Set-Content -LiteralPath $frontendLauncher -Encoding ASCII

Write-Step 'Iniciando API'
Start-Process -FilePath $apiLauncher -WindowStyle Hidden -WorkingDirectory $root | Out-Null
if (-not (Wait-Health 'http://127.0.0.1:3000/health/live' 'alive' 60)) {
    Show-LogTail 'API' $apiLog
    Stop-All
    throw 'La API no inició. Revisa el log mostrado arriba.'
}
if (-not (Wait-Health 'http://127.0.0.1:3000/health/ready' 'ready' 30)) {
    Show-LogTail 'API' $apiLog
    Stop-All
    throw 'La API inició, pero no está lista.'
}
Write-Ok 'API lista: http://127.0.0.1:3000'

Write-Step 'Iniciando Worker'
$env:WORKER_ID = 'windows-worker-1'
Start-Process -FilePath $workerLauncher -WindowStyle Hidden -WorkingDirectory $root | Out-Null
if (-not (Wait-Health 'http://127.0.0.1:9464/health/live' 'alive' 60)) {
    Show-LogTail 'WORKER' $workerLog
    Stop-All
    throw 'El Worker no inició. Revisa el log mostrado arriba.'
}
if (-not (Wait-Health 'http://127.0.0.1:9464/health/ready' 'ready' 30)) {
    Show-LogTail 'WORKER' $workerLog
    Stop-All
    throw 'El Worker inició, pero no está listo.'
}
Write-Ok 'Worker listo: http://127.0.0.1:9464'

Write-Step 'Iniciando Angular'
Start-Process -FilePath $frontendLauncher -WindowStyle Hidden -WorkingDirectory $root | Out-Null
if (-not (Wait-Web 'http://127.0.0.1:4200' 240)) {
    Show-LogTail 'ANGULAR' $frontendLog
    Stop-All
    throw 'Angular no inició. Revisa el log mostrado arriba.'
}
Write-Ok 'Angular listo: http://127.0.0.1:4200'

$apiStatus = Invoke-RestMethod 'http://127.0.0.1:3000/health/ready' -TimeoutSec 5
$workerStatus = Invoke-RestMethod 'http://127.0.0.1:9464/health/ready' -TimeoutSec 5

Write-Host "`n============================================" -ForegroundColor Green
Write-Host ' TODO INICIADO CORRECTAMENTE' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Green
Write-Host 'Aplicación: http://localhost:4200'
Write-Host 'API:        http://localhost:3000'
Write-Host 'Worker:     http://localhost:9464'
Write-Host "API ready:  $($apiStatus.status)"
Write-Host "Worker:     $($workerStatus.status)"
Write-Host "`nLogs: $runtimeDir"
Write-Host 'Para detener todo: doble clic en DETENER-TODO.cmd'

if (-not $NoBrowser) {
    Start-Process 'http://localhost:4200'
}
