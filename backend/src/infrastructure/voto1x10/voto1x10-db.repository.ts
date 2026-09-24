import type { PrismaClient } from "@prisma/client";
import { logger } from "../../shared/logger/logger.js";

export interface Voto1x10PersonaMovilizadaRow {
  IdPersonaMovilizada: number;
  Nombres: string;
  Apellidos: string;
  Celular: string;
  EstadoApoyo?: string | null;
  NivelCompromiso?: string | null;
  EstadoRegistro?: string | null;
  Observaciones?: string | null;
}

export class Voto1x10DbRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private extractPhoneSuffixes(phone: string): { full: string; last8: string; last7: string } {
    const clean = phone.replace(/\D/g, "");
    const last8 = clean.length >= 8 ? clean.slice(-8) : clean;
    const last7 = clean.length >= 7 ? clean.slice(-7) : clean;
    return { full: clean, last8, last7 };
  }

  async buscarPorCelular(celular: string): Promise<Voto1x10PersonaMovilizadaRow | null> {
    if (!celular || !celular.trim()) return null;
    const { full, last8, last7 } = this.extractPhoneSuffixes(celular);
    if (!last7) return null;

    try {
      const rows = await this.prisma.$queryRawUnsafe<Voto1x10PersonaMovilizadaRow[]>(
        `SELECT TOP 1 
            IdPersonaMovilizada, 
            Nombres, 
            Apellidos, 
            Celular, 
            EstadoApoyo, 
            NivelCompromiso, 
            EstadoRegistro, 
            Observaciones
         FROM [AppCampana1x10].[dbo].[PersonaMovilizada] WITH (NOLOCK)
         WHERE 
            Celular = '${full}'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(Celular, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE '%${last8}'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(Celular, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE '%${last7}'
         ORDER BY IdPersonaMovilizada DESC`,
      );

      const first = rows && rows.length > 0 ? rows[0] : undefined;
      return first ?? null;
    } catch (error) {
      logger.warn({ error, celular }, "Error al buscar votante por celular en AppCampana1x10.");
      return null;
    }
  }

  async actualizarCompromisoPorCelular(
    celular: string,
    estadoApoyo: "APOYA" | "NO_APOYA" | "CONSULTADO" | string,
    observacionTexto: string,
  ): Promise<Voto1x10PersonaMovilizadaRow | null> {
    if (!celular || !celular.trim()) return null;
    const { full, last8, last7 } = this.extractPhoneSuffixes(celular);
    if (!last7) return null;

    const nivelCompromiso = estadoApoyo === "APOYA" ? "ALTO" : estadoApoyo === "NO_APOYA" ? "BAJO" : "MEDIO";
    const cleanObservacion = observacionTexto.replace(/'/g, "''").slice(0, 250);

    try {
      const rows = await this.prisma.$queryRawUnsafe<Voto1x10PersonaMovilizadaRow[]>(
        `DECLARE @Updated TABLE (
            IdPersonaMovilizada INT,
            Nombres VARCHAR(150),
            Apellidos VARCHAR(150),
            EstadoApoyo VARCHAR(50),
            NivelCompromiso VARCHAR(50),
            Celular VARCHAR(50)
         );

         UPDATE [AppCampana1x10].[dbo].[PersonaMovilizada]
         SET 
            EstadoApoyo = '${estadoApoyo}',
            NivelCompromiso = '${nivelCompromiso}',
            EstadoRegistro = CASE WHEN '${estadoApoyo}' = 'APOYA' THEN 'COMPROMETIDO' ELSE EstadoRegistro END,
            Observaciones = CASE 
                WHEN Observaciones IS NULL OR Observaciones = '' THEN 'Bot WhatsApp: ${cleanObservacion}'
                ELSE Observaciones + ' | Bot: ${cleanObservacion}'
            END,
            FechaUpdate = GETDATE()
         OUTPUT 
            inserted.IdPersonaMovilizada,
            inserted.Nombres,
            inserted.Apellidos,
            inserted.EstadoApoyo,
            inserted.NivelCompromiso,
            inserted.Celular
         INTO @Updated
         WHERE 
            (
              Celular = '${full}'
              OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(Celular, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE '%${last8}'
              OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(Celular, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE '%${last7}'
            )
            AND (Activo IS NULL OR Activo = 1);

         SELECT TOP 1 * FROM @Updated;`,
      );

      const first = rows && rows.length > 0 ? rows[0] : undefined;
      if (first) {
        logger.info(
          {
            celular,
            idPersonaMovilizada: first.IdPersonaMovilizada,
            nombre: `${first.Nombres} ${first.Apellidos}`,
            estadoApoyo,
          },
          "Registro de votante en AppCampana1x10 actualizado correctamente por el Bot.",
        );
        return first;
      }

      return null;
    } catch (error) {
      logger.error({ error, celular, estadoApoyo }, "Error al actualizar registro de votante en AppCampana1x10.");
      return null;
    }
  }

  async marcarComoConsultadosPorCelulares(celulares: string[]): Promise<number> {
    if (!celulares || celulares.length === 0) return 0;
    const cleanList = celulares.map((c) => String(c || "").trim()).filter(Boolean);
    if (cleanList.length === 0) return 0;

    const joined = cleanList.map((c) => c.replace(/'/g, "''")).join(",");
    try {
      const result = await this.prisma.$executeRawUnsafe(
        `UPDATE pm
         SET pm.EstadoApoyo = 'CONSULTADO', pm.FechaUpdate = GETDATE()
         FROM [AppCampana1x10].[dbo].[PersonaMovilizada] pm
         WHERE (pm.EstadoApoyo = 'PENDIENTE' OR pm.EstadoApoyo IS NULL OR pm.EstadoApoyo = '')
           AND (pm.Activo IS NULL OR pm.Activo = 1)
           AND EXISTS (
               SELECT 1 FROM STRING_SPLIT('${joined}', ',') s
               WHERE 
                   pm.Celular = s.value
                   OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(pm.Celular, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(s.value, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '')
                   OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(pm.Celular, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE '%' + RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(s.value, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), 7)
           )`
      );
      logger.info({ totalEnviados: cleanList.length, actualizadosBD: result }, "Votantes marcados como CONSULTADO en [PersonaMovilizada].");
      return result;
    } catch (error) {
      logger.error({ error }, "Error al marcar votantes como CONSULTADO.");
      return 0;
    }
  }

  async obtenerTerritorios(): Promise<Array<{ idTerritorio: number; idTerritorioPadre?: number; nombre: string; tipoTerritorio: string }>> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{
        IdTerritorio: number;
        IdTerritorioPadre: number | null;
        Nombre: string;
        TipoTerritorio: string;
      }>>(
        `SELECT 
            IdTerritorio, 
            IdTerritorioPadre, 
            Nombre, 
            TipoTerritorio
         FROM [AppCampana1x10].[dbo].[Territorio] WITH (NOLOCK)
         WHERE Activo IS NULL OR Activo = 1
         ORDER BY Nombre ASC`,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((r) => ({
        idTerritorio: Number(r.IdTerritorio),
        idTerritorioPadre: r.IdTerritorioPadre != null ? Number(r.IdTerritorioPadre) : undefined,
        nombre: (r.Nombre ?? "").trim(),
        tipoTerritorio: (r.TipoTerritorio ?? "").trim(),
      }));
    } catch (error) {
      logger.warn({ error }, "Error al obtener territorios desde BD en AppCampana1x10.");
      return [];
    }
  }

  async obtenerUsuarios(params?: { idRol?: number }): Promise<Array<{
    idUsuario: number;
    idRol: number;
    rol: string;
    idTerritorio?: number;
    territorio?: string;
    idUsuarioSupervisor?: number;
    usuario?: string;
    nombreCompleto: string;
    totalPersonas: number;
    enviaMensajesMasivos?: boolean;
  }>> {
    try {
      const rolFilter = params?.idRol ? ` AND u.IdRol = ${Number(params.idRol)}` : "";
      const rows = await this.prisma.$queryRawUnsafe<Array<{
        IdUsuario: number;
        IdRol: number;
        Rol: string | null;
        IdTerritorio: number | null;
        Territorio: string | null;
        IdUsuarioSupervisor: number | null;
        Usuario: string | null;
        NombreCompleto: string;
        EnviaMensajesMasivos: boolean | number | null;
      }>>(
        `SELECT 
            u.IdUsuario,
            u.IdRol,
            ISNULL(r.Nombre, CASE u.IdRol WHEN 1 THEN 'ADMINISTRADOR' WHEN 2 THEN 'GERENTE' WHEN 3 THEN 'MOVILIZADOR' ELSE 'USUARIO' END) AS Rol,
            u.IdTerritorio,
            t.Nombre AS Territorio,
            u.IdUsuarioSupervisor,
            u.Usuario,
            u.NombreCompleto,
            ISNULL(u.EnviaMensajesMasivos, 0) AS EnviaMensajesMasivos
         FROM [AppCampana1x10].[dbo].[Usuario] u WITH (NOLOCK)
         LEFT JOIN [AppCampana1x10].[dbo].[Rol] r WITH (NOLOCK) ON r.IdRol = u.IdRol
         LEFT JOIN [AppCampana1x10].[dbo].[Territorio] t WITH (NOLOCK) ON t.IdTerritorio = u.IdTerritorio
         WHERE (u.Activo IS NULL OR u.Activo = 1)${rolFilter}
         ORDER BY u.NombreCompleto ASC`,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((r) => ({
        idUsuario: Number(r.IdUsuario),
        idRol: Number(r.IdRol),
        rol: (r.Rol ?? "").trim(),
        idTerritorio: r.IdTerritorio != null ? Number(r.IdTerritorio) : undefined,
        territorio: r.Territorio ? r.Territorio.trim() : undefined,
        idUsuarioSupervisor: r.IdUsuarioSupervisor != null ? Number(r.IdUsuarioSupervisor) : undefined,
        usuario: r.Usuario ? r.Usuario.trim() : undefined,
        nombreCompleto: (r.NombreCompleto ?? "").trim(),
        totalPersonas: 0,
        enviaMensajesMasivos: Boolean(r.EnviaMensajesMasivos),
      }));
    } catch (error) {
      logger.warn({ error, params }, "Error al obtener usuarios desde BD en AppCampana1x10.");
      return [];
    }
  }

  async obtenerConteoPendientesPorMovilizador(): Promise<Map<number, number>> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ IdUsuarioMovilizador: number; TotalPendientes: number }>>(
        `SELECT 
            pm.IdUsuarioMovilizador,
            COUNT(1) AS TotalPendientes
         FROM [AppCampana1x10].[dbo].[PersonaMovilizada] pm WITH (NOLOCK)
         WHERE (pm.Activo IS NULL OR pm.Activo = 1)
           AND pm.Celular IS NOT NULL 
           AND LTRIM(RTRIM(pm.Celular)) <> ''
           AND (pm.EstadoApoyo IS NULL OR pm.EstadoApoyo = '' OR UPPER(LTRIM(RTRIM(pm.EstadoApoyo))) = 'PENDIENTE')
         GROUP BY pm.IdUsuarioMovilizador`,
      );
      const map = new Map<number, number>();
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row.IdUsuarioMovilizador != null) {
            map.set(Number(row.IdUsuarioMovilizador), Number(row.TotalPendientes) || 0);
          }
        }
      }
      return map;
    } catch (error) {
      logger.warn({ error }, "Error al obtener conteo de personas pendientes por movilizador en AppCampana1x10.");
      return new Map();
    }
  }

  async obtenerPersonasPendientesPorMovilizadores(
    movilizadorIds: number[],
    estadoApoyoFiltro?: string,
    estadoDiaDFiltro?: string,
  ): Promise<Array<{ idPersonaMovilizada: number; idUsuarioMovilizador: number; nombres: string; apellidos: string; celular: string; estadoApoyo?: string; estadoDiaD?: string }>> {
    if (movilizadorIds.length === 0) return [];
    try {
      const idList = movilizadorIds.map((id) => Number(id)).filter((id) => !isNaN(id) && id > 0).join(",");
      if (!idList) return [];

      let whereClause = `WHERE (pm.Activo IS NULL OR pm.Activo = 1)
        AND pm.IdUsuarioMovilizador IN (${idList})
        AND pm.Celular IS NOT NULL 
        AND LTRIM(RTRIM(pm.Celular)) <> ''`;

      const estado = (estadoApoyoFiltro ?? "").trim().toUpperCase();
      const diad = (estadoDiaDFiltro ?? "").trim().toUpperCase();

      if (estado === "PENDIENTE" || (!estado && diad !== "NO_VOTO" && diad !== "YA_VOTO")) {
        whereClause += ` AND (pm.EstadoApoyo IS NULL OR pm.EstadoApoyo = '' OR UPPER(LTRIM(RTRIM(pm.EstadoApoyo))) = 'PENDIENTE')`;
      } else if (estado === "CONSULTADO") {
        whereClause += ` AND UPPER(LTRIM(RTRIM(pm.EstadoApoyo))) = 'CONSULTADO'`;
      } else if (estado && estado !== "TODOS") {
        whereClause += ` AND UPPER(LTRIM(RTRIM(pm.EstadoApoyo))) = '${estado.replace(/'/g, "''")}'`;
      }

      if (diad === "NO_VOTO") {
        whereClause += ` AND (pm.EstadoDiaD IS NULL OR UPPER(LTRIM(RTRIM(pm.EstadoDiaD))) NOT IN ('YA_VOTO', 'VOTO'))`;
      } else if (diad === "YA_VOTO") {
        whereClause += ` AND UPPER(LTRIM(RTRIM(pm.EstadoDiaD))) IN ('YA_VOTO', 'VOTO')`;
      }

      const rows = await this.prisma.$queryRawUnsafe<Array<{
        IdPersonaMovilizada: number;
        IdUsuarioMovilizador: number;
        Nombres: string;
        Apellidos: string;
        Celular: string;
        EstadoApoyo: string | null;
        EstadoDiaD: string | null;
      }>>(
        `SELECT 
            pm.IdPersonaMovilizada,
            pm.IdUsuarioMovilizador,
            pm.Nombres,
            pm.Apellidos,
            pm.Celular,
            pm.EstadoApoyo,
            pm.EstadoDiaD
         FROM [AppCampana1x10].[dbo].[PersonaMovilizada] pm WITH (NOLOCK)
         ${whereClause}
         ORDER BY pm.IdPersonaMovilizada ASC`,
      );

      if (!Array.isArray(rows)) return [];
      return rows.map((r) => ({
        idPersonaMovilizada: r.IdPersonaMovilizada,
        idUsuarioMovilizador: r.IdUsuarioMovilizador,
        nombres: r.Nombres,
        apellidos: r.Apellidos,
        celular: r.Celular,
        estadoApoyo: r.EstadoApoyo ?? undefined,
        estadoDiaD: r.EstadoDiaD ?? undefined,
      }));
    } catch (error) {
      logger.warn({ error }, "Error al obtener personas pendientes por movilizadores desde BD directa.");
      return [];
    }
  }
}
