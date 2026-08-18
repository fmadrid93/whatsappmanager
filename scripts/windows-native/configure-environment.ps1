param(
    [ValidateSet('Mock','Real')]
    [string]$Mode = 'Mock',
    [string]$SqlServerHost = 'localhost',
    [string]$SqlServerInstance = '',
    [int]$SqlServerPort = 1433,
    [string]$DatabaseName = 'whatsapp_saas',
    [string]$DatabaseUser = 'whatsapp_app',
    [string]$DatabasePassword,
    [bool]$Encrypt = $true,
    [bool]$TrustServerCertificate = $true,
    [string]$AdminEmail = 'admin@demo.local',
    [string]$AdminPassword,
    [string]$TenantName = 'Empresa Demo',
    [string]$AwsRegion = 'sa-east-1',
    [string]$S3Bucket,
    [switch]$Force,
    [switch]$OpenEnv
)

. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$template = Join-Path $root '.env.windows.example'
$envPath = Join-Path $root '.env'

if ((Test-Path $envPath) -and -not $Force) {
    throw '.env ya existe. Usa -Force únicamente si deseas reemplazarlo. Guarda ENCRYPTION_KEY_BASE64 antes de hacerlo.'
}
if (-not (Test-Path $template)) { throw "No se encontró $template" }

Copy-Item $template $envPath -Force
if (-not $DatabasePassword) { $DatabasePassword = New-RandomPassword 24 }
if (-not $AdminPassword) { $AdminPassword = New-RandomPassword 24 }

$encodedUser = [Uri]::EscapeDataString($DatabaseUser)
$encodedPassword = [Uri]::EscapeDataString($DatabasePassword)
$authority = if ($SqlServerInstance) { "$SqlServerHost\$SqlServerInstance" } else { "${SqlServerHost}:$SqlServerPort" }
$encryptText = $Encrypt.ToString().ToLowerInvariant()
$trustText = $TrustServerCertificate.ToString().ToLowerInvariant()
$dbUrl = "sqlserver://${authority};database=${DatabaseName};user=${encodedUser};password=${encodedPassword};encrypt=${encryptText};trustServerCertificate=${trustText};schema=dbo"

Set-DotEnvValue $envPath 'SQLSERVER_HOST' $SqlServerHost
Set-DotEnvValue $envPath 'SQLSERVER_INSTANCE' $SqlServerInstance
Set-DotEnvValue $envPath 'SQLSERVER_PORT' $(if ($SqlServerInstance) { '' } else { $SqlServerPort.ToString() })
Set-DotEnvValue $envPath 'SQLSERVER_DATABASE' $DatabaseName
Set-DotEnvValue $envPath 'SQLSERVER_APP_USER' $DatabaseUser
Set-DotEnvValue $envPath 'SQLSERVER_APP_PASSWORD' $DatabasePassword
Set-DotEnvValue $envPath 'SQLSERVER_ENCRYPT' $encryptText
Set-DotEnvValue $envPath 'SQLSERVER_TRUST_SERVER_CERTIFICATE' $trustText
Set-DotEnvValue $envPath 'SQLSERVER_SCHEMA' 'dbo'
Set-DotEnvValue $envPath 'DATABASE_URL' $dbUrl
Set-DotEnvValue $envPath 'PRISMA_PROVIDER' 'sqlserver'
Set-DotEnvValue $envPath 'JWT_SECRET' (New-RandomHex 48)
Set-DotEnvValue $envPath 'ENCRYPTION_KEY_BASE64' (New-RandomBase64 32)
Set-DotEnvValue $envPath 'SEED_ADMIN_EMAIL' $AdminEmail
Set-DotEnvValue $envPath 'SEED_ADMIN_PASSWORD' $AdminPassword
Set-DotEnvValue $envPath 'SEED_TENANT_NAME' $TenantName
Set-DotEnvValue $envPath 'AWS_REGION' $AwsRegion

if ($Mode -eq 'Mock') {
    Set-DotEnvValue $envPath 'WHATSAPP_GATEWAY_MODE' 'MOCK'
    Set-DotEnvValue $envPath 'OBJECT_STORAGE_MODE' 'MOCK'
    Set-DotEnvValue $envPath 'READINESS_REQUIRE_S3' 'false'
} else {
    Set-DotEnvValue $envPath 'WHATSAPP_GATEWAY_MODE' 'BAILEYS'
    Set-DotEnvValue $envPath 'OBJECT_STORAGE_MODE' 'S3'
    if ($S3Bucket) { Set-DotEnvValue $envPath 'S3_BUCKET' $S3Bucket }
}

Protect-EnvironmentFile $envPath
Write-Ok "Archivo creado: $envPath"
Write-Host "`nInstancia SQL Server: $authority" -ForegroundColor Cyan
Write-Host "Base: $DatabaseName" -ForegroundColor Cyan
Write-Host "Usuario SQL de aplicación: $DatabaseUser" -ForegroundColor Cyan
Write-Host "Contraseña SQL de aplicación: $DatabasePassword" -ForegroundColor Yellow
Write-Host "Usuario inicial web: $AdminEmail" -ForegroundColor Cyan
Write-Host "Contraseña inicial web: $AdminPassword" -ForegroundColor Yellow
Write-Warn 'Guarda estas credenciales. No cambies ENCRYPTION_KEY_BASE64 después de vincular sesiones.'
if ($OpenEnv) { Start-Process notepad.exe -ArgumentList $envPath }
