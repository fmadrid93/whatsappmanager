param(
    [string]$OutputDirectory,
    [ValidateSet('Windows','Sql')][string]$AdminAuthentication = 'Windows',
    [string]$SqlAdminUser = 'sa',
    [SecureString]$SqlAdminPassword
)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-ProjectRoot
$vars = Read-DotEnv (Join-Path $root '.env')
$sqlcmd = Find-SqlCmd
if (-not $sqlcmd) { throw 'No se encontró sqlcmd.exe.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'backups' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$instance = $vars.SQLSERVER_INSTANCE
$serviceName = if ($instance) { "MSSQL`$$instance" } else { 'MSSQLSERVER' }
$service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
if ($service -and $service.StartName) {
    try { $grant = '{0}:(OI)(CI)M' -f $service.StartName; & icacls.exe $OutputDirectory /grant $grant /T /C | Out-Null }
    catch { Write-Warn "No se pudo conceder acceso a $($service.StartName): $($_.Exception.Message)" }
}

$file = Join-Path $OutputDirectory ("whatsapp-saas-{0}.bak" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$dbId = ConvertTo-SqlIdentifier $vars.SQLSERVER_DATABASE
$fileLiteral = ConvertTo-SqlLiteral $file
$endpoint = Get-SqlServerEndpoint $vars
$query = "BACKUP DATABASE $dbId TO DISK = $fileLiteral WITH COPY_ONLY, INIT, CHECKSUM, STATS = 10;"

$adminBstr = [IntPtr]::Zero
try {
    $args = @('-S',$endpoint,'-b','-l','30','-Q',$query)
    if ($vars.SQLSERVER_TRUST_SERVER_CERTIFICATE -eq 'true') { $args += '-C' }
    if ($AdminAuthentication -eq 'Windows') { $args += '-E' }
    else {
        if (-not $SqlAdminPassword) { $SqlAdminPassword = Read-Host "Contraseña de '$SqlAdminUser'" -AsSecureString }
        $adminBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SqlAdminPassword)
        $env:SQLCMDPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminBstr)
        $args += @('-U',$SqlAdminUser)
    }
    & $sqlcmd @args
    if ($LASTEXITCODE -ne 0) { throw "BACKUP DATABASE terminó con código $LASTEXITCODE" }
} finally {
    $env:SQLCMDPASSWORD = $null
    if ($adminBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminBstr) }
}
Write-Ok "Backup creado: $file"
