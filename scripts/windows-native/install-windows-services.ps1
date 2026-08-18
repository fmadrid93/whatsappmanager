param(
    [string]$WinSwVersion = '2.12.0',
    [switch]$ForceDownload,
    [switch]$StartServices
)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = Get-ProjectRoot
$envPath = Join-Path $root '.env'
if (-not (Test-Path $envPath)) { throw 'No existe .env.' }
if (-not (Test-Path (Join-Path $root 'backend\dist\api\main.js'))) { throw 'No existe el build backend.' }

$nodePath = Get-NodePath
$serviceDir = Join-Path $root 'runtime\services'
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $serviceDir,$logDir | Out-Null
$downloaded = Join-Path $serviceDir 'WinSW-x64.exe'
if ($ForceDownload -or -not (Test-Path $downloaded)) {
    $url = "https://github.com/winsw/winsw/releases/download/v$WinSwVersion/WinSW-x64.exe"
    Write-Step "Descargando WinSW $WinSwVersion"
    Invoke-WebRequest -Uri $url -OutFile $downloaded -UseBasicParsing
}

function XmlEscape([string]$value) { return [Security.SecurityElement]::Escape($value) }
function New-ServiceFiles([string]$Id, [string]$DisplayName, [string]$EntryPoint, [string]$ExtraEnv = '') {
    $exePath = Join-Path $serviceDir "$Id.exe"
    $xmlPath = Join-Path $serviceDir "$Id.xml"
    Copy-Item $downloaded $exePath -Force
    $arguments = "--env-file=`"$envPath`" `"$EntryPoint`""
    $xml = @"
<service>
  <id>$Id</id>
  <name>$DisplayName</name>
  <description>WhatsApp SaaS Windows Native Edition</description>
  <executable>$(XmlEscape $nodePath)</executable>
  <arguments>$(XmlEscape $arguments)</arguments>
  <workingdirectory>$(XmlEscape (Join-Path $root 'backend'))</workingdirectory>
  <startmode>Automatic</startmode>
  <stoptimeout>120sec</stoptimeout>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>$(XmlEscape $logDir)</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  $ExtraEnv
</service>
"@
    Set-Content -LiteralPath $xmlPath -Value $xml -Encoding UTF8
    & $exePath stop 2>$null | Out-Null
    & $exePath uninstall 2>$null | Out-Null
    & $exePath install
    if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar $DisplayName" }
    if ($StartServices) { & $exePath start }
}

New-ServiceFiles 'WhatsAppSaaS.Api' 'WhatsApp SaaS API' (Join-Path $root 'backend\dist\api\main.js')
New-ServiceFiles 'WhatsAppSaaS.Worker' 'WhatsApp SaaS Worker' (Join-Path $root 'backend\dist\worker\main.js') '<env name="WORKER_ID" value="windows-service-worker-1" />'
Protect-EnvironmentFile $envPath
Write-Ok 'Servicios instalados: WhatsAppSaaS.Api y WhatsAppSaaS.Worker.'
if (-not $StartServices) { Write-Host 'Inícialos con: Start-Service WhatsAppSaaS.Api, WhatsAppSaaS.Worker' }
