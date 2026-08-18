# Actualizar desde v1.2.1 sin repetir la instalación

## Antes de empezar

1. Cierra la aplicación con `DETENER-TODO.cmd`.
2. Haz un backup de `whatsapp_saas`.
3. Copia tu archivo `.env` a un lugar seguro.
4. No copies `node_modules`, logs, backups ni reparadores antiguos.

## Actualización

1. Extrae v1.3.0 en una carpeta nueva, por ejemplo `D:\proyectos\whatsappsaas-v130`.
2. Copia tu `.env` a la raíz de la carpeta nueva.
3. Verifica estas variables:

```env
PRISMA_PROVIDER=sqlserver
WHATSAPP_GATEWAY_MODE=BAILEYS
OBJECT_STORAGE_MODE=MOCK
S3_BUCKET=mock-local-bucket
```

4. Ejecuta `INSTALL-DEPENDENCIES.cmd`.
5. Ejecuta `MIGRATE-DATABASE.cmd`. No uses `-RegenerateBaseline` sobre una base existente.
6. Ejecuta `BUILD-APPLICATION.cmd`.
7. Ejecuta `INICIAR-TODO.cmd`.
8. Confirma el estado con `VER-ESTADO.cmd`.

## Sesiones antiguas

Baileys 7 cambia estructuras internas de autenticación y LID. La ruta segura es revincular las sesiones existentes. Crea o revincula una sesión y escanea el QR/código desde un número autorizado.

## API externa opcional

Agrega una clave nueva de mínimo 24 caracteres:

```env
INTEGRATION_API_KEY=CAMBIA_ESTA_CLAVE_LARGA
INTEGRATION_ADMIN_EMAIL=admin@demo.local
```

No publiques ni envíes tu `.env`.
