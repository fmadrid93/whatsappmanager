param([string]$ProjectRoot = "D:\proyectos\WhatsAppSaas")
$ErrorActionPreference = "Stop"
$backend = Join-Path $ProjectRoot "backend"
if (-not (Test-Path -LiteralPath (Join-Path $backend "tests\unit\automatic-failover.test.ts"))) {
    throw "Automatic failover test not found. Apply patch 8 first."
}
Push-Location $backend
try {
    & node.exe "--env-file=../.env" "--import=tsx" "--test" `
        "tests/unit/automatic-failover.test.ts" `
        "tests/unit/failover-distribution.test.ts"
    if ($LASTEXITCODE -ne 0) { throw "Safe failover test failed." }
    Write-Host "`n[OK] Safe failover test passed. No WhatsApp message was sent." -ForegroundColor Green
} finally {
    Pop-Location
}
