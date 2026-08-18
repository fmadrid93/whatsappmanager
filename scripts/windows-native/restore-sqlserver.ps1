param(
    [Parameter(Mandatory=$true)][string]$BackupFile,
    [string]$TargetDatabase,
    [ValidateSet('Windows','Sql')][string]$AdminAuthentication = 'Windows',
    [string]$SqlAdminUser = 'sa',
    [SecureString]$SqlAdminPassword,
    [switch]$Force
)
. (Join-Path $PSScriptRoot 'Common.ps1')
if (-not $Force) { throw 'La restauración reemplaza datos. Repite con -Force después de confirmar el backup.' }
$root = Get-ProjectRoot
$vars = Read-DotEnv (Join-Path $root '.env')
$sqlcmd = Find-SqlCmd
if (-not $sqlcmd) { throw 'No se encontró sqlcmd.exe.' }
$resolvedBackup = (Resolve-Path $BackupFile).Path
if (-not $TargetDatabase) { $TargetDatabase = $vars.SQLSERVER_DATABASE }

$dbId = ConvertTo-SqlIdentifier $TargetDatabase
$fileLiteral = ConvertTo-SqlLiteral $resolvedBackup
$endpoint = Get-SqlServerEndpoint $vars
$query = @"
IF DB_ID($(ConvertTo-SqlLiteral $TargetDatabase)) IS NOT NULL
    ALTER DATABASE $dbId SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE $dbId FROM DISK = $fileLiteral WITH REPLACE, RECOVERY, STATS = 10;
ALTER DATABASE $dbId SET MULTI_USER;
"@

$adminBstr = [IntPtr]::Zero
try {
    $args = @('-S',$endpoint,'-d','master','-b','-l','30','-Q',$query)
    if ($vars.SQLSERVER_TRUST_SERVER_CERTIFICATE -eq 'true') { $args += '-C' }
    if ($AdminAuthentication -eq 'Windows') { $args += '-E' }
    else {
        if (-not $SqlAdminPassword) { $SqlAdminPassword = Read-Host "Contraseña de '$SqlAdminUser'" -AsSecureString }
        $adminBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SqlAdminPassword)
        $env:SQLCMDPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminBstr)
        $args += @('-U',$SqlAdminUser)
    }
    & $sqlcmd @args
    if ($LASTEXITCODE -ne 0) { throw "RESTORE DATABASE terminó con código $LASTEXITCODE" }
} finally {
    $env:SQLCMDPASSWORD = $null
    if ($adminBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminBstr) }
}
Write-Ok "Backup restaurado en $TargetDatabase"
