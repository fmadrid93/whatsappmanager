# Parche 15 - Recinto por celular y respuesta `dato[0]`

Este parche adapta el flujo de ejemplo **Generar flujo recinto por celular + API** a la respuesta real:

```json
{
  "exito": 1,
  "dato": [{
    "idRecinto": "...",
    "recintoVotacion": "Colegio Nacional Blas Garay",
    "recinto": "Colegio Nacional Blas Garay",
    "latitud": -25.531,
    "longitud": -56.267,
    "celular": "72620787"
  }],
  "status": "ok"
}
```

Mapeos generados:

- `dato[0].idRecinto` -> `id_recinto`
- `dato[0].recintoVotacion` -> `recinto_votacion`
- `dato[0].recinto` -> `recinto`
- `dato[0].latitud` -> `latitud`
- `dato[0].longitud` -> `longitud`
- `dato[0].celular` -> `celular_resultado`

Variables automaticas del remitente:

- `{{telefono}}`: `59172620787`
- `{{celular}}`: `72620787` para Bolivia
- `{{celular_internacional}}`: `59172620787`
- `{{telefono_e164}}`: `+59172620787`

Ejemplo de conector:

```text
GET https://tu-api.com/api/recinto?celular={{celular}}
```
