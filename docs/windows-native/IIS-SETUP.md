# Publicar Angular y Express mediante IIS

IIS sirve los archivos Angular. URL Rewrite y Application Request Routing reenvían `/api`, `/health`, `/version` y `/metrics` hacia Express en `127.0.0.1:3000`.

## Componentes necesarios

- IIS.
- IIS Management Console.
- URL Rewrite 2.
- Application Request Routing (ARR).

URL Rewrite y ARR no siempre vienen incluidos como características de Windows; instálalos antes de ejecutar el script.

## Compilar

```powershell
.\scripts\windows-native\build-application.ps1
```

## Configurar sitio local en puerto 8080

Abre PowerShell como administrador:

```powershell
.\scripts\windows-native\configure-iis.ps1 -Port 8080 -Force
```

Abre:

```text
http://localhost:8080
```

## Windows Server

Para puerto 80:

```powershell
.\scripts\windows-native\configure-iis.ps1 -Port 80 -Force
```

Para HTTPS, agrega un certificado en IIS y crea un binding HTTPS. No publiques el puerto 3000 de Express al exterior.
