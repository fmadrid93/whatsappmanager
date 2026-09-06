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
            AND (UPPER(RTRIM(LTRIM(ISNULL(EstadoApoyo, '')))) IN ('CONSULTADO', 'PENDIENTE', '') OR EstadoApoyo IS NULL);

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
}
