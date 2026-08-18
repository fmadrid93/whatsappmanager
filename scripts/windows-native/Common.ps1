Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Assert-Command([string]$Name, [string]$InstallHint) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "No se encontró '$Name'. $InstallHint"
    }
    return $cmd.Source
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Administrator {
    if (-not (Test-IsAdministrator)) {
        throw 'Abre PowerShell como Administrador y vuelve a ejecutar este script.'
    }
}

function Read-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) { throw "No existe el archivo de entorno: $Path" }
    $map = [ordered]@{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $value = $trimmed.Substring($idx + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $map[$key] = $value
    }
    return $map
}

function Import-DotEnv([string]$Path) {
    $vars = Read-DotEnv $Path
    foreach ($entry in $vars.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    return $vars
}

function Set-DotEnvValue([string]$Path, [string]$Key, [string]$Value) {
    $escaped = $Value -replace "`r|`n", ''
    $lines = [System.Collections.Generic.List[string]]::new()
    if (Test-Path $Path) {
        foreach ($existingLine in Get-Content -LiteralPath $Path -Encoding UTF8) { [void]$lines.Add($existingLine) }
    }
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$([regex]::Escape($Key))=") {
            $lines[$i] = "$Key=$escaped"
            $found = $true
            break
        }
    }
    if (-not $found) { $lines.Add("$Key=$escaped") }
    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Get-SecureRandomBytes([int]$Bytes) {
    if ($Bytes -le 0) {
        throw 'La cantidad de bytes debe ser mayor que cero.'
    }

    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $rng.GetBytes($buffer)
    }
    finally {
        $rng.Dispose()
    }

    return $buffer
}

function New-RandomHex([int]$Bytes = 48) {
    $buffer = Get-SecureRandomBytes $Bytes

    return ([System.BitConverter]::ToString($buffer)).
        Replace('-', '').
        ToLowerInvariant()
}

function New-RandomBase64([int]$Bytes = 32) {
    $buffer = Get-SecureRandomBytes $Bytes
    return [System.Convert]::ToBase64String($buffer)
}

function New-RandomPassword([int]$Length = 24) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%_-'
    $buffer = Get-SecureRandomBytes $Length

    $chars = for ($i = 0; $i -lt $Length; $i++) {
        $alphabet[$buffer[$i] % $alphabet.Length]
    }

    return -join $chars
}
function Find-SqlCmd {
    $cmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $roots = @(
        (Join-Path ${env:ProgramFiles} 'Microsoft SQL Server\Client SDK\ODBC'),
        (Join-Path ${env:ProgramFiles} 'Microsoft SQL Server'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft SQL Server')
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($root in $roots) {
        $candidate = Get-ChildItem -LiteralPath $root -Filter sqlcmd.exe -Recurse -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($candidate) { return $candidate.FullName }
    }
    return $null
}

function Get-SqlServerEndpoint([hashtable]$Vars) {
    $hostName = if ($Vars.SQLSERVER_HOST) { $Vars.SQLSERVER_HOST } else { 'localhost' }
    $instance = if ($Vars.SQLSERVER_INSTANCE) { $Vars.SQLSERVER_INSTANCE } else { '' }
    $port = if ($Vars.SQLSERVER_PORT) { $Vars.SQLSERVER_PORT } else { '' }
    if ($instance) { return "$hostName\$instance" }
    if ($port) { return "tcp:$hostName,$port" }
    return $hostName
}

function ConvertTo-SqlIdentifier([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'El identificador SQL no puede estar vacío.' }
    return '[' + ($Value -replace ']', ']]') + ']'
}

function ConvertTo-SqlLiteral([string]$Value) {
    return "N'" + ($Value -replace "'", "''") + "'"
}

function Get-NodePath {
    return (Assert-Command 'node.exe' 'Instala Node.js 22 LTS o una versión LTS compatible.').Trim()
}

function Protect-EnvironmentFile([string]$Path) {
    try {
        $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls.exe $Path /inheritance:r /grant:r "${currentUser}:(R,W)" /grant:r '*S-1-5-18:(R)' /grant:r '*S-1-5-32-544:(R)' | Out-Null
        Write-Ok "Permisos restringidos para $Path"
    } catch {
        Write-Warn "No se pudieron restringir los permisos de $Path automáticamente: $($_.Exception.Message)"
    }
}

