# Windows 11 + SQL Server — inicio rápido

## Requisitos

- Node.js 22 LTS.
- npm.
- Microsoft SQL Server 2017 o superior ya instalado.
- `sqlcmd.exe`.
- Python opcional para validadores.
- AWS CLI únicamente al activar S3 real.

## 1. Identificar la instancia

```powershell
Get-Service | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' }
```

- `MSSQLSERVER`: instancia predeterminada; usa host `localhost`, instancia vacía y puerto `1433`.
- `MSSQL$SQLEXPRESS`: usa host `localhost`, instancia `SQLEXPRESS` y deja el puerto vacío.

## 2. Preparar el proyecto

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
Get-ChildItem -Recurse -File | Unblock-File
.\scripts\windows-native\check-requirements.ps1
```

## 3. Crear `.env`

Instancia predeterminada:

```powershell
.\scripts\windows-native\configure-environment.ps1 `
  -Mode Mock `
  -SqlServerHost localhost `
  -SqlServerPort 1433 `
  -OpenEnv
```

SQL Express:

```powershell
.\scripts\windows-native\configure-environment.ps1 `
  -Mode Mock `
  -SqlServerHost localhost `
  -SqlServerInstance SQLEXPRESS `
  -OpenEnv
```

Guarda la contraseña web, la contraseña SQL y `ENCRYPTION_KEY_BASE64`.

## 4. Instalar dependencias

```powershell
.\scripts\windows-native\install-dependencies.ps1
```

## 5. Crear login y base

Abre PowerShell con una cuenta administradora de SQL Server y ejecuta:

```powershell
.\scripts\windows-native\create-database.ps1 -AdminAuthentication Windows
```

Si tu usuario de Windows no es administrador de SQL Server:

```powershell
.\scripts\windows-native\create-database.ps1 `
  -AdminAuthentication Sql `
  -SqlAdminUser sa
```

## 6. Generar y aplicar baseline

```powershell
.\scripts\windows-native\migrate-database.ps1
```

La primera ejecución genera SQL compatible con SQL Server desde `schema.prisma`, lo aplica y crea el administrador web.

## 7. Iniciar

```powershell
.\scripts\windows-native\start-development.ps1 -SkipMigration
```

Abre `http://localhost:4200`.
