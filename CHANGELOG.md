# Changelog

## 1.3.0-alpha — Windows SQL Server, Baileys 7 y flujos avanzados

- Migración del gateway a `@whiskeysockets/baileys` 7.0.0-rc13.
- Sesiones con método QR o código de vinculación, número esperado opcional y número real detectado al conectar.
- Diagnóstico persistente de conexión, estado `PAIRING_FAILED` y manejo explícito del rechazo 405.
- Eliminación lógica de sesiones y limpieza de credenciales al revincular.
- Importación de contactos desde CSV y XLSX sin subir el archivo al servidor.
- Previsualización, deduplicación, reporte de filas inválidas y variables por columna.
- Plantillas por contacto como `{{nombre}}`, `{{telefono}}`, `{{saldo}}` y columnas adicionales.
- Endpoint `POST /api/integrations/campaigns` protegido con API key e idempotencia.
- Bot Manager secuencial con disparadores, mensajes, preguntas, variables, condiciones y finalización.
- Persistencia del estado de cada conversación para flujos de varios turnos.
- Consolidación de las correcciones de SQL Server, Prisma, PowerShell 5.1, TypeScript 5.9 y login.
- Eliminación de reparadores temporales del paquete final.
