# Protección de campañas y bot multinivel

## Circuit breaker

El Worker clasifica los fallos en tres grupos:

- `RECIPIENT_PERMANENT`: número inválido o no registrado. Pasa directamente a DLQ y la campaña continúa.
- `TRANSIENT`: timeout o error temporal. Se reintenta con espera progresiva.
- `SESSION_FATAL`: sesión cerrada, bloqueo, HTTP 401/403 o límite 429. Se pausa la campaña inmediatamente.

También se abre el circuito cuando una sesión acumula tres errores temporales consecutivos. La campaña queda en `PAUSED_BY_CIRCUIT_BREAKER` y requiere revisión y reanudación manual.

El cierre de una sesión ya no mueve automáticamente la cola a otro número, para evitar que un bloqueo por spam afecte también a una sesión de relevo.

Variables configurables:

```env
CIRCUIT_BREAKER_FAILURE_THRESHOLD=3
CIRCUIT_BREAKER_RETRY_MINUTES=30
```

## Bot multinivel

El nuevo bloque `MENU` contiene:

- Texto mostrado al usuario.
- Variable donde se guarda la selección.
- Mensaje para opciones inválidas.
- Entre 2 y 10 opciones.
- Un bloque de destino para cada opción.

En la pantalla de Flujos, el botón **Ejemplo multinivel** carga un bot de tres niveles:

1. Menú principal con cinco áreas.
2. Dos subopciones por área.
3. Dos subsubopciones por cada subopción.
4. Un mensaje final específico para cada ruta.
