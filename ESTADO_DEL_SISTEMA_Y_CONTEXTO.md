# 🧠 ESTADO DEL SISTEMA, ARQUITECTURA Y CONTEXTO MAESTRO (WhatsApp SaaS & Ecosistema 1x10)

> **Documento de Continuidad Operativa**: Este archivo contiene todo el contexto, credenciales, arquitectura, optimizaciones aplicadas y estado de infraestructura para que cualquier sesión de IA o desarrollador continúe el trabajo de inmediato sin perder información previa.

---

## 🌐 1. Servidor de Producción AWS EC2 (Nodo Maestro Actual)

| Parámetro | Valor / Configuración |
| :--- | :--- |
| **IP Pública** | `52.202.57.2` |
| **Dominio con SSL** | `https://principal.liberales26.com/` |
| **Sistema Operativo** | Ubuntu 24.04 LTS (HVM), SSD Volume Type |
| **Usuario SSH** | `ubuntu` |
| **Ruta Llave SSH Local** | `D:\Users\fmadrid\Downloads\paraguay.pem` |
| **Comando de Conexión** | `ssh -i D:\Users\fmadrid\Downloads\paraguay.pem ubuntu@52.202.57.2` |
| **Ruta del Proyecto en Servidor**| `/var/www/whatsappmanager` |
| **Panel Web SaaS (Login)** | `admin@demo.local` / `Admin2026!` |
| **API Key de Integración** | `clave-secreta-integracion-1x10` |

---

## 🗄️ 2. Base de Datos Central y Redis

### SQL Server Central
- **Host / Puerto**: `db.contactmanager.net,1433`
- **Usuario**: `ti`
- **Contraseña**: `selectov2`
- **Base de Datos WhatsApp SaaS**: `whatsapp_saas` (Prisma ORM)
- **Base de Datos Campaña / Encuestas**: `AppCampana1x10` (.NET Core 8)
- **Cadena de Conexión Optimizada**:
  ```env
  DATABASE_URL="sqlserver://db.contactmanager.net:1433;database=whatsapp_saas;user=ti;password=selectov2;encrypt=true;trustServerCertificate=true;schema=dbo;connection_limit=10;pool_timeout=60"
  ```
  *(Límite de 10 conexiones por worker para permitir hasta 60 servidores sin saturar los worker threads de SQL Server).*

### Redis Local (En cada nodo)
- **Host**: `127.0.0.1:6379` (0 ms de latencia)
- **Modo**: `COORDINATION_PROVIDER=REDIS`
- **Key Prefix**: `waas`

---

## ⚙️ 3. Servicios PM2 y Configuración en Servidor

En cada servidor corren 3 procesos administrados por PM2:
1. **`whatsapp-api`** (Puerto `3000`): API REST y WebSockets para Baileys y panel web.
2. **`whatsapp-worker`** (Puerto Métricas `9464`): Worker supervisor de sesiones, colas y despachos masivos.
3. **`pm2-logrotate`**: Módulo para rotación automática de logs (10 MB máx., 7 archivos retenidos comprimidos).

### Archivo `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    {
      name: 'whatsapp-api',
      script: './backend/dist/api/main.js',
      cwd: '/var/www/whatsappmanager',
      node_args: '--env-file=/var/www/whatsappmanager/.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: { PORT: 3000 },
    },
    {
      name: 'whatsapp-worker',
      script: './backend/dist/worker/main.js',
      cwd: '/var/www/whatsappmanager',
      node_args: '--env-file=/var/www/whatsappmanager/.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
```

---

## ⚡ 4. Optimizaciones Críticas de Rendimiento Aplicadas

1. **Eliminación del Cuello de Botella de Estadísticas de Campaña**:
   - **Antes**: Se ejecutaban 6 consultas pesadas síncronas (`COUNT(*)` sobre 50.000 filas) tras cada mensaje.
   - **Ahora**: Se actualiza de forma atómica instantánea (`incrementSent` / `incrementFailed`) y se consolida con *Debounce* en memoria cada 6 segundos.
2. **Limpieza Estricta de Memoria en Sockets Baileys**:
   - En `baileys-session-gateway.ts`, se eliminan explícitamente los listeners de eventos (`ev.removeAllListeners()` y `ws.removeAllListeners()`) al cerrar o reiniciar sockets (error 515 `restartRequired`), evitando fugas de memoria RAM.
3. **Compresión GZIP en Nginx**:
   - Habilitado `gzip` nivel 6 en Nginx para acelerar hasta 4 veces la carga del frontend Angular en navegadores y celulares.
4. **Normalización Telefónica E.164 Inteligente**:
   - Motor: `google-libphonenumber`.
   - Variable de entorno: `DEFAULT_COUNTRY_REGION=PY` (configurable a `BO`, `AR`, `US`, etc.).
   - Limpia ceros erróneos, antepone prefijo nacional si falta y respeta prefijos internacionales existentes.
5. **Anti-Baneo con Retardo Aleatorio (*Jitter*)**:
   - Pausa aleatoria entre `2500ms` y `5000ms` por sesión de WhatsApp (`randomBetween(SEND_DELAY_MIN_MS, SEND_DELAY_MAX_MS)`).

---

## 📱 5. Integración con la App Móvil Flutter (`1x10futter`)

El archivo [`whatsapp_service.dart`](file:///d:/proyectos/git/1x10futter/lib/data/services/whatsapp_service.dart) en Flutter se comunica de forma nativa con los siguientes endpoints:

| Acción en Flutter | Método | Endpoint Backend |
| :--- | :--- | :--- |
| **Detectar IP Pública** | `GET` | `/system/public-ip` |
| **Listar Sesiones de Usuario** | `GET` | `/sessions?userId={id}&username={user}&role={rol}` |
| **Obtener Estado de Sesión** | `GET` | `/session/{sessionId}/status` |
| **Obtener Código QR** | `GET` | `/session/{sessionId}/qr` *(devuelve QR en Base64)* |
| **Vincular por Código Numérico** | `POST` | `/session/{sessionId}/pairing-code` |
| **Enviar Mensaje Individual / Difusión**| `POST`| `/session/{sessionId}/send` `{"to": "...", "message": "..."}` |
| **Crear Campaña Masiva** | `POST` | `/campaigns` |

---

## 🛠️ 6. Comandos de Gestión y Mantenimiento

### Actualizar el servidor en 1 línea:
```bash
ssh -i D:\Users\fmadrid\Downloads\paraguay.pem ubuntu@52.202.57.2 "/var/www/whatsappmanager/actualizar.sh"
```
*(El script ejecuta `git reset --hard`, `git clean -fd`, `git pull`, compila Backend y Frontend y recarga PM2 sin caída del servicio).*

### Ver logs en tiempo real:
```bash
ssh -i D:\Users\fmadrid\Downloads\paraguay.pem ubuntu@52.202.57.2 "pm2 logs"
```

### Verificar salud del servidor:
```bash
curl https://principal.liberales26.com/health/ready
# Respuesta esperada: {"status":"ready","checks":{"database":"ok","s3":"ok"},"version":"1.3.0-alpha"}
```

---

## 📁 7. Estructura de Proyectos en el Espacio de Trabajo Local

- `d:\proyectos\git\whatsappmanager`: Backend (Node.js/Prisma/Baileys) y Frontend (Angular 19/PrimeNG).
- `d:\proyectos\git\1x10futter`: Aplicación móvil en Flutter con módulo de difusión y vinculación QR.
- `d:\proyectos\git\1x10apinetcore`: API Backend en .NET Core 8 con validación de roles y estructura jerárquica.
- `d:\proyectos\git\encuesta2`: Sistema web de encuestas electorales.
- `d:\proyectos\git\GUIA_INSTALACION_SERVIDOR_AWS.md`: Guía paso a paso para duplicar servidores en nuevas IPs.
- `d:\proyectos\git\ESTADO_DEL_SISTEMA_Y_CONTEXTO.md`: Este archivo maestro de contexto.
