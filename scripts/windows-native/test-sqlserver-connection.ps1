param(
    [switch]$UseApplicationLogin
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$vars = Read-DotEnv (Join-Path $root '.env')
$sqlcmd = Find-SqlCmd
if (-not $sqlcmd) { throw 'No se encontró sqlcmd.exe.' }
$endpoint = Get-SqlServerEndpoint $vars
$args = @('-S',$endpoint,'-b','-l','15','-Q','SELECT @@SERVERNAME AS server_name, DB_NAME() AS database_name, SUSER_SNAME() AS login_name, @@VERSION AS version;')
if ($vars.SQLSERVER_TRUST_SERVER_CERTIFICATE -eq 'true') { $args += '-C' }
if ($UseApplicationLogin) {
    $env:SQLCMDPASSWORD = $vars.SQLSERVER_APP_PASSWORD
    $args += @('-U',$vars.SQLSERVER_APP_USER,'-d',$vars.SQLSERVER_DATABASE)
} else {
    $args += '-E'
}
try {
    & $sqlcmd @args
    if ($LASTEXITCODE -ne 0) { throw "No se pudo conectar a $endpoint." }
} finally { $env:SQLCMDPASSWORD = $null }
Write-Ok "Conexión SQL Server correcta: $endpoint"
