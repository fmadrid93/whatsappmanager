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

  private resolverMovilizadorIds(seleccion: SeleccionJerarquica, gerentes: Voto1x10Usuario[], movilizadores: Voto1x10Usuario[]): Set<number> {
    const movilizadorIds = new Set<number>(seleccion.movilizadorIds);

    const administradorIds = new Set(seleccion.administradorIds);
    const gerenteIds = new Set(seleccion.gerenteIds);

    // Si dentro del árbol de un administrador ya se eligió algún gerente puntual,
    // ese gerente manda: no se expande el resto de los gerentes de ese
    // administrador (si no, elegir un gerente específico nunca restringiría
    // nada, quedaría "tapado" por la selección más amplia del administrador).
    const administradoresConGerenteExplicito = new Set(
      gerentes
        .filter((g) => g.idUsuarioSupervisor !== undefined && gerenteIds.has(g.idUsuario))
        .map((g) => g.idUsuarioSupervisor as number),
    );
    for (const gerente of gerentes) {
      if (
        gerente.idUsuarioSupervisor !== undefined
        && administradorIds.has(gerente.idUsuarioSupervisor)
        && !administradoresConGerenteExplicito.has(gerente.idUsuarioSupervisor)
      ) {
        gerenteIds.add(gerente.idUsuario);
      }
    }

    const territorioIds = new Set(seleccion.territorioIds);

    for (const movilizador of movilizadores) {
      const porGerente = movilizador.idUsuarioSupervisor !== undefined && gerenteIds.has(movilizador.idUsuarioSupervisor);
      const porTerritorio = movilizador.idTerritorio !== undefined && territorioIds.has(movilizador.idTerritorio);
      if (porGerente || porTerritorio) movilizadorIds.add(movilizador.idUsuario);
    }

    return movilizadorIds;
  }

  async getContactosPorSeleccion(seleccion: SeleccionJerarquica): Promise<ContactosPorSeleccionResult> {
    const { gerentes, movilizadores } = await this.getJerarquia();
    const movilizadorIds = [...this.resolverMovilizadorIds(seleccion, gerentes, movilizadores)];

    if (movilizadorIds.length === 0) {
      return { contacts: [], movilizadorCount: 0, personaCount: 0 };
    }

    const contactosPorTelefono = new Map<string, { name?: string; phone: string }>();
    let personaCount = 0;

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
