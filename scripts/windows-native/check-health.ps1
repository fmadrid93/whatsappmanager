param([string]$BaseUrl = 'http://127.0.0.1:3000')
$ErrorActionPreference = 'Stop'
foreach ($path in @('/health/live','/health/ready','/version')) {
    try {
        $response = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + $path) -TimeoutSec 15
        Write-Host "[OK] $path" -ForegroundColor Green
        $response | ConvertTo-Json -Depth 8
    } catch {
        Write-Host "[ERROR] $path - $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}
