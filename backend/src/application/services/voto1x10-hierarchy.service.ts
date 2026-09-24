import type {
  Voto1x10Client,
  Voto1x10Persona,
  Voto1x10PersonaRepetida,
  Voto1x10Territorio,
  Voto1x10Usuario,
} from "../../infrastructure/voto1x10/voto1x10-client.js";
import type { Voto1x10DbRepository } from "../../infrastructure/voto1x10/voto1x10-db.repository.js";

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
  limite?: number;
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
  constructor(
    private readonly client?: Voto1x10Client | null,
    private readonly dbRepo?: Voto1x10DbRepository | null,
  ) {}

  async getJerarquia(): Promise<JerarquiaVoto1x10> {
    let rawTerritorios: Voto1x10Territorio[] = [];
    let rawAdministradores: Voto1x10Usuario[] = [];
    let rawGerentes: Voto1x10Usuario[] = [];
    let rawMovilizadores: Voto1x10Usuario[] = [];

    if (this.dbRepo) {
      try {
        const [terrs, admins, gers, movs] = await Promise.all([
          this.dbRepo.obtenerTerritorios(),
          this.dbRepo.obtenerUsuarios({ idRol: ROL_ADMINISTRADOR }),
          this.dbRepo.obtenerUsuarios({ idRol: ROL_GERENTE }),
          this.dbRepo.obtenerUsuarios({ idRol: ROL_MOVILIZADOR }),
        ]);
        rawTerritorios = terrs;
        rawAdministradores = admins;
        rawGerentes = gers;
        rawMovilizadores = movs;
      } catch {
        // Fallback a HTTP
      }
    }

    if (rawTerritorios.length === 0 && this.client) {
      const [terrs, admins, gers, movs] = await Promise.all([
        this.client.territorios().catch((): Voto1x10Territorio[] => []),
        this.client.usuarios({ idRol: ROL_ADMINISTRADOR }).catch((): Voto1x10Usuario[] => []),
        this.client.usuarios({ idRol: ROL_GERENTE }).catch((): Voto1x10Usuario[] => []),
        this.client.usuarios({ idRol: ROL_MOVILIZADOR }).catch((): Voto1x10Usuario[] => []),
      ]);
      rawTerritorios = terrs;
      rawAdministradores = admins;
      rawGerentes = gers;
      rawMovilizadores = movs;
    }

    // 1. Obtener conteo exacto de personas pendientes por movilizador (solo activas, con celular y no enviadas)
    let conteoPendientes: Map<number, number> | null = null;
    if (this.dbRepo) {
      try {
        conteoPendientes = await this.dbRepo.obtenerConteoPendientesPorMovilizador();
      } catch {
        conteoPendientes = null;
      }
    }

    // Lookup rápido de gerentes y administradores para resolver territorio heredado
    const gerentesById = new Map<number, Voto1x10Usuario>(rawGerentes.map((g) => [g.idUsuario, g]));
    const administradoresById = new Map<number, Voto1x10Usuario>(rawAdministradores.map((a) => [a.idUsuario, a]));

    const getTerritorioId = (u: Voto1x10Usuario | undefined): number | undefined => {
      if (!u) return undefined;
      if (u.idTerritorio !== undefined && u.idTerritorio !== null) return u.idTerritorio;
      if (u.idUsuarioSupervisor !== undefined && u.idUsuarioSupervisor !== null) {
        const sup = gerentesById.get(u.idUsuarioSupervisor) ?? administradoresById.get(u.idUsuarioSupervisor);
        return getTerritorioId(sup);
      }
      return undefined;
    };

    // 2. Asignar conteos a movilizadores y filtrar estrictamente SOLO aquellos con personas pendientes para enviar (> 0)
    const movilizadoresActualizados: Voto1x10Usuario[] = [];
    for (const mov of rawMovilizadores) {
      const pendientes = conteoPendientes ? (conteoPendientes.get(mov.idUsuario) ?? 0) : mov.totalPersonas;
      if (pendientes > 0) {
        movilizadoresActualizados.push({
          ...mov,
          idTerritorio: mov.idTerritorio !== undefined ? mov.idTerritorio : getTerritorioId(mov),
          totalPersonas: pendientes,
        });
      }
    }

    // 3. Calcular conteos para Gerentes sumando sus movilizadores con pendientes (filtrar solo si totalGerente > 0)
    const gerentesActualizados: Voto1x10Usuario[] = [];
    for (const ger of rawGerentes) {
      const movsDelGerente = movilizadoresActualizados.filter((m) => m.idUsuarioSupervisor === ger.idUsuario);
      const totalGerente = movsDelGerente.reduce((acc, m) => acc + (m.totalPersonas || 0), 0);
      if (totalGerente > 0) {
        gerentesActualizados.push({
          ...ger,
          idTerritorio: ger.idTerritorio !== undefined ? ger.idTerritorio : getTerritorioId(ger),
          totalPersonas: totalGerente,
        });
      }
    }

    // 4. Calcular conteos para Administradores sumando sus gerentes y movilizadores directos (filtrar solo si totalAdmin > 0)
    const administradoresActualizados: Voto1x10Usuario[] = [];
    for (const adm of rawAdministradores) {
      const gersDelAdmin = gerentesActualizados.filter((g) => g.idUsuarioSupervisor === adm.idUsuario);
      const movsDirectos = movilizadoresActualizados.filter((m) => m.idUsuarioSupervisor === adm.idUsuario);
      const totalAdmin = gersDelAdmin.reduce((acc, g) => acc + (g.totalPersonas || 0), 0) +
        movsDirectos.reduce((acc, m) => acc + (m.totalPersonas || 0), 0);

      if (totalAdmin > 0) {
        administradoresActualizados.push({
          ...adm,
          idTerritorio: adm.idTerritorio !== undefined ? adm.idTerritorio : getTerritorioId(adm),
          totalPersonas: totalAdmin,
        });
      }
    }

    // 5. Calcular conteos para Territorios y filtrar solo los que tengan personas pendientes (totalTerritorio > 0)
    const territoriosActualizados: Voto1x10Territorio[] = [];
    for (const terr of rawTerritorios) {
      const movsEnTerritorio = movilizadoresActualizados.filter((m) => {
        const tId = m.idTerritorio !== undefined ? m.idTerritorio : getTerritorioId(m);
        return tId === terr.idTerritorio;
      });
      const totalTerritorio = movsEnTerritorio.reduce((acc, m) => acc + (m.totalPersonas || 0), 0);
      if (totalTerritorio > 0) {
        territoriosActualizados.push({
          ...terr,
          totalPersonas: totalTerritorio,
        });
      }
    }

    return {
      territorios: territoriosActualizados,
      administradores: administradoresActualizados,
      gerentes: gerentesActualizados,
      movilizadores: movilizadoresActualizados,
    };
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
    const filtroDiaD = (seleccion.estadoDiaD ?? "").trim().toUpperCase();

    // Si tenemos acceso directo a la BD, ejecutar consulta optimizada
    if (this.dbRepo) {
      try {
        const personasDb = await this.dbRepo.obtenerPersonasPendientesPorMovilizadores(
          movilizadorIds,
          filtroEstado || (soloSinMensaje ? "PENDIENTE" : undefined),
          filtroDiaD,
        );
        for (const p of personasDb) {
          personaCount += 1;
          const phone = (p.celular ?? "").trim();
          if (!phone || contactosPorTelefono.has(phone)) continue;
          const name = `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim();
          contactosPorTelefono.set(phone, { name: name || undefined, phone });
        }
      } catch {
        // Fallback a API HTTP si falla la consulta SQL directa
      }
    }

    // Si no se cargó por BD (o faltan), consultar por cliente HTTP
    if (contactosPorTelefono.size === 0 && this.client) {
      for (let i = 0; i < movilizadorIds.length; i += CONCURRENCIA_CONSULTA_PERSONAS) {
        const lote = movilizadorIds.slice(i, i + CONCURRENCIA_CONSULTA_PERSONAS);
        const resultados = await Promise.all(
          lote.map((id) => this.client!.personasDeMovilizador(id).catch((): Voto1x10Persona[] => [])),
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
              if (estadoPersona && estadoPersona !== "PENDIENTE") {
                continue;
              }
            } else if (filtroEstado === "NO_VOTO" || filtroDiaD === "NO_VOTO") {
              if (estadoDiaD === "YA_VOTO" || estadoDiaD === "VOTO") {
                continue;
              }
            } else if (filtroEstado === "YA_VOTO" || filtroDiaD === "YA_VOTO") {
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
    }

    let contacts = [...contactosPorTelefono.values()];

    // Respetar límite si viene especificado
    if (seleccion.limite && seleccion.limite > 0) {
      contacts = contacts.slice(0, seleccion.limite);
    }

    return {
      contacts,
      movilizadorCount: movilizadorIds.length,
      personaCount,
    };
  }

  async celularesRepetidos(params: { idTerritorio?: number; idUsuarioMovilizador?: number }): Promise<Voto1x10PersonaRepetida[]> {
    if (this.client) {
      try {
        return await this.client.celularesRepetidos(params);
      } catch {
        return [];
      }
    }
    return [];
  }
}
