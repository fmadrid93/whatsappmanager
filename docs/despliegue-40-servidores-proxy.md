# Despliegue a 40 servidores — proxy Decodo y anti-baneo

Contexto: el mismo proyecto (whatsappmanager) se va a publicar en **40 servidores**,
uno por municipio, cada uno con **entre 300 y 2000 sesiones de WhatsApp**, todos
usando **la misma cuenta de Decodo**. Total estimado: ~30.000 sesiones (no 80.000).

## Por qué no alcanza con 1 IP fija para todos

- Todas las sesiones de un servidor saliendo por la misma IP = patrón de "farm",
  fácil de detectar.
- Pedir una IP residencial distinta por cada sesión tampoco es viable: el pool
  de IPs residenciales de Decodo en Paraguay probablemente no tiene 30.000 IPs
  distintas disponibles.

## Solución implementada: agrupar sesiones por IP ("bucket"), no 1 a 1

Cada sesión de WhatsApp se asigna, de forma **estable** (siempre la misma sesión
→ el mismo bucket, no cambia en reconexiones), a un balde de un tamaño fijo
configurado por servidor. Todas las sesiones de un balde comparten la misma IP
residencial (sticky session de Decodo), simulando varias personas compartiendo
un mismo wifi hogareño — realista para Paraguay.

Implementado en:
- [`backend/src/infrastructure/whatsapp/proxy-fingerprint.util.ts`](../backend/src/infrastructure/whatsapp/proxy-fingerprint.util.ts)
  — `hashToBucket()` y `buildProxyAgent()`.
- Enchufado en [`backend/src/infrastructure/whatsapp/baileys-session-gateway.ts`](../backend/src/infrastructure/whatsapp/baileys-session-gateway.ts).
- También se varía el "fingerprint" del dispositivo (SO + navegador) por sesión
  con `pickBrowserFingerprint()` — antes todas las sesiones se anunciaban como
  el mismo `Mac OS / Chrome`, lo cual es una señal de bot tan fuerte como
  compartir IP.

## Variables de entorno nuevas (en el `.env` de cada servidor)

| Variable | Qué hace | Default si no se setea |
|---|---|---|
| `PROXY_URL` | URL del proxy Decodo (`http://usuario:clave@gate.decodo.com:puerto`) | sin proxy |
| `PROXY_IP_BUCKET_COUNT` | Cantidad de "IPs virtuales" a repartir entre las sesiones de ESE servidor | sin setear = sin agrupar (cada conexión pide IP libre, comportamiento viejo) |
| `PROXY_STICKY_MINUTES` | Minutos de sticky-session que se le piden a Decodo | 30 |

**Objetivo: 5-8 sesiones por IP.** Fórmula: `PROXY_IP_BUCKET_COUNT ≈ sesiones_del_servidor / 6`.

| Sesiones del servidor | `PROXY_IP_BUCKET_COUNT` sugerido | IPs residenciales usadas (aprox) |
|---|---|---|
| 300 | 50 | 50 |
| 500 | 80-85 | ~80 |
| 1000 | 165 | ~165 |
| 1500 | 250 | ~250 |
| 2000 | 330 | ~330 |

## Checklist al configurar cada servidor nuevo

1. Copiar `.env` con `PROXY_URL` (misma cuenta Decodo para todos).
2. Calcular `PROXY_IP_BUCKET_COUNT` según la cantidad de sesiones que va a tener
   ESE municipio (tabla de arriba).
3. **`DEFAULT_MAX_SESSIONS`** — el default de fábrica es **5**. Sin tocarlo, el
   servidor nuevo rechaza toda sesión a partir de la #6 (error 429 "El tenant
   alcanzó el límite de sesiones"). Setearlo en el `.env` a un valor con
   margen sobre el máximo real de ese municipio (ej. `DEFAULT_MAX_SESSIONS=2500`
   cubre cualquier servidor de hasta 2000 sesiones). Esto solo aplica el
   default la PRIMERA vez que se crea el tenant en ese servidor (vía upsert
   lazy) — si el tenant ya existe con un límite viejo, hay que actualizar a
   mano la fila en `TenantCapacityPolicy.maxSessions` (columna en la tabla,
   no hace falta reiniciar nada, se lee en cada request).
4. `pm2 reload whatsapp-api whatsapp-worker` (o reload individual de cada uno —
   ojo que `pm2 reload a b` en una sola línea a veces solo aplica al primero,
   conviene hacer los dos reloads por separado y confirmar con `pm2 list` que
   ambos PIDs cambiaron).
5. Verificar en el pool real de Decodo (con su ejecutivo de cuenta) que da
   abasto para la suma de IPs simultáneas de los 40 servidores juntos, no solo
   por servidor individual.

## ⚠️ IMPORTANTE — verificar antes de volver a activar `PROXY_IP_BUCKET_COUNT`

El 2026-08-29 se activó `PROXY_IP_BUCKET_COUNT` en el servidor de referencia y **rompió la conexión de WhatsApp por completo** (ningún QR se generaba, silenciosamente, sin error visible). Causa: el sufijo de sticky-session (`-session-bucket<N>-sessionduration-<min>`) que se le agrega al usuario del proxy está basado en la documentación general de Decodo, pero **no está confirmado que el puerto/cuenta actual (`gate.decodo.com:10001`) lo soporte** — probado con `curl` directo: sin el sufijo conecta en 0.4s, con el sufijo se cuelga y falla.

Se revirtió (variable sacada del `.env`) y la conexión volvió a funcionar normal.

**Antes de volver a setear `PROXY_IP_BUCKET_COUNT` en cualquier servidor**, confirmar con Decodo:
1. El formato exacto de sticky-session para esta cuenta/plan (puede que haga falta otro puerto, no el 10001).
2. Probarlo primero con `curl --proxy "http://usuario-session-bucket1-sessionduration-30:clave@gate.decodo.com:PUERTO" https://ifconfig.me` desde el servidor — si no da `200` rápido, no activar.

## Estado actual (servidor de referencia, 52.202.57.2)

- Configurado para **300 sesiones** → `PROXY_IP_BUCKET_COUNT=50`.
- `DEFAULT_MAX_SESSIONS=2500` en el `.env`, y el tenant único de este servidor
  ("Empresa Demo") tiene `TenantCapacityPolicy.maxSessions=2500` (se subió a
  mano porque el tenant ya existía con el límite viejo, 60).
- Este es el ÚNICO servidor configurado hasta ahora (2026-08-29). Los otros 39
  todavía no existen.

## Riesgos que quedan fuera del código (hay que gestionarlos operativamente)

- **Blast radius**: no agrupar a propósito a todo el equipo de un mismo
  Gerente en el mismo bucket — si esa IP se marca, no debería caerse un equipo
  entero de una sola vez.
- **Contenido idéntico**: variar levemente el texto del mensaje entre lotes
  grandes de envío, no mandar el carácter por carácter idéntico desde miles de
  números en la misma ventana de tiempo.
- **Arranque escalonado**: no levantar las sesiones nuevas de los 40 servidores
  todas al mismo tiempo — escalonarlo.
- **Capacidad real del pool de Decodo en Paraguay**: confirmar con Decodo que
  soportan las ~5.000-6.000 IPs simultáneas que hacen falta para 30.000
  sesiones a 5-6 por IP.
