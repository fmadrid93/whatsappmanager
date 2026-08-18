param(
    [ValidateSet('Windows','Sql')]
    [string]$AdminAuthentication = 'Windows',
    [string]$SqlAdminUser = 'sa',
    [SecureString]$SqlAdminPassword,
    [switch]$SkipConnectionTest
)

. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'
$vars = Read-DotEnv $envPath
$sqlcmd = Find-SqlCmd
if (-not $sqlcmd) { throw 'No se encontró sqlcmd.exe.' }
$endpoint = Get-SqlServerEndpoint $vars

$adminPlain = $null
$adminBstr = [IntPtr]::Zero
if ($AdminAuthentication -eq 'Sql') {
    if (-not $SqlAdminPassword) {
        $SqlAdminPassword = Read-Host "Contraseña del usuario SQL Server '$SqlAdminUser'" -AsSecureString
    }
    $adminBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SqlAdminPassword)
    $adminPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminBstr)
}

$dbName = $vars.SQLSERVER_DATABASE
$appUser = $vars.SQLSERVER_APP_USER
$appPassword = $vars.SQLSERVER_APP_PASSWORD
if (-not $dbName -or -not $appUser -or -not $appPassword) { throw 'Faltan variables SQLSERVER_DATABASE/APP_USER/APP_PASSWORD en .env.' }

$dbIdentifier = ConvertTo-SqlIdentifier $dbName
$userIdentifier = ConvertTo-SqlIdentifier $appUser
$dbLiteral = ConvertTo-SqlLiteral $dbName
$userLiteral = ConvertTo-SqlLiteral $appUser
$passwordLiteral = ConvertTo-SqlLiteral $appPassword
$sqlFile = Join-Path $env:TEMP "waas-create-sqlserver-$PID.sql"

@"
SET NOCOUNT ON;
IF SUSER_ID($userLiteral) IS NULL
BEGIN
    CREATE LOGIN $userIdentifier WITH PASSWORD = $passwordLiteral, CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
END
ELSE
BEGIN
    ALTER LOGIN $userIdentifier WITH PASSWORD = $passwordLiteral;
END;

IF DB_ID($dbLiteral) IS NULL
BEGIN
    EXEC(N'CREATE DATABASE $dbIdentifier');
END;
GO
USE $dbIdentifier;
GO
IF USER_ID($userLiteral) IS NULL
BEGIN
    CREATE USER $userIdentifier FOR LOGIN $userIdentifier;
END;
IF IS_ROLEMEMBER(N'db_owner', $userLiteral) <> 1
BEGIN
    ALTER ROLE [db_owner] ADD MEMBER $userIdentifier;
END;
GO
SELECT DB_NAME() AS database_name, SUSER_SNAME() AS admin_login;
GO
"@ | Set-Content -LiteralPath $sqlFile -Encoding UTF8

try {
    Write-Step "Creando/verificando login '$appUser' y base '$dbName' en $endpoint"
    $args = @('-S', $endpoint, '-b', '-l', '30', '-i', $sqlFile)
    if ($vars.SQLSERVER_TRUST_SERVER_CERTIFICATE -eq 'true') { $args += '-C' }
    if ($AdminAuthentication -eq 'Windows') {
        $args += '-E'
    } else {
        $env:SQLCMDPASSWORD = $adminPlain
        $args += @('-U', $SqlAdminUser)
    }
    & $sqlcmd @args
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd terminó con código $LASTEXITCODE" }

    if (-not $SkipConnectionTest) {
        Write-Step 'Probando conexión con el login de aplicación'
        $env:SQLCMDPASSWORD = $appPassword
        $testArgs = @('-S', $endpoint, '-U', $appUser, '-d', $dbName, '-b', '-l', '30', '-Q', 'SELECT DB_NAME() AS database_name, SUSER_SNAME() AS login_name;')
        if ($vars.SQLSERVER_TRUST_SERVER_CERTIFICATE -eq 'true') { $testArgs += '-C' }
        & $sqlcmd @testArgs
        if ($LASTEXITCODE -ne 0) { throw 'La base fue creada, pero el login de aplicación no pudo conectarse.' }
    }
    Write-Ok 'Base de datos SQL Server lista.'
} finally {
    $env:SQLCMDPASSWORD = $null
    Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
    if ($adminBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminBstr) }
}
