#!/bin/bash
# ==============================================================================
# Auto-Update Daemon / Poller para WhatsApp SaaS (AWS EC2)
# Revisa automáticamente si hay nuevos commits en GitHub (origin/main)
# y compila / despliega automáticamente.
# ==============================================================================

REPO_DIR="/var/www/whatsappmanager"
LOCK_FILE="/tmp/whatsapp_autoupdate.lock"
LOG_FILE="$REPO_DIR/autoupdate.log"

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Evitar ejecuciones concurrentes
if [ -f "$LOCK_FILE" ]; then
    # Si el lockfile tiene más de 10 minutos (600s), liberarlo
    LOCK_AGE=$(($(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0)))
    if [ "$LOCK_AGE" -gt 600 ]; then
        rm -f "$LOCK_FILE"
    else
        exit 0
    fi
fi

touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

cd "$REPO_DIR" || exit 1

# Traer últimos cambios de GitHub
git fetch origin main > /dev/null 2>&1

LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null)
REMOTE_HASH=$(git rev-parse origin/main 2>/dev/null)

if [ -n "$LOCAL_HASH" ] && [ -n "$REMOTE_HASH" ] && [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    echo "==================================================================" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 Detectado nuevo push en GitHub!" >> "$LOG_FILE"
    echo "   Commit actual: $LOCAL_HASH" >> "$LOG_FILE"
    echo "   Nuevo commit:  $REMOTE_HASH" >> "$LOG_FILE"

    # 1. Sincronizar repositorio
    git reset --hard origin/main >> "$LOG_FILE" 2>&1
    git clean -fd -e .env -e "backend/.env" -e "ecosystem.config.cjs" >> "$LOG_FILE" 2>&1

    # 2. Compilar backend y prisma
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚙️ Compilando Backend y Prisma..." >> "$LOG_FILE"
    cd "$REPO_DIR/backend" || exit 1
    npx prisma generate >> "$LOG_FILE" 2>&1
    npm run build >> "$LOG_FILE" 2>&1

    # 3. Compilar frontend Angular
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🎨 Compilando Frontend Angular..." >> "$LOG_FILE"
    cd "$REPO_DIR/frontend" || exit 1
    npm run build >> "$LOG_FILE" 2>&1

    # 4. Recargar PM2 sin caídas (Zero-Downtime Reload)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ♻️ Recargando procesos PM2..." >> "$LOG_FILE"
    cd "$REPO_DIR" || exit 1
    pm2 reload ecosystem.config.cjs >> "$LOG_FILE" 2>&1 || pm2 start ecosystem.config.cjs >> "$LOG_FILE" 2>&1
    pm2 save >> "$LOG_FILE" 2>&1

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ ¡Despliegue automático finalizado exitosamente!" >> "$LOG_FILE"
fi
