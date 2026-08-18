param(
    [string]$SiteName = 'WhatsAppSaaS',
    [string]$AppPoolName = 'WhatsAppSaaS',
    [string]$PhysicalPath = 'C:\inetpub\WhatsAppSaaS',
    [int]$Port = 8080,
    [int]$ApiPort = 3000,
    [switch]$Force
)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = Get-ProjectRoot

Write-Step 'Habilitando componentes IIS incluidos en Windows'
$features = @(
    'IIS-WebServerRole','IIS-WebServer','IIS-CommonHttpFeatures','IIS-StaticContent',
    'IIS-DefaultDocument','IIS-HttpErrors','IIS-HttpLogging','IIS-RequestFiltering',
    'IIS-ManagementConsole'
)
foreach ($feature in $features) {
    Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart -ErrorAction Stop | Out-Null
}

$rewriteDll = Join-Path $env:windir 'System32\inetsrv\rewrite.dll'
if (-not (Test-Path $rewriteDll)) {
    throw 'Falta IIS URL Rewrite. Instala URL Rewrite 2 antes de repetir este script.'
}
$appcmd = Join-Path $env:windir 'System32\inetsrv\appcmd.exe'
if (-not (Test-Path $appcmd)) { throw 'No se encontró appcmd.exe.' }

Write-Step 'Comprobando Application Request Routing (ARR)'
& $appcmd set config /section:system.webServer/proxy /enabled:true /commit:apphost | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo habilitar el proxy de IIS. Instala Application Request Routing (ARR) y activa Proxy.'
}

$distRoot = Join-Path $root 'frontend\dist'
if (-not (Test-Path $distRoot)) { throw 'No existe frontend\dist. Ejecuta build-application.ps1.' }
$browserDir = Get-ChildItem $distRoot -Directory -Recurse | Where-Object { Test-Path (Join-Path $_.FullName 'index.html') } | Select-Object -First 1
if (-not $browserDir) { throw 'No se encontró index.html dentro de frontend\dist.' }

if (Test-Path $PhysicalPath) {
    if (-not $Force) { throw "$PhysicalPath ya existe. Usa -Force para reemplazar su contenido." }
    Remove-Item (Join-Path $PhysicalPath '*') -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Force -Path $PhysicalPath | Out-Null
}
Copy-Item (Join-Path $browserDir.FullName '*') $PhysicalPath -Recurse -Force
$template = Get-Content (Join-Path $root 'deploy\windows\iis\web.config.template') -Raw
$template.Replace('__API_PORT__', $ApiPort.ToString()) | Set-Content (Join-Path $PhysicalPath 'web.config') -Encoding UTF8

& $appcmd list apppool /name:$AppPoolName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    & $appcmd add apppool /name:$AppPoolName | Out-Null
}
& $appcmd set apppool $AppPoolName /managedRuntimeVersion:"" /managedPipelineMode:Integrated | Out-Null

& $appcmd list site /name:$SiteName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    if (-not $Force) { throw "El sitio IIS '$SiteName' ya existe. Usa -Force para recrearlo." }
    & $appcmd delete site $SiteName | Out-Null
}
& $appcmd add site /name:$SiteName /physicalPath:$PhysicalPath /bindings:"http/*:${Port}:" | Out-Null
& $appcmd set app "$SiteName/" /applicationPool:$AppPoolName | Out-Null
& icacls.exe $PhysicalPath /grant 'IIS_IUSRS:(OI)(CI)(RX)' /T | Out-Null
& $appcmd start site $SiteName | Out-Null

Write-Ok "IIS configurado en http://localhost:$Port"
Write-Warn 'En Windows Server agrega HTTPS y restringe el firewall antes de exponer el sitio.'
