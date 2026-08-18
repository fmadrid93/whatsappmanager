# Integraciones administrables

## Modulos

### Estado del sistema

Muestra el diagnostico de SQL Server, almacenamiento, Workers y sesiones, junto con contadores de API keys, webhooks y peticiones externas.

### API keys

- Claves administradas por tenant.
- Hash SHA-256; la clave completa se muestra una sola vez.
- Permisos `CAMPAIGN_CREATE` y `CAMPAIGN_STATUS`.
- Vencimiento, ultimo uso y revocacion.
- Compatibilidad temporal con la clave antigua del archivo `.env`.

### Webhooks

- Secret HMAC cifrado.
- Firma `sha256` con timestamp.
- Cola persistente en SQL Server.
- Reintentos progresivos y estado de entrega.
- Prueba, desactivacion y reencolado manual.

### Historial

Registra endpoint, metodo, codigo HTTP, duracion, Request ID, idempotency key, IP y error.

## Endpoints externos

- `POST /api/integrations/campaigns`
- `GET /api/integrations/campaigns/:id`

Cabecera recomendada:

```text
X-Integration-Key: wsk_live_...
```

## Eventos webhook

- `WEBHOOK_TEST`
- `INTEGRATION_CAMPAIGN_CREATED`
- `CAMPAIGN_CREATED`
- `CAMPAIGN_STARTED`
- `CAMPAIGN_PAUSED`
- `CAMPAIGN_RESUMED`
- `CAMPAIGN_CANCELLED`
- `MESSAGE_SENT`
- `MESSAGE_FAILED`
- `SESSION_QUARANTINED`
- `AUTOMATIC_FAILOVER_EXECUTED`
