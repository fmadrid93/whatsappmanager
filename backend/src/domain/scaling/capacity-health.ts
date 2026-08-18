export type CapacityHealthStatus =
  | "HOLGADO"
  | "VIGILAR"
  | "AGREGAR_WORKER"
  | "SERVIDOR_SATURADO"
  | "SIN_SESIONES";

export interface CampaignCapacityInput {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  held: number;
  connectedSessions: number;
  activeWorkers: number;
  sessionConcurrency: number;
  maxInFlight: number;
  totalWorkerInFlight: number;
  serverCpuPercent?: number;
  serverMemoryUsedPercent?: number;
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, value) / total) * 10_000) / 100;
}

export function buildCampaignCapacityHealth(input: CampaignCapacityInput) {
  const terminal = input.sent + input.failed;
  const remaining = input.pending + input.processing + input.held;
  const sessionCapacity = input.connectedSessions * input.sessionConcurrency;
  const workerCapacity = input.activeWorkers * input.maxInFlight;
  const effectiveCapacity = Math.min(sessionCapacity, workerCapacity);
  const recommendedWorkers = input.connectedSessions <= 0
    ? 0
    : Math.max(1, Math.ceil(sessionCapacity / Math.max(1, input.maxInFlight)));
  const slotUsagePercent = effectiveCapacity > 0
    ? pct(Math.min(input.totalWorkerInFlight, effectiveCapacity), effectiveCapacity)
    : 0;

  const cpu = input.serverCpuPercent ?? 0;
  const memory = input.serverMemoryUsedPercent ?? 0;

  let healthStatus: CapacityHealthStatus;
  let recommendation: string;

  if (input.connectedSessions <= 0) {
    healthStatus = "SIN_SESIONES";
    recommendation = "No hay sesiones conectadas para esta campaña.";
  } else if (cpu >= 85 || memory >= 90) {
    healthStatus = "SERVIDOR_SATURADO";
    recommendation = "El servidor está cerca de su límite. Antes de agregar Workers, aumenta CPU/RAM o distribuye los Workers en otro servidor.";
  } else if (input.activeWorkers < recommendedWorkers) {
    healthStatus = "AGREGAR_WORKER";
    recommendation = `Conviene agregar ${recommendedWorkers - input.activeWorkers} Worker(s) para cubrir la capacidad de las sesiones conectadas.`;
  } else if (cpu >= 70 || memory >= 80 || (remaining > 0 && slotUsagePercent >= 80)) {
    healthStatus = "VIGILAR";
    recommendation = "La capacidad alcanza, pero hay señales de carga alta. Observa mensajes/minuto, CPU, RAM y slots antes de escalar.";
  } else {
    healthStatus = "HOLGADO";
    recommendation = "La capacidad actual es suficiente. Agregar más Workers no debería mejorar de forma significativa mientras las sesiones y slots actuales no estén saturados.";
  }

  return {
    terminal,
    remaining,
    progressPercent: pct(terminal, input.total),
    remainingPercent: pct(remaining, input.total),
    sentPercent: pct(input.sent, input.total),
    processingPercent: pct(input.processing, input.total),
    pendingPercent: pct(input.pending, input.total),
    heldPercent: pct(input.held, input.total),
    failedPercent: pct(input.failed, input.total),
    sessionCapacity,
    workerCapacity,
    effectiveCapacity,
    recommendedWorkers,
    slotUsagePercent,
    healthStatus,
    recommendation,
  };
}
