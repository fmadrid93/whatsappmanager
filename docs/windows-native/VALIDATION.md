# Validación v1.3.0-alpha SQL Server

## Validaciones realizadas al paquete fuente

- Estructura de 25 scripts PowerShell: PASS.
- Cadena de migraciones SQL Server: PASS, dos migraciones y 27 tablas Prisma.
- Sintaxis TypeScript: 122 archivos analizados sin errores de parseo.
- JSON y YAML: PASS.
- Ausencia de `.env`, contraseñas, `node_modules`, logs y backups: PASS.
- Integridad ZIP y manifiesto SHA-256: se verifican al empaquetar.

## Validaciones que deben ejecutarse en Windows

El paquete fuente no incluye `backend/package-lock.json`, porque la dependencia Baileys cambió a v7 y el lockfile debe generarse contra el registro npm. `INSTALL-DEPENDENCIES.cmd` ejecuta `npm install` en backend, genera el lockfile y usa `npm ci` en frontend.

Después de instalar:

```powershell
.\scripts\windows-native\migrate-database.ps1
.\scripts\windows-native\build-application.ps1 -SkipInstall
.\INICIAR-TODO.ps1
.\VER-ESTADO.ps1
```

No se debe declarar producción aprobada hasta probar una sesión real, mensajes entrantes/salientes, importación XLSX/CSV, API externa, flujo multi‑turno, backup y restauración en el Windows Server objetivo.
