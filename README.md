# WhatsApp SaaS v1.3.0-alpha — Windows Native SQL Server Edition

Edición diseñada para funcionar sin Docker:

- Desarrollo y validación en Windows 11.
- Despliegue nativo en Windows Server.
- Node.js para API y Worker.
- Microsoft SQL Server 2017 o superior.
- Angular publicado en IIS.
- AWS S3 privado para multimedia.
- Cloudflare Tunnel opcional.

> Estado: alpha. La primera instalación genera una migración baseline específica para SQL Server y debe probarse antes de usar clientes reales.


## Novedades de v1.3.0

- Baileys 7 con QR o código de vinculación y diagnóstico de errores de conexión.
- El número conectado se obtiene de WhatsApp; el número esperado es solo una validación opcional.
- Campañas por carga manual, CSV, XLSX o API externa con variables por contacto.
- Bot Manager multi‑paso con preguntas, variables y condiciones.
- Inicio y detención con un solo clic mediante `INICIAR-TODO.cmd` y `DETENER-TODO.cmd`.

Consulta `docs/V1.3.0-FEATURES.md`.

## Actualización desde v1.2.1

1. Haz backup de SQL Server y conserva tu `.env` fuera del ZIP.
2. Detén la versión anterior.
3. Extrae v1.3.0 en una carpeta nueva y copia tu `.env`.
4. Ejecuta `INSTALL-DEPENDENCIES.cmd`; el backend generará un lockfile nuevo para Baileys 7.
5. Ejecuta `MIGRATE-DATABASE.cmd` para aplicar la migración incremental.
6. Ejecuta `INICIAR-TODO.cmd`.
7. Revincula las sesiones antiguas; no se incluyen credenciales ni datos en este paquete.

## Inicio rápido

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
Get-ChildItem -Recurse -File | Unblock-File
.\scripts\windows-native\check-requirements.ps1
.\scripts\windows-native\configure-environment.ps1 -Mode Mock -OpenEnv
.\scripts\windows-native\install-dependencies.ps1
.\scripts\windows-native\create-database.ps1 -AdminAuthentication Windows
.\scripts\windows-native\migrate-database.ps1
.\scripts\windows-native\start-development.ps1 -SkipMigration
```

Web local: `http://localhost:4200`

API: `http://localhost:3000`

## Documentación

- `docs/windows-native/WINDOWS11-SQLSERVER-QUICKSTART.md`
- `docs/windows-native/WINDOWS-SERVER-DEPLOY.md`
- `docs/windows-native/IIS-SETUP.md`
- `docs/windows-native/CLOUDFLARE-TUNNEL.md`
- `docs/windows-native/TROUBLESHOOTING.md`
