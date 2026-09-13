import type {
  Voto1x10Client,
  Voto1x10Persona,
  Voto1x10PersonaRepetida,
  Voto1x10Territorio,
  Voto1x10Usuario,
} from "../../infrastructure/voto1x10/voto1x10-client.js";

const ROL_ADMINISTRADOR = 1;
const ROL_GERENTE = 2;
const ROL_MOVILIZADOR = 3;

const CONCURRENCIA_CONSULTA_PERSONAS = 5;

export interface JerarquiaVoto1x10 {
  territorios: Voto1x10Territorio[];
  administradores: Voto1x10Usuario[];
  gerentes: Voto1x10Usuario[];
  movilizadores: Voto1x10Usuario[];
}

export interface SeleccionJerarquica {
  territorioIds: number[];
  administradorIds: number[];
  gerenteIds: number[];
  movilizadorIds: number[];
  soloSinMensaje?: boolean;
  estadoApoyo?: string;
  estadoDiaD?: string;
}

export interface ContactosPorSeleccionResult {
  contacts: Array<{ name?: string; phone: string }>;
  movilizadorCount: number;
  personaCount: number;
}

/**
 * Trae y resuelve la jerarquía del ecosistema 1x10 para armar el mismo
 * flujo de selección "Territorio → Administrador → Gerente → Movilizador"
 * que ya usa el Admin en la app Flutter, pero acá para elegir a quién
 * mandarle una campaña de WhatsApp: cualquier combinación de niveles se
 * resuelve a un conjunto final de movilizadores (unión, sin duplicados), y
 * de ahí se traen y deduplican por teléfono todas sus personas registradas.
 */
export class Voto1x10HierarchyService {
  constructor(private readonly client: Voto1x10Client) {}

  async getJerarquia(): Promise<JerarquiaVoto1x10> {
    const [territorios, administradores, gerentes, movilizadores] = await Promise.all([
      this.client.territorios(),
      this.client.usuarios({ idRol: ROL_ADMINISTRADOR }),
      this.client.usuarios({ idRol: ROL_GERENTE }),
      this.client.usuarios({ idRol: ROL_MOVILIZADOR }),
    ]);
    return { territorios, administradores, gerentes, movilizadores };
  }

  resolverMovilizadorIds(
    seleccion: SeleccionJerarquica,
    jerarquia: {
      administradores: Voto1x10Usuario[];
      gerentes: Voto1x10Usuario[];
      movilizadores: Voto1x10Usuario[];
    },
  ): Set<number> {
    const { administradores, gerentes, movilizadores } = jerarquia;

    const seleccionMovilizadorIds = new Set(seleccion.movilizadorIds ?? []);
    const seleccionGerenteIds = new Set(seleccion.gerenteIds ?? []);
    const seleccionAdministradorIds = new Set(seleccion.administradorIds ?? []);
    const seleccionTerritorioIds = new Set(seleccion.territorioIds ?? []);

    // Mapas para lookup rápido por idUsuario
    const movilizadoresById = new Map<number, Voto1x10Usuario>(movilizadores.map((m) => [m.idUsuario, m]));
    const gerentesById = new Map<number, Voto1x10Usuario>(gerentes.map((g) => [g.idUsuario, g]));
    const administradoresById = new Map<number, Voto1x10Usuario>(administradores.map((a) => [a.idUsuario, a]));

    // Función auxiliar para obtener el idTerritorio de cualquier usuario o de su cadena de supervisores
    const getTerritorioId = (u: Voto1x10Usuario | undefined): number | undefined => {
      if (!u) return undefined;
      if (u.idTerritorio !== undefined) return u.idTerritorio;
      if (u.idUsuarioSupervisor !== undefined) {
        const sup = gerentesById.get(u.idUsuarioSupervisor) ?? administradoresById.get(u.idUsuarioSupervisor);
        return getTerritorioId(sup);
      }
      return undefined;
    };

    // 1. Iniciar con los movilizadores explícitamente seleccionados
    const movilizadorIdsFinal = new Set<number>(seleccionMovilizadorIds);

    // 2. Determinar qué nodos superiores tienen selección explícita de hijos (para no expandir el resto del subárbol)
    const gerentesConMovilizadorExplicito = new Set<number>();
    const administradoresConHijoExplicito = new Set<number>();
    const territoriosConSeleccionExplicita = new Set<number>();

    // Registrar selecciones de movilizadores hacia arriba
    for (const movId of seleccionMovilizadorIds) {
      const mov = movilizadoresById.get(movId);
      if (mov) {
        const tId = getTerritorioId(mov);
        if (tId !== undefined) territoriosConSeleccionExplicita.add(tId);

        if (mov.idUsuarioSupervisor !== undefined) {
          gerentesConMovilizadorExplicito.add(mov.idUsuarioSupervisor);
          if (administradoresById.has(mov.idUsuarioSupervisor)) {
            administradoresConHijoExplicito.add(mov.idUsuarioSupervisor);
          } else {
            const ger = gerentesById.get(mov.idUsuarioSupervisor);
            if (ger?.idUsuarioSupervisor !== undefined && administradoresById.has(ger.idUsuarioSupervisor)) {
              administradoresConHijoExplicito.add(ger.idUsuarioSupervisor);
            }
          }
        }
      }
    }

    // Registrar selecciones de gerentes hacia arriba
    for (const gerId of seleccionGerenteIds) {
      const ger = gerentesById.get(gerId);
      if (ger) {
        const tId = getTerritorioId(ger);
        if (tId !== undefined) territoriosConSeleccionExplicita.add(tId);

        if (ger.idUsuarioSupervisor !== undefined && administradoresById.has(ger.idUsuarioSupervisor)) {
          administradoresConHijoExplicito.add(ger.idUsuarioSupervisor);
        }
      }
    }

    // Registrar selecciones de administradores hacia arriba (territorios)
    for (const admId of seleccionAdministradorIds) {
      const adm = administradoresById.get(admId);
      if (adm) {
        const tId = getTerritorioId(adm);
        if (tId !== undefined) territoriosConSeleccionExplicita.add(tId);
      }
    }

    // 3. Resolver Gerentes que deben expandirse a todos sus movilizadores
    const gerentesParaExpandir = new Set<number>();

    for (const gerId of seleccionGerenteIds) {
      // Solo expande todos los movilizadores si NO se eligió un movilizador explícito de este gerente
      if (!gerentesConMovilizadorExplicito.has(gerId)) {
        gerentesParaExpandir.add(gerId);
      }
    }

    // 4. Resolver Administradores que deben expandirse a sus gerentes y movilizadores
    for (const admId of seleccionAdministradorIds) {
      // Solo expande si este administrador NO tiene gerentes o movilizadores explícitamente elegidos
      if (!administradoresConHijoExplicito.has(admId)) {
        // Expandir todos los gerentes de este admin
        for (const ger of gerentes) {
          if (ger.idUsuarioSupervisor === admId && !gerentesConMovilizadorExplicito.has(ger.idUsuario)) {
            gerentesParaExpandir.add(ger.idUsuario);
          }
        }
        // Expandir movilizadores directos de este admin (sin gerente intermedio)
        for (const mov of movilizadores) {
          if (mov.idUsuarioSupervisor === admId && !seleccionMovilizadorIds.has(mov.idUsuario)) {
            movilizadorIdsFinal.add(mov.idUsuario);
          }
        }
      }
    }

    // 5. Agregar todos los movilizadores de los gerentes a expandir
    for (const mov of movilizadores) {
      if (mov.idUsuarioSupervisor !== undefined && gerentesParaExpandir.has(mov.idUsuarioSupervisor)) {
        movilizadorIdsFinal.add(mov.idUsuario);
      }
    }

    // 6. Resolver Territorios: solo expandir los territorios que NO tengan selecciones más específicas
    for (const terrId of seleccionTerritorioIds) {
      if (!territoriosConSeleccionExplicita.has(terrId)) {
        // Expandir todos los movilizadores que pertenecen a este territorio
        for (const mov of movilizadores) {
          const tId = getTerritorioId(mov);
          if (tId === terrId) {
            movilizadorIdsFinal.add(mov.idUsuario);
          }
        }
      }
    }

    return movilizadorIdsFinal;
  }

  async getContactosPorSeleccion(seleccion: SeleccionJerarquica): Promise<ContactosPorSeleccionResult> {
    const { administradores, gerentes, movilizadores } = await this.getJerarquia();
    const movilizadorIdsBruto = this.resolverMovilizadorIds(seleccion, { administradores, gerentes, movilizadores });

    // Excluir movilizadores que envían mensajes masivos directamente desde su propio WhatsApp
    const movilizadoresAutoEnvio = new Set(
      movilizadores.filter((m) => m.enviaMensajesMasivos).map((m) => m.idUsuario),
    );
    const movilizadorIds = [...movilizadorIdsBruto].filter((id) => !movilizadoresAutoEnvio.has(id));

    if (movilizadorIds.length === 0) {
      return { contacts: [], movilizadorCount: 0, personaCount: 0 };
    }

    const contactosPorTelefono = new Map<string, { name?: string; phone: string }>();
    let personaCount = 0;

    const soloSinMensaje = seleccion.soloSinMensaje ?? true;
    const filtroEstado = (seleccion.estadoApoyo ?? "").trim().toUpperCase();

    for (let i = 0; i < movilizadorIds.length; i += CONCURRENCIA_CONSULTA_PERSONAS) {
      const lote = movilizadorIds.slice(i, i + CONCURRENCIA_CONSULTA_PERSONAS);
      const resultados = await Promise.all(
        lote.map((id) => this.client.personasDeMovilizador(id).catch((): Voto1x10Persona[] => [])),
      );

      for (const personas of resultados) {
        for (const persona of personas) {
          personaCount += 1;
          const phone = (persona.celular ?? "").trim();
          if (!phone || contactosPorTelefono.has(phone)) continue;

          const estadoPersona = (persona.estadoApoyo ?? "").trim().toUpperCase();
          const estadoDiaD = (persona.estadoDiaD ?? "").trim().toUpperCase();

          // Filtro por estado de apoyo o estado del Día D (si aún no votó)
          if (filtroEstado === "PENDIENTE" || (soloSinMensaje && !filtroEstado)) {
            // Solo personas que aún no han recibido mensaje / están pendientes
            if (estadoPersona && estadoPersona !== "PENDIENTE") {
              continue;
            }
          } else if (filtroEstado === "NO_VOTO") {
            // Solo personas que todavía NO han votado (excluye YA_VOTO y VOTO)
            if (estadoDiaD === "YA_VOTO" || estadoDiaD === "VOTO") {
              continue;
            }
          } else if (filtroEstado === "YA_VOTO") {
            // Solo personas que ya votaron
            if (estadoDiaD !== "YA_VOTO" && estadoDiaD !== "VOTO") {
              continue;
            }
          } else if (filtroEstado === "CONSULTADO") {
            if (estadoPersona !== "CONSULTADO") {
              continue;
            }
          } else if (filtroEstado && filtroEstado !== "TODOS") {
            if (estadoPersona !== filtroEstado) {
              continue;
            }
          }

          const name = `${persona.nombres ?? ""} ${persona.apellidos ?? ""}`.trim();
          contactosPorTelefono.set(phone, { name: name || undefined, phone });
        }
      }
    }

    return {
      contacts: [...contactosPorTelefono.values()],
      movilizadorCount: movilizadorIds.length,
      personaCount,
    };
  }

  celularesRepetidos(params: { idTerritorio?: number; idUsuarioMovilizador?: number }): Promise<Voto1x10PersonaRepetida[]> {
    return this.client.celularesRepetidos(params);
  }
}
