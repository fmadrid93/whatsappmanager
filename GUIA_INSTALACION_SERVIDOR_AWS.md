# 🚀 Guía de Instalación y Despliegue de Servidor WhatsApp SaaS (Ubuntu 24.04 LTS en AWS EC2)

Esta guía documenta paso a paso cómo crear y configurar un servidor exactamente igual a `principal.liberales26.com` (`52.202.57.2`), con **Node.js 22 LTS, Redis, PM2, Nginx con SSL (Certbot), Angular Frontend y Baileys WhatsApp Gateway**.

---

## 📋 Requisitos Previos en AWS

1. **Instancia EC2**:
   - **Sistema Operativo**: `Ubuntu Server 24.04 LTS (HVM), SSD Volume Type` (64-bit x86).
   - **Tipo de Instancia Recomendado**: `t3.small` o `t3.medium` (mínimo 2GB - 4GB RAM).
   - **Almacenamiento**: Mínimo `25 GB` gp3.
   - **Par de Claves**: Descargar tu llave `.pem` (ej. `paraguay.pem`).
2. **Grupo de Seguridad (Security Group - Reglas de Entrada)**:
   - `SSH` (Puerto 22): Tu IP o `0.0.0.0/0`.
   - `HTTP` (Puerto 80): `0.0.0.0/0`.
   - `HTTPS` (Puerto 443): `0.0.0.0/0`.
3. **Dominio DNS**:
   - Apuntar un registro `A` de tu subdominio (ej. `principal.liberales26.com`) hacia la **IP Pública** de la instancia EC2.

---

## 🛠️ Paso 1: Conexión SSH y Memoria Swap

Conéctate desde tu terminal local:
```bash
ssh -i "ruta/a/tu/llave.pem" ubuntu@<IP_PUBLICA_EC2>
```

Crea 2GB de memoria Swap para evitar caídas por falta de memoria RAM:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## 📦 Paso 2: Instalación de Paquetes Base (Node.js 22, Redis, Nginx, PM2)

Ejecuta el siguiente bloque de comandos:

```bash
# 1. Actualizar el sistema
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget unzip build-essential nginx certbot python3-certbot-nginx redis-server

# 2. Configurar y activar Redis Local
sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sudo sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf
sudo systemctl enable redis-server
sudo systemctl restart redis-server
redis-cli ping # Debe responder PONG

# 3. Instalar Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Instalar PM2 y TypeScript globalmente
sudo npm install -g pm2 tsx typescript
```

---

## 📂 Paso 3: Clonar el Repositorio y Permisos

```bash
# Crear directorio del proyecto
sudo mkdir -p /var/www/whatsappmanager
sudo chown -R ubuntu:ubuntu /var/www/whatsappmanager
git config --global --add safe.directory /var/www/whatsappmanager

# Clonar el proyecto
git clone https://github.com/fmadrid93/whatsappmanager.git /var/www/whatsappmanager
cd /var/www/whatsappmanager
```

---

## ⚙️ Paso 4: Configurar Variables de Entorno (`.env`)

Crea el archivo `/var/www/whatsappmanager/.env`:

```bash
nano /var/www/whatsappmanager/.env
```

Pega el siguiente contenido (ajustando tus credenciales de base de datos):

```env
NODE_ENV=development
DEPLOYMENT_ENV=aws-ec2
APP_VERSION=1.3.1
BUILD_COMMIT=production
DOMAIN=localhost
API_PORT=3000
LOG_LEVEL=info

# SQL Server Central
SQLSERVER_HOST=db.contactmanager.net
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=whatsapp_saas
SQLSERVER_APP_USER=ti
SQLSERVER_APP_PASSWORD=selectov2
SQLSERVER_ENCRYPT=true
SQLSERVER_TRUST_SERVER_CERTIFICATE=true
SQLSERVER_SCHEMA=dbo
DATABASE_URL="sqlserver://db.contactmanager.net:1433;database=whatsapp_saas;user=ti;password=selectov2;encrypt=true;trustServerCertificate=true;schema=dbo;connection_limit=10;pool_timeout=60"
PRISMA_PROVIDER=sqlserver

# Región y Normalización Telefónica E.164 (Google Libphonenumber)
DEFAULT_COUNTRY_REGION=PY
# Ejemplos: PY (Paraguay +595), BO (Bolivia +591), AR (Argentina +54), US (USA +1)

# Redis Local (0ms de latencia)
COORDINATION_PROVIDER=REDIS
REDIS_URL=redis://127.0.0.1:6379
EVENT_TRANSPORT=LOCAL
REDIS_KEY_PREFIX=waas

# Seguridad y Autenticación
JWT_SECRET=6d5b4c5ec7cadd7a4e48ce020a5f388d22034f2418065d0abc26477eb0c03c53e1bfffa4b9bcc0fb491dbdf996d449ed
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_DAYS=30
COOKIE_SECURE=true
CORS_ORIGINS=*
TRUST_PROXY=1
ENCRYPTION_KEY_BASE64=7G/6mlrsM7teGm46hpGBjUqEjVSGFM1XSErbBKIrHqM=
INTEGRATION_API_KEY=clave-secreta-integracion-1x10

# Modo Baileys y Workers
WHATSAPP_GATEWAY_MODE=BAILEYS
OBJECT_STORAGE_MODE=MOCK
WORKER_ID=ec2-worker-1
SESSION_LEASE_SECONDS=30
SESSION_SUPERVISOR_INTERVAL_MS=5000
QUEUE_POLL_INTERVAL_MS=1000
QUEUE_LOCK_SECONDS=60
SEND_DELAY_MIN_MS=2500
SEND_DELAY_MAX_MS=5000
DEFAULT_MAX_SESSIONS=60

# Proxy Residencial (Opcional)
PROXY_URL=http://spi7impg8h:o72a5b9gLpyIb~JqGq@gate.decodo.com:10001
```

---

## 🏗️ Paso 5: Compilación de Backend y Frontend

```bash
# 1. Compilar Backend
cd /var/www/whatsappmanager/backend
npm install --production=false
npx prisma generate
npm run build

# 2. Compilar Frontend Angular
cd /var/www/whatsappmanager/frontend
npm install --production=false
npm run build
```

---

## 🌐 Paso 6: Configurar Nginx y Certificado SSL (HTTPS)

1. Crear la configuración de Nginx:
```bash
sudo rm -f /etc/nginx/sites-enabled/default

sudo tee /etc/nginx/sites-available/whatsapp-node << 'EOF'
limit_req_zone $binary_remote_addr zone=wa_limit:10m rate=40r/s;

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name principal.liberales26.com _; # <-- Reemplaza por tu dominio

    client_max_body_size 50M;

    # 1. Frontend Angular (Panel Web)
    root /var/www/whatsappmanager/frontend/dist/whatsapp-saas-web/browser;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 2. Backend API y WebSockets para Baileys
    location ~ ^/(api|sessions|session|messages|auth|campaigns|health|metrics) {
        limit_req zone=wa_limit burst=60 nodelay;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/whatsapp-node /etc/nginx/sites-enabled/whatsapp-node
sudo nginx -t
sudo systemctl reload nginx
```

2. Generar Certificado SSL Gratuito con Let's Encrypt:
```bash
sudo certbot --nginx -d principal.liberales26.com --non-interactive --agree-tos -m admin@liberales26.com
```

---

## 🚀 Paso 7: Configuración de PM2 y Auto-Arranque

1. Configurar `/var/www/whatsappmanager/ecosystem.config.cjs`:
```bash
tee /var/www/whatsappmanager/ecosystem.config.cjs << 'EOF'
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
      env: {
        PORT: 3000,
      },
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
EOF
```

2. Iniciar y guardar los servicios:
```bash
cd /var/www/whatsappmanager
pm2 start ecosystem.config.cjs
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

---

## 🔄 Paso 8: Script de Actualización Rápida en 1 Línea

Para que cualquier desarrollador o tú puedan actualizar el servidor en 1 solo comando:

1. Crear `/var/www/whatsappmanager/actualizar.sh`:
```bash
tee /var/www/whatsappmanager/actualizar.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 1. Descargando cambios de Git..."
cd /var/www/whatsappmanager
git checkout .
git pull origin main

echo "⚙️ 2. Compilando Backend..."
cd /var/www/whatsappmanager/backend
npm install --production=false
npx prisma generate
npm run build

echo "🎨 3. Compilando Frontend Angular..."
cd /var/www/whatsappmanager/frontend
npm install --production=false
npm run build

echo "♻️ 4. Reiniciando servicios PM2..."
cd /var/www/whatsappmanager
pm2 reload ecosystem.config.cjs || pm2 start ecosystem.config.cjs
pm2 save

echo "✅ ¡Servidor actualizado y 100% operativo!"
EOF

chmod +x /var/www/whatsappmanager/actualizar.sh
```

---

## 🔑 Credenciales de Acceso Inicial

- **Panel Web**: `https://<TU_DOMINIO>/`
- **Usuario Administrador**: `admin@demo.local`
- **Contraseña**: `Admin2026!`
- **API Key de Integración**: `clave-secreta-integracion-1x10`

*(Para cambiar la contraseña del admin por consola)*:
```bash
cd /var/www/whatsappmanager/backend
node --env-file=/var/www/whatsappmanager/.env scripts/cambiar-clave-admin.mjs admin@demo.local NuevaClave123!
```
