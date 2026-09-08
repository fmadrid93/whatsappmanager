# Bitácora de Actualizaciones y Correcciones

## Estado Actual: COMPLETADO Y LISTO PARA PUBLICAR

### Fecha: 08/09/2026
### Incidencia: Desconexión de sesión de WhatsApp al enviar primer mensaje en campañas masivas

---

## 1. Resumen Ejecutivo de la Incidencia

* **Síntoma:** Al disparar cualquier campaña masiva desde `/campaigns`, tras la espera inicial anti-bloqueo (10 a 22 segundos), al momento exacto de despachar el primer mensaje la sesión de WhatsApp se cerraba abruptamente y quedaba en estado `QUARANTINED`, requiriendo revinculación manual.
* **Causa Raíz Directa:**
  En [`backend/src/worker/message-queue-worker.ts`](file:///c:/Users/fmadrid/Documents/whatsappmanager/backend/src/worker/message-queue-worker.ts#L278), la llamada al socket forzaba `{ messageId: item.clientMessageId }`. Dicho ID es un UUID hexadecimal de 32 caracteres generado por el backend (`crypto.randomUUID().replaceAll("-", "")`).
  El protocolo Multi-Device de WhatsApp estipula que los nodos de mensaje enviados por dispositivos vinculados (Web / Baileys) deben respetar el formato estándar de WhatsApp (16-20 caracteres hexadecimales, usualmente con prefijo `3EB0` o `BAE5`). Al recibir un ID de 32 caracteres, los servidores de WhatsApp rechazaban la estrofa con un error de protocolo (`stream:error / bad-request`) y cortaban inmediatamente la conexión WebSocket.
* **Agravante en Cascada:**
  Cuando el socket se cortaba, Baileys emitía `Boom: Session closed`. En [`backend/src/domain/queue/send-error-classifier.ts`](file:///c:/Users/fmadrid/Documents/whatsappmanager/backend/src/domain/queue/send-error-classifier.ts), `"session closed"` estaba clasificado como `SESSION_FATAL`. Esto provocaba que el sistema marcara la sesión como `QUARANTINED` en base de datos, destruyendo el socket en memoria y bloqueando su reconexión.

---

## 2. Archivos Modificados y Cambios Aplicados

### A) `backend/src/worker/message-queue-worker.ts`
* **Línea 240-243:** Se añadió verificación preventiva de conexión en memoria:
  ```ts
  const socket = this.sockets.get(sessionId);
  if (!socket || !socket.user?.id) {
    throw new Error("La sesión no está conectada en memoria.");
  }
  ```
* **Línea 248-259:** Se blindó la resolución de JID para que `onWhatsApp` no bloquee ni descarte destinatarios si falla o se satura el rate-limit de WhatsApp:
  ```ts
  const phoneJid = `${digits}@s.whatsapp.net`;
  try {
    const results = await socket.onWhatsApp(digits);
    const target = results?.find((entry) => entry.exists);
    destinationJid = target?.jid && !target.jid.endsWith("@lid")
      ? target.jid
      : phoneJid;
  } catch {
    destinationJid = phoneJid;
  }
  ```
* **Línea 284:** Se eliminó `{ messageId: item.clientMessageId }` de `socket.sendMessage`:
  ```ts
  // ANTES:
  const sent = await socket.sendMessage(resolvedDestinationJid, { text: payload.text }, { messageId: item.clientMessageId });

  // AHORA:
  const sent = await socket.sendMessage(resolvedDestinationJid, { text: payload.text });
  ```
  Baileys genera de forma nativa el ID compatible (`sent.key.id`, ej. `3EB0...`), el cual se persiste correctamente en `WhatsAppMessage` y se usa para conciliar estados (`SUBMITTED`, `DELIVERY_ACK`, `READ`).

---

### B) `backend/src/application/services/media-reuse.service.ts`
* **Línea 112-115:** Se eliminó `messageId: input.clientMessageId` de `generateWAMessageFromContent`:
  ```ts
  // ANTES:
  const outgoing = generateWAMessageFromContent(input.destinationJid, content, {
    userJid: jidNormalizedUser(socket.user.id),
    messageId: input.clientMessageId,
  });

  // AHORA:
  const outgoing = generateWAMessageFromContent(input.destinationJid, content, {
    userJid: jidNormalizedUser(socket.user.id),
  });
  ```
  Evita que las campañas con imágenes, audios o documentos PDF sufran la misma desconexión.

---

### C) `backend/src/application/services/inbound-message.service.ts`
* **Línea 365:** Se eliminó `{ messageId: this.createMessageId() }` en las respuestas automáticas del bot:
  ```ts
  // ANTES:
  sent = await socket.sendMessage(remoteJid, { text: finalText }, { messageId: this.createMessageId() });

  // AHORA:
  sent = await socket.sendMessage(remoteJid, { text: finalText });
  ```
  Evita que la respuesta del bot a los contactos de la campaña desconecte la sesión de WhatsApp.

---

### D) `backend/src/domain/queue/send-error-classifier.ts`
* **Línea 84-85 & Línea 115-125:** Se movieron `"session closed"` y `"sesion cerrada"` de la categoría `SESSION_FATAL` a la categoría `TRANSIENT`.
  * *Efecto:* Los cierres temporales de socket o reinicios de red se manejarán como reintentos normales con circuit breaker sin forzar a la sesión a entrar en estado `QUARANTINED`.

---

## 3. Guía de Publicación para el Administrador

Para publicar estos cambios en el servidor de producción (Ubuntu AWS / PM2):

1. **Subir los cambios al repositorio:**
   ```bash
   git add backend/src/ actualizacion.md
   git commit -m "fix(campaigns): resolve session disconnect on campaign dispatch and bot replies"
   git push origin main
   ```

2. **En el servidor remoto:**
   ```bash
   cd /ruta/del/proyecto
   git pull origin main
   cd backend
   npm run build
   pm2 restart all  # o pm2 restart wa-worker wa-api
   ```

3. **Verificación post-despliegue:**
   * Crear una campaña de prueba con 2 o 3 números conocidos.
   * Verificar en los logs de PM2 (`pm2 logs wa-worker`) que el mensaje se envía con éxito y que se recibe el ACK `DELIVERY_ACK` sin interrupción de la sesión.
