import crypto from "node:crypto";
import type {
  BotFlowDefinition,
  BotFlowStep,
  BotFlowTrigger,
  IBotFlowRepository,
} from "../ports/repositories/bot-flow.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";

function cleanVariable(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 50);
}

function normalizeTrigger(trigger: BotFlowTrigger): BotFlowTrigger {
  const type = trigger.type;
  const value = trigger.value?.trim();
  if (type !== "ANY" && !value) throw new HttpError(400, "Escribe el texto que activará el flujo.");
  return { type, value: type === "ANY" ? undefined : value };
}

function normalizeStep(step: BotFlowStep): BotFlowStep {
  const id = step.id?.trim() || crypto.randomUUID();
  if (step.type === "MESSAGE") {
    const text = step.text.trim();
    if (!text) throw new HttpError(400, "Los pasos de mensaje no pueden estar vacíos.");
    return { id, type: "MESSAGE", text };
  }
  if (step.type === "QUESTION") {
    const text = step.text.trim();
    const variable = cleanVariable(step.variable);
    if (!text || !variable) throw new HttpError(400, "Cada pregunta necesita texto y una variable.");
    return { id, type: "QUESTION", text, variable };
  }
  if (step.type === "MENU") {
    const text = step.text.trim();
    const variable = cleanVariable(step.variable);
    const invalidText = step.invalidText?.trim();
    const options = step.options.map((option) => ({
      value: option.value.trim(),
      label: option.label.trim(),
      nextStepId: option.nextStepId.trim(),
    }));
    if (!text || !variable) throw new HttpError(400, "Cada menú necesita texto y una variable.");
    if (options.length < 2 || options.length > 10) throw new HttpError(400, "Cada menú debe tener entre 2 y 10 opciones.");
    if (options.some((option) => !option.value || !option.label || !option.nextStepId)) {
      throw new HttpError(400, "Todas las opciones del menú necesitan valor, etiqueta y destino.");
    }
    if (new Set(options.map((option) => option.value.toLocaleLowerCase())).size !== options.length) {
      throw new HttpError(400, "Los valores de las opciones del menú no pueden repetirse.");
    }
    return { id, type: "MENU", text, variable, options, invalidText: invalidText || undefined };
  }
  if (step.type === "CONDITION") {
    const variable = cleanVariable(step.variable);
    const value = step.value?.trim();
    const ifTrueText = step.ifTrueText.trim();
    const ifFalseText = step.ifFalseText?.trim();
    if (!variable || !ifTrueText) throw new HttpError(400, "La condición necesita variable y respuesta verdadera.");
    if (step.operator !== "EXISTS" && !value) throw new HttpError(400, "La condición necesita un valor de comparación.");
    return {
      id,
      type: "CONDITION",
      variable,
      operator: step.operator,
      value: step.operator === "EXISTS" ? undefined : value,
      ifTrueText,
      ifFalseText: ifFalseText || undefined,
    };
  }
  if (step.type === "API_REQUEST") {
    const connectorId = step.connectorId.trim();
    const statusVariable = cleanVariable(step.statusVariable || "api_status");
    const mappings = step.mappings.map((mapping) => ({
      sourcePath: mapping.sourcePath.trim(),
      targetVariable: cleanVariable(mapping.targetVariable),
      defaultValue: mapping.defaultValue?.trim() || undefined,
    }));
    if (!connectorId || !statusVariable) throw new HttpError(400, "La consulta API necesita conector y variable de estado.");
    if (mappings.length > 30 || mappings.some((mapping) => !mapping.sourcePath || !mapping.targetVariable)) {
      throw new HttpError(400, "Los mapeos de la consulta API son inválidos.");
    }
    if (new Set(mappings.map((mapping) => mapping.targetVariable.toLocaleLowerCase())).size !== mappings.length) {
      throw new HttpError(400, "Las variables de destino de la consulta API no pueden repetirse.");
    }
    return {
      id,
      type: "API_REQUEST",
      connectorId,
      statusVariable,
      mappings,
      successText: step.successText?.trim() || undefined,
      notFoundText: step.notFoundText?.trim() || undefined,
      errorText: step.errorText?.trim() || undefined,
    };
  }
  return { id, type: "END", text: step.text?.trim() || undefined };
}

export class BotFlowService {
  constructor(private readonly flows: IBotFlowRepository) {}

  create(input: {
    tenantId: string;
    ownerUserId: string;
    name: string;
    description?: string;
    trigger: BotFlowTrigger;
    steps: BotFlowStep[];
    sessionIds: string[];
    isTemplate?: boolean;
  }) {
    const name = input.name.trim();
    if (!name) throw new HttpError(400, "El nombre del flujo es obligatorio.");
    // Una plantilla es solo la definición del flujo, todavía sin sesiones reales
    // asignadas — recién se elige a qué sesión va cuando se clona.
    if (!input.isTemplate && input.sessionIds.length === 0) {
      throw new HttpError(400, "Asigna al menos una sesión.");
    }
    if (input.steps.length === 0 || input.steps.length > 50) {
      throw new HttpError(400, "El flujo debe contener entre 1 y 50 pasos.");
    }

    const steps = input.steps.map(normalizeStep);
    const stepIds = new Set(steps.map((step) => step.id));
    for (const step of steps) {
      if (step.type !== "MENU") continue;
      for (const option of step.options) {
        if (!stepIds.has(option.nextStepId)) {
          throw new HttpError(400, `El menú contiene un destino inexistente: ${option.nextStepId}.`);
        }
        if (option.nextStepId === step.id) {
          throw new HttpError(400, "Una opción del menú no puede apuntar al mismo bloque.");
        }
      }
    }

    const definition: BotFlowDefinition = {
      version: 2,
      trigger: normalizeTrigger(input.trigger),
      steps,
    };

    return this.flows.create({
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      name,
      description: input.description?.trim() || undefined,
      definition,
      sessionIds: input.sessionIds,
      isTemplate: input.isTemplate ?? false,
    });
  }

  list(tenantId: string) {
    return this.flows.listByTenant(tenantId);
  }

  setActive(id: string, tenantId: string, active: boolean) {
    return this.flows.setActive(id, tenantId, active);
  }

  markAsTemplate(id: string, tenantId: string, isTemplate: boolean) {
    return this.flows.setTemplate(id, tenantId, isTemplate);
  }

  async cloneFromTemplate(input: {
    tenantId: string;
    ownerUserId: string;
    templateId: string;
    name: string;
    sessionIds: string[];
  }) {
    const template = await this.flows.findByIdForTenant(input.templateId, input.tenantId);
    if (!template) throw new HttpError(404, "Plantilla no encontrada.");
    if (!template.isTemplate) throw new HttpError(400, "Ese flujo no está marcado como plantilla.");

    return this.create({
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      name: input.name,
      description: template.description,
      trigger: template.definition.trigger,
      steps: template.definition.steps,
      sessionIds: input.sessionIds,
      isTemplate: false,
    });
  }
}
