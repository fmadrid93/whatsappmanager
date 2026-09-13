import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Voto1x10HierarchyService } from "../../src/application/services/voto1x10-hierarchy.service.js";
import type { Voto1x10Usuario } from "../../src/infrastructure/voto1x10/voto1x10-client.js";

describe("Voto1x10HierarchyService - resolverMovilizadorIds", () => {
  const dummyClient = {} as any;
  const service = new Voto1x10HierarchyService(dummyClient);

  const mockJerarquia = {
    administradores: [
      { idUsuario: 10, idRol: 1, rol: "ADMIN", idTerritorio: 100, nombreCompleto: "Claudia Romero", totalPersonas: 100 },
      { idUsuario: 20, idRol: 1, rol: "ADMIN", idTerritorio: 200, nombreCompleto: "Admin Luque", totalPersonas: 50 },
    ] as Voto1x10Usuario[],
    gerentes: [
      { idUsuario: 101, idRol: 2, rol: "GERENTE", idTerritorio: 100, idUsuarioSupervisor: 10, nombreCompleto: "Denis Chamorro", totalPersonas: 50 },
      { idUsuario: 102, idRol: 2, rol: "GERENTE", idTerritorio: 100, idUsuarioSupervisor: 10, nombreCompleto: "Gerente 2 Ypane", totalPersonas: 50 },
      { idUsuario: 201, idRol: 2, rol: "GERENTE", idTerritorio: 200, idUsuarioSupervisor: 20, nombreCompleto: "Gerente Luque", totalPersonas: 50 },
    ] as Voto1x10Usuario[],
    movilizadores: [
      { idUsuario: 1001, idRol: 3, rol: "MOVILIZADOR", idTerritorio: 100, idUsuarioSupervisor: 101, nombreCompleto: "Alan Mendoza", totalPersonas: 20 },
      { idUsuario: 1002, idRol: 3, rol: "MOVILIZADOR", idTerritorio: 100, idUsuarioSupervisor: 101, nombreCompleto: "Movilizador 2 de Denis", totalPersonas: 15 },
      { idUsuario: 1003, idRol: 3, rol: "MOVILIZADOR", idTerritorio: 100, idUsuarioSupervisor: 102, nombreCompleto: "Movilizador de Gerente 2", totalPersonas: 15 },
      { idUsuario: 2001, idRol: 3, rol: "MOVILIZADOR", idTerritorio: 200, idUsuarioSupervisor: 201, nombreCompleto: "Movilizador Luque", totalPersonas: 30 },
    ] as Voto1x10Usuario[],
  };

  it("1. Should return ONLY the selected movilizador when all parent levels are also selected in the filter", () => {
    const result = service.resolverMovilizadorIds(
      {
        territorioIds: [100], // Ypane
        administradorIds: [10], // Claudia Romero
        gerenteIds: [101], // Denis Chamorro
        movilizadorIds: [1001], // Alan Mendoza
      },
      mockJerarquia,
    );

    assert.deepEqual([...result], [1001]);
  });

  it("2. Should expand all movilizadores of a gerente when no movilizador is selected under that gerente", () => {
    const result = service.resolverMovilizadorIds(
      {
        territorioIds: [100],
        administradorIds: [10],
        gerenteIds: [101], // Denis Chamorro
        movilizadorIds: [],
      },
      mockJerarquia,
    );

    assert.deepEqual([...result].sort(), [1001, 1002]);
  });

  it("3. Should expand all gerentes and movilizadores of an administrator when no gerente/movilizador is selected", () => {
    const result = service.resolverMovilizadorIds(
      {
        territorioIds: [100],
        administradorIds: [10], // Claudia Romero
        gerenteIds: [],
        movilizadorIds: [],
      },
      mockJerarquia,
    );

    assert.deepEqual([...result].sort(), [1001, 1002, 1003]);
  });

  it("4. Should expand all movilizadores in territory when only territory is selected", () => {
    const result = service.resolverMovilizadorIds(
      {
        territorioIds: [100],
        administradorIds: [],
        gerenteIds: [],
        movilizadorIds: [],
      },
      mockJerarquia,
    );

    assert.deepEqual([...result].sort(), [1001, 1002, 1003]);
  });

  it("5. Should handle mixed selections: Gerente with explicit movilizador AND another Gerente without explicit movilizador", () => {
    const result = service.resolverMovilizadorIds(
      {
        territorioIds: [],
        administradorIds: [],
        gerenteIds: [101, 102],
        movilizadorIds: [1001], // Only Alan Mendoza from Denis Chamorro (101)
      },
      mockJerarquia,
    );

    // 101 should only give 1001, 102 should expand to all its movilizadores (1003)
    assert.deepEqual([...result].sort(), [1001, 1003]);
  });

  it("6. Should handle only movilizador selected without parents", () => {
    const result = service.resolverMovilizadorIds(
      {
        territorioIds: [],
        administradorIds: [],
        gerenteIds: [],
        movilizadorIds: [1001, 2001],
      },
      mockJerarquia,
    );

    assert.deepEqual([...result].sort(), [1001, 2001]);
  });
});
