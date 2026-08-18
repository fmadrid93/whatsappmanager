param(
    [string]$Url = 'http://localhost:8080'
)
$cloudflared = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
if (-not $cloudflared) { throw 'No se encontró cloudflared.exe. Instálalo o colócalo en PATH.' }
Write-Host "Publicando temporalmente $Url" -ForegroundColor Cyan
& $cloudflared.Source tunnel --url $Url
