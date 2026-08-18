# Solución de problemas — SQL Server

## No encuentra `sqlcmd.exe`

```powershell
Get-Command sqlcmd.exe
```

Instala Microsoft sqlcmd o las herramientas de línea de comandos de SQL Server y abre otra terminal.

## No detecta la instancia

```powershell
Get-Service | Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' }
```

Usa `SQLSERVER_INSTANCE=SQLEXPRESS` si el servicio es `MSSQL$SQLEXPRESS`.

## Error de conexión TCP

Habilita TCP/IP en SQL Server Configuration Manager, reinicia el servicio y confirma el puerto configurado. Para SQL Express con instancia nombrada puedes usar el nombre de instancia en vez de un puerto fijo.

## Error de certificado

Para desarrollo local usa:

```dotenv
SQLSERVER_ENCRYPT=true
SQLSERVER_TRUST_SERVER_CERTIFICATE=true
```

En producción instala un certificado confiable y cambia `trustServerCertificate=false`.

## Error de inicio de sesión SQL

Confirma que SQL Server permita autenticación mixta y vuelve a ejecutar `create-database.ps1`. También puedes conectarte como administrador mediante autenticación de Windows.

## Error en la baseline

Borra solo la base vacía de pruebas, elimina la carpeta:

```text
backend\prisma\migrations\20260726000000_sqlserver_baseline
```

Luego ejecuta de nuevo:

```powershell
.\scripts\windows-native\migrate-database.ps1 -RegenerateBaseline
```
