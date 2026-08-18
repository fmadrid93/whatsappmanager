# Conversaciones avanzadas

## Objetivo

Convertir la tabla tecnica de conversaciones en una bandeja de atencion con historial, control Bot/Humano, notas y respuestas manuales.

## Funciones

- Busqueda por nombre, telefono, JID o agente.
- Filtros por sesion, estado y modo de atencion.
- Historial de mensajes entrantes y salientes.
- Mensajes manuales con cola persistente `ConversationOutbox`.
- Estados visibles para respuestas manuales: `PENDING`, `PROCESSING`, `SENT` y `FAILED`.
- Tomar una conversacion y devolverla al bot.
- Asignar o transferir a otro agente activo.
- Cerrar, reabrir y reiniciar el flujo.
- Nombre visible, etiquetas y notas internas.
- Conteo de no leidos y actualizacion automatica.

## Endpoints

- `GET /api/conversations`
- `GET /api/conversations/agents`
- `GET /api/conversations/:id`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `GET|POST /api/conversations/:id/notes`
- `PATCH /api/conversations/:id/profile`
- `POST /api/conversations/:id/mark-read`
- `POST /api/conversations/:id/take-over`
- `POST /api/conversations/:id/assign`
- `POST /api/conversations/:id/release`
- `POST /api/conversations/:id/reset-flow`
- `POST /api/conversations/:id/close`
- `POST /api/conversations/:id/reopen`

## Seguridad operativa

La API no envia directamente desde el proceso HTTP. La respuesta manual se guarda en SQL Server y el Worker conectado a la sesion la envia. Esto evita depender de que la API tenga el socket de Baileys.

Para responder manualmente la conversacion debe estar tomada por un agente, abierta y asociada a una sesion `CONNECTED`.
