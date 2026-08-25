#!/bin/bash
set -e

echo "🚀 1. Descargando cambios de Git..."
cd /var/www/whatsappmanager
git reset --hard HEAD
git clean -fd
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
