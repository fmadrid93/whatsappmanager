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
