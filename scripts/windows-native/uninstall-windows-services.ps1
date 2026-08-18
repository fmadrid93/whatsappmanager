. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = Get-ProjectRoot
foreach ($id in @('WhatsAppSaaS.Api','WhatsAppSaaS.Worker')) {
    $exe = Join-Path $root "runtime\services\$id.exe"
    if (Test-Path $exe) {
        & $exe stop 2>$null | Out-Null
        & $exe uninstall 2>$null | Out-Null
        Write-Host "Eliminado: $id"
    }
}
