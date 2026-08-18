# Despliegue en Windows Server con SQL Server

## Arquitectura

- IIS sirve Angular y proxifica `/api`, `/health` y `/version` hacia `127.0.0.1:3000`.
- API y Worker funcionan como servicios Windows mediante WinSW.
- SQL Server puede estar en el mismo servidor o en un servidor dedicado.
- S3 permanece privado.

## Pasos

1. Copia el proyecto a `C:\Apps\WhatsAppSaaS`.
2. Configura `.env` con `NODE_ENV=production`, SQL Server, S3 y secretos.
3. Ejecuta como administrador:

```powershell
.\scripts\windows-native\check-requirements.ps1 -RequireIIS -RequireAws
.\scripts\windows-native\install-dependencies.ps1
.\scripts\windows-native\create-database.ps1 -AdminAuthentication Windows
.\scripts\windows-native\migrate-database.ps1
.\scripts\windows-native\build-application.ps1 -SkipInstall
.\scripts\windows-native\configure-iis.ps1 -Port 80 -Force
.\scripts\windows-native\install-windows-services.ps1 -StartServices
```

4. Comprueba:

```powershell
Get-Service WhatsAppSaaS.Api,WhatsAppSaaS.Worker
.\scripts\windows-native\check-health.ps1
```

## Seguridad

- En producción usa `encrypt=true` y certificado SQL Server confiable.
- Evita exponer SQL Server a Internet.
- Restringe `.env` a administradores y cuentas de servicio.
- Respalda `ENCRYPTION_KEY_BASE64` fuera del servidor.
- Prueba `backup-sqlserver.ps1` y `restore-sqlserver.ps1` antes de aceptar clientes.
