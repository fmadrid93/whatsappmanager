$checks = @(
    @{ Name = 'API live'; Uri = 'http://127.0.0.1:3000/health/live' },
    @{ Name = 'API ready'; Uri = 'http://127.0.0.1:3000/health/ready' },
    @{ Name = 'Worker live'; Uri = 'http://127.0.0.1:9464/health/live' },
    @{ Name = 'Worker ready'; Uri = 'http://127.0.0.1:9464/health/ready' }
)

foreach ($check in $checks) {
    try {
        $response = Invoke-RestMethod -Uri $check.Uri -TimeoutSec 3
        Write-Host "[OK] $($check.Name): $($response.status)" -ForegroundColor Green
    }
    catch {
        Write-Host "[FALLO] $($check.Name)" -ForegroundColor Red
    }
}

try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4200' -UseBasicParsing -TimeoutSec 3
    Write-Host "[OK] Angular: HTTP $($response.StatusCode)" -ForegroundColor Green
}
catch {
    Write-Host '[FALLO] Angular' -ForegroundColor Red
}

Write-Host "`nLogs: .\logs\development" -ForegroundColor Cyan
Pause
