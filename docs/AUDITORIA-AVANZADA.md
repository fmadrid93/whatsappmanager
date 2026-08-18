# Auditoria avanzada

## Funciones

- Busqueda por accion, entidad, usuario, IP y Request ID.
- Filtros por rango de fecha, resultado, accion, entidad y usuario.
- Paginacion desde SQL Server.
- Detalle de IP, navegador, Request ID y metadata.
- Exportacion CSV de la pagina consultada.
- Catalogos dinamicos de acciones, entidades y usuarios.

## Endpoints

- `GET /api/audit-logs`
- `GET /api/audit-logs/options`

## Consideraciones

Los registros de auditoria son de solo lectura. El modulo no incorpora opciones para modificarlos o eliminarlos desde la interfaz.
