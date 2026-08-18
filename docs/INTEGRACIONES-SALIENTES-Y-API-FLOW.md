# Parche 12 — Integraciones salientes y consultas API en flujos

## Objetivo

Permitir que WhatsApp SaaS consuma APIs de otros sistemas en dos escenarios:

1. Importar contactos externos para crear campañas.
2. Consultar información durante una conversación del bot y guardar campos de la respuesta como variables.

## Conectores

Los conectores se administran en **Integraciones → Conectores**.

Tipos disponibles:

- `BOT_LOOKUP`: consulta ejecutada desde un bloque `API_REQUEST` del bot.
- `CONTACT_SOURCE`: fuente de contactos para una campaña.
- `GENERAL`: pruebas o usos generales.

Métodos disponibles: `GET` y `POST`.

Autenticación:

- Sin autenticación.
- Bearer token.
- API key en un encabezado configurable.
- Basic Auth.

Las credenciales se cifran con `ENCRYPTION_KEY_BASE64`. Nunca se devuelven al frontend.

Los encabezados sensibles como `Authorization`, `Cookie` o `Proxy-Authorization` no se aceptan dentro del JSON de encabezados. Deben configurarse mediante la sección de autenticación para evitar guardarlos como texto visible.

## Plantillas y variables

La URL, los encabezados y el body pueden contener variables:

```text
https://sistema.externo/api/recinto?ci={{ci}}
```

```json
{
  "documento": "{{ci}}"
}
```

## Fuente de contactos

Ejemplo de respuesta externa:

```json
{
  "data": {
    "invitados": [
      {
        "nombre": "Ana",
        "telefono": "59170000001",
        "fecha": "10/08/2026",
        "hora": "19:00"
      }
    ]
  }
}
```

Configuración:

- Ruta de lista: `data.invitados`
- Ruta de teléfono: `telefono`
- Ruta de nombre: `nombre`
- Mapeos:
  - `fecha=fecha_reunion`
  - `hora=hora_reunion`

La campaña podrá usar `{{fecha_reunion}}` y `{{hora_reunion}}`.

## Bloque API_REQUEST

El editor de flujos permite elegir un conector `BOT_LOOKUP`, definir una variable de estado y mapear campos.

Ejemplo:

- `data.colegio → colegio`
- `data.mesa → mesa`
- `data.direccion → direccion`

La variable de estado recibe uno de estos valores:

- `SUCCESS`
- `NOT_FOUND`
- `ERROR`

Cada resultado puede enviar un texto distinto al cliente.

## Seguridad

- Solo se admiten URLs HTTP y HTTPS.
- En producción se bloquean `localhost`, `127.0.0.0/8`, `::1` y `0.0.0.0`.
- Se permiten APIs privadas de red local, por ejemplo `192.168.x.x`, porque el sistema se utiliza en entornos empresariales internos.
- Timeout configurable entre 1 y 30 segundos.
- Respuesta máxima de 1 MB.
- No se siguen redirecciones.
- Los valores variables de ruta y los valores de query string se ocultan en el historial.
- Las variables no pueden modificar el dominio ni el puerto del conector.
- No se permiten credenciales incrustadas dentro de la URL.
- El cuerpo de respuesta guardado en el historial se limita a 2000 caracteres.
- Una importación solo puede ejecutar conectores `CONTACT_SOURCE`.
- Un bloque del bot solo puede ejecutar conectores `BOT_LOOKUP`.

## Auditoría e historial

Se registran creación, cambio de estado, prueba e importación de contactos. El historial técnico registra código HTTP, duración, resultado y cantidad de campos/contactos mapeados.
