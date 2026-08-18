# Cloudflare Tunnel en Windows

Baileys no necesita entrada pública; su conexión a WhatsApp es saliente. El túnel sirve para publicar el panel IIS sin abrir puertos del router.

## Prueba temporal

Con `cloudflared.exe` instalado:

```powershell
.\scripts\windows-native\start-quick-tunnel.ps1 -Url http://localhost:8080
```

## Túnel estable administrado

Crea el túnel en el panel de Cloudflare y copia su token. Después, como administrador:

```powershell
.\scripts\windows-native\install-cloudflare-service.ps1 -TunnelToken 'TOKEN_DEL_TUNNEL'
```

Configura el hostname público para apuntar a:

```text
http://localhost:8080
```

En Windows Server, protege el acceso administrativo mediante Cloudflare Access y usa HTTPS de extremo a extremo cuando corresponda.
