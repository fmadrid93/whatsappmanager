import test from "node:test";
import assert from "node:assert/strict";
import { ExternalConnectorService } from "../../src/application/services/external-connector.service.js";

function connector(overrides: Record<string, unknown> = {}) {
  return {
    id: "connector-1",
    tenantId: "tenant-1",
    createdByUserId: "user-1",
    name: "Consulta recinto",
    purpose: "BOT_LOOKUP",
    method: "GET",
    urlTemplate: "https://servicio.test/recinto?ci={{ci}}",
    headers: {},
    authType: "NONE",
    hasSecret: false,
    timeoutMs: 5000,
    contactMappings: [],
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("la consulta del bot mapea JSON a variables sin exponer la URL consultada", async () => {
  const executions: any[] = [];
  const repository = {
    findById: async () => connector(),
    createExecution: async (input: unknown) => { executions.push(input); },
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const fetchImpl = async (url: string) => {
    assert.equal(url, "https://servicio.test/recinto?ci=1234567");
    return new Response(JSON.stringify({ data: { colegio: "U.E. Central", mesa: 15 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const service = new ExternalConnectorService(repository, cryptoBox, false, fetchImpl as typeof fetch);
  const result = await service.executeForFlow({
    tenantId: "tenant-1",
    connectorId: "connector-1",
    conversationId: "conversation-1",
    variables: { ci: "1234567" },
    statusVariable: "api_status",
    mappings: [
      { sourcePath: "data.colegio", targetVariable: "colegio" },
      { sourcePath: "data.mesa", targetVariable: "mesa" },
    ],
  });
  assert.equal(result.outcome, "SUCCESS");
  assert.deepEqual(result.variables, { api_status: "SUCCESS", colegio: "U.E. Central", mesa: "15" });
  assert.equal(executions.length, 1);
  assert.equal(executions[0].requestUrl, "https://servicio.test/recinto?ci=***");
  assert.equal(executions[0].mappedCount, 2);
});

test("una fuente de contactos transforma la lista externa al formato de campaña", async () => {
  const repository = {
    findById: async () => connector({
      purpose: "CONTACT_SOURCE",
      urlTemplate: "https://servicio.test/invitados?reunion={{reunionId}}",
      itemsPath: "data.invitados",
      phonePath: "celular",
      namePath: "nombre",
      contactMappings: [{ sourcePath: "hora", targetVariable: "hora_reunion" }],
    }),
    createExecution: async () => undefined,
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const fetchImpl = async () => new Response(JSON.stringify({
    data: { invitados: [
      { nombre: "Ana", celular: "59170000001", hora: "19:00" },
      { nombre: "Sin teléfono" },
    ] },
  }), { status: 200 });
  const service = new ExternalConnectorService(repository, cryptoBox, false, fetchImpl as typeof fetch);
  const result = await service.previewContacts({ tenantId: "tenant-1", connectorId: "connector-1", variables: { reunionId: "10" } });
  assert.equal(result.received, 2);
  assert.equal(result.valid, 1);
  assert.equal(result.invalid, 1);
  assert.deepEqual(result.contacts[0], { phone: "59170000001", name: "Ana", variables: { hora_reunion: "19:00" } });
});


test("el bot devuelve ERROR y continúa cuando el conector está deshabilitado", async () => {
  const repository = {
    findById: async () => connector({ status: "DISABLED" }),
    createExecution: async () => undefined,
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(repository, cryptoBox, false, async () => {
    throw new Error("No debería llamar a la red.");
  });
  const result = await service.executeForFlow({
    tenantId: "tenant-1",
    connectorId: "connector-1",
    conversationId: "conversation-1",
    variables: { ci: "1234567" },
    statusVariable: "api_status",
    mappings: [],
  });
  assert.equal(result.outcome, "ERROR");
  assert.deepEqual(result.variables, { api_status: "ERROR" });
  assert.match(result.errorMessage ?? "", /deshabilitado/i);
});


test("una respuesta 200 sin los campos mapeados se trata como NOT_FOUND", async () => {
  const executions: any[] = [];
  const repository = {
    findById: async () => connector(),
    createExecution: async (input: unknown) => { executions.push(input); },
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(
    repository,
    cryptoBox,
    false,
    async () => new Response(JSON.stringify({ data: null }), { status: 200 }),
  );
  const result = await service.executeForFlow({
    tenantId: "tenant-1",
    connectorId: "connector-1",
    conversationId: "conversation-1",
    variables: { ci: "1234567" },
    statusVariable: "api_status",
    mappings: [{ sourcePath: "data.colegio", targetVariable: "colegio" }],
  });
  assert.equal(result.outcome, "NOT_FOUND");
  assert.deepEqual(result.variables, { api_status: "NOT_FOUND" });
  assert.equal(executions[0].outcome, "NOT_FOUND");
});

test("la importación rechaza un conector que no es fuente antes de llamar a la red", async () => {
  let networkCalls = 0;
  const repository = {
    findById: async () => connector({ purpose: "BOT_LOOKUP" }),
    createExecution: async () => undefined,
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(repository, cryptoBox, false, async () => {
    networkCalls += 1;
    return new Response("[]", { status: 200 });
  });
  await assert.rejects(
    service.previewContacts({ tenantId: "tenant-1", connectorId: "connector-1", variables: {} }),
    /fuente de contactos/i,
  );
  assert.equal(networkCalls, 0);
});

test("las credenciales sensibles no pueden guardarse como encabezados visibles", async () => {
  let repositoryCalls = 0;
  const repository = {
    create: async () => { repositoryCalls += 1; return connector(); },
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(repository, cryptoBox, false, async () => new Response("{}"));
  await assert.rejects(
    service.create({
      tenantId: "tenant-1",
      createdByUserId: "user-1",
      name: "Conector inseguro",
      purpose: "GENERAL",
      method: "GET",
      urlTemplate: "https://servicio.test/api",
      headers: { Authorization: "Bearer visible" },
      authType: "NONE",
    }),
    /sección de autenticación/i,
  );
  assert.equal(repositoryCalls, 0);
});

test("una fuente externa caída devuelve ERROR con mensaje utilizable por la campaña", async () => {
  const repository = {
    findById: async () => connector({
      purpose: "CONTACT_SOURCE",
      itemsPath: "data",
      phonePath: "telefono",
    }),
    createExecution: async () => undefined,
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(repository, cryptoBox, false, async () => {
    throw new Error("Servicio externo no disponible");
  });
  const result = await service.previewContacts({
    tenantId: "tenant-1",
    connectorId: "connector-1",
    variables: {},
  });
  assert.equal(result.outcome, "ERROR");
  assert.equal(result.valid, 0);
  assert.match(result.errorMessage ?? "", /no disponible/i);
});

test("una variable no puede controlar el dominio del conector", async () => {
  let repositoryCalls = 0;
  const repository = {
    create: async () => { repositoryCalls += 1; return connector(); },
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(repository, cryptoBox, true, async () => new Response("{}"));
  await assert.rejects(
    service.create({
      tenantId: "tenant-1",
      createdByUserId: "user-1",
      name: "Dominio variable",
      purpose: "GENERAL",
      method: "GET",
      urlTemplate: "https://{{dominio}}/api",
      headers: {},
      authType: "NONE",
    }),
    /dominio ni el puerto/i,
  );
  assert.equal(repositoryCalls, 0);
});

test("el historial oculta variables colocadas en la ruta de la URL", async () => {
  const executions: any[] = [];
  const repository = {
    findById: async () => connector({ urlTemplate: "https://servicio.test/personas/{{ci}}" }),
    createExecution: async (input: unknown) => { executions.push(input); },
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(
    repository,
    cryptoBox,
    false,
    async () => new Response(JSON.stringify({ data: { colegio: "Central" } }), { status: 200 }),
  );
  await service.executeForFlow({
    tenantId: "tenant-1",
    connectorId: "connector-1",
    conversationId: "conversation-1",
    variables: { ci: "1234567" },
    statusVariable: "api_status",
    mappings: [{ sourcePath: "data.colegio", targetVariable: "colegio" }],
  });
  assert.equal(executions[0].requestUrl, "https://servicio.test/personas/***");
  assert.doesNotMatch(executions[0].requestUrl, /1234567/);
});

test("mapea la respuesta real de recinto desde dato[0]", async () => {
  const executions: any[] = [];
  const repository = {
    findById: async () => connector({ urlTemplate: "https://servicio.test/recinto?celular={{celular}}" }),
    createExecution: async (input: unknown) => { executions.push(input); },
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const fetchImpl = async (url: string) => {
    assert.equal(url, "https://servicio.test/recinto?celular=72620787");
    return new Response(JSON.stringify({
      exito: 1,
      dato: [{
        idRecinto: "3EAE1307-F41D-40A4-AE51-631C4B250DC9",
        recintoVotacion: "Colegio Nacional Blas Garay",
        recinto: "Colegio Nacional Blas Garay",
        latitud: -25.531,
        longitud: -56.267,
        celular: "72620787",
      }],
      status: "ok",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const service = new ExternalConnectorService(repository, cryptoBox, false, fetchImpl as typeof fetch);
  const result = await service.executeForFlow({
    tenantId: "tenant-1",
    connectorId: "connector-1",
    conversationId: "conversation-1",
    variables: { celular: "72620787" },
    statusVariable: "consulta_recinto_estado",
    mappings: [
      { sourcePath: "dato[0].idRecinto", targetVariable: "id_recinto" },
      { sourcePath: "dato[0].recintoVotacion", targetVariable: "recinto_votacion" },
      { sourcePath: "dato[0].recinto", targetVariable: "recinto" },
      { sourcePath: "dato[0].latitud", targetVariable: "latitud" },
      { sourcePath: "dato[0].longitud", targetVariable: "longitud" },
      { sourcePath: "dato[0].celular", targetVariable: "celular_resultado" },
    ],
  });
  assert.equal(result.outcome, "SUCCESS");
  assert.deepEqual(result.variables, {
    consulta_recinto_estado: "SUCCESS",
    id_recinto: "3EAE1307-F41D-40A4-AE51-631C4B250DC9",
    recinto_votacion: "Colegio Nacional Blas Garay",
    recinto: "Colegio Nacional Blas Garay",
    latitud: "-25.531",
    longitud: "-56.267",
    celular_resultado: "72620787",
  });
  assert.equal(executions[0].mappedCount, 6);
});

test("dato vacio se interpreta como NOT_FOUND", async () => {
  const repository = {
    findById: async () => connector({ urlTemplate: "https://servicio.test/recinto?celular={{celular}}" }),
    createExecution: async () => undefined,
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new ExternalConnectorService(
    repository,
    cryptoBox,
    false,
    async () => new Response(JSON.stringify({ exito: 1, dato: [], status: "ok" }), { status: 200 }),
  );
  const result = await service.executeForFlow({
    tenantId: "tenant-1",
    connectorId: "connector-1",
    conversationId: "conversation-1",
    variables: { celular: "70000000" },
    statusVariable: "consulta_recinto_estado",
    mappings: [{ sourcePath: "dato[0].recinto", targetVariable: "recinto" }],
  });
  assert.equal(result.outcome, "NOT_FOUND");
  assert.deepEqual(result.variables, { consulta_recinto_estado: "NOT_FOUND" });
});

