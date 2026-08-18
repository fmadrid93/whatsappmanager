param(
    [Parameter(Mandatory=$true)][string]$TunnelToken,
    [string]$InstallDirectory = 'C:\Cloudflared\bin',
    [switch]$ForceDownload
)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
$exe = Join-Path $InstallDirectory 'cloudflared.exe'
if ($ForceDownload -or -not (Test-Path $exe)) {
    Write-Step 'Descargando cloudflared oficial para Windows x64'
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe -UseBasicParsing
}
& $exe service install $TunnelToken
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar el servicio cloudflared.' }
Write-Ok 'Cloudflare Tunnel fue instalado como servicio de Windows.'
