# Failover automático controlado

## Objetivo

Mantener una campaña en ejecución cuando una sesión sufre una falla técnica, sin transferir automáticamente los mensajes cuando WhatsApp bloquea, limita o cierra la cuenta.

## Comportamiento

### Falla técnica

Ejemplos: timeout, caída de red o desconexión no intencional.

1. El sistema localiza los mensajes `PENDING` y `PROCESSING` asignados a la sesión afectada.
2. Busca otras sesiones de la misma campaña que estén `CONNECTED` y con lease vigente.
3. Divide los pendientes entre hasta `AUTO_FAILOVER_MAX_TARGETS` sesiones.
4. Conserva los mensajes `SENT`; nunca se vuelven a colocar en cola.
5. Los mensajes transferidos quedan disponibles después de `AUTO_FAILOVER_WAIT_SECONDS`.
6. Si no existe reemplazo, la campaña queda `PAUSED_BY_CIRCUIT_BREAKER`.

### Error grave

Ejemplos: HTTP 401, 403, 429, sesión cerrada, cuenta bloqueada o suspendida.

1. La sesión pasa a `QUARANTINED`.
2. Su bot queda pausado.
3. Sus mensajes pendientes quedan retenidos con `HELD_SESSION_QUARANTINED`.
4. No se transfieren automáticamente a otros números.
5. Las otras sesiones terminan su propia cola.
6. Cuando ya no existen mensajes ejecutables en otras sesiones, la campaña queda pausada por seguridad.

## Configuración

```env
AUTO_FAILOVER_ENABLED=true
AUTO_FAILOVER_WAIT_SECONDS=30
AUTO_FAILOVER_MAX_TARGETS=3
SESSION_QUARANTINE_MINUTES=1440
```

## Recuperación de una sesión en cuarentena

1. Revisar el motivo y el código de conexión en Sesiones.
2. Usar `Revincular` si la cuenta está habilitada nuevamente.
3. Esperar hasta que la sesión aparezca como `CONNECTED`.
4. Reanudar manualmente la campaña si está pausada.

## Prueba segura

Ejecutar `PROBAR-FAILOVER-SEGURO.ps1`. La prueba usa repositorios simulados y no envía mensajes ni desconecta WhatsApp.
