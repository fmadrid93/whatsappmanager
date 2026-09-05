/**
 * Cliente HTTP de solo lectura contra el API .NET Core del ecosistema 1x10
 * (Territorio → Administrador → Gerente → Movilizador → PersonaMovilizada).
 * Se autentica una sola vez como un usuario de servicio ya existente en ese
 * sistema (login normal, mismo endpoint que usa la app Flutter) y reutiliza
 * el JWT hasta que expire o el servidor lo rechace.
 */

export interface Voto1x10Territorio {
  idTerritorio: number;
  idTerritorioPadre?: number;
  nombrePadre?: string;
  nombre: string;
  tipoTerritorio: string;
}

export interface Voto1x10Usuario {
  idUsuario: number;
  idRol: number;
  rol: string;
  idTerritorio?: number;
  territorio?: string;
  idUsuarioSupervisor?: number;
  /** Login del sistema 1x10 (no confundir con nombreCompleto) — sirve para vincular con el nombre de sesión de WhatsApp. */
  usuario?: string;
  nombreCompleto: string;
  totalPersonas: number;
}

export interface Voto1x10Persona {
  idPersonaMovilizada?: number;
  nombres?: string;
  apellidos?: string;
  celular?: string;
  idUsuarioMovilizador?: number;
}

export interface Voto1x10PersonaRepetida {
  idPersonaMovilizada: number;
  nombres: string;
  apellidos: string;
  celular: string;
  idUsuarioMovilizador: number;
  nombreMovilizador: string;
  idTerritorio?: number;
  nombreTerritorio?: string;
  totalRepeticiones: number;
}

export interface Voto1x10BotRespuestaResult {
  reconocido: boolean;
  idPersonaMovilizada?: number;
  nombreVotante?: string;
  estadoApoyoAsignado?: string;
  mensajeRespuesta?: string;
}

interface ApiEnvelope<T> {
  exito: number;
  dato?: T;
  status?: string;
}

const TOKEN_TTL_MS = 10 * 60 * 1000; // Se re-loguea cada 10 min; más simple que parsear el exp del JWT.

export class Voto1x10Client {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  private async login(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/Auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: this.username, clave: this.password }),
    });
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<{ token: string }>;
    if (!response.ok || body.exito !== 1 || !body.dato?.token) {
      throw new Error(`No se pudo autenticar contra el API 1x10: ${body.status ?? response.statusText}`);
    }
    return body.dato.token;
  }

  private async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }
    this.token = await this.login();
    this.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    return this.token;
  }

  private async get<T>(path: string, retryOn401 = true): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401 && retryOn401) {
      await this.getToken(true);
      return this.get<T>(path, false);
    }

    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
    if (!response.ok || body.exito !== 1) {
      throw new Error(`Error consultando ${path} en API 1x10: ${body.status ?? response.statusText}`);
    }
    return (body.dato ?? ([] as unknown as T));
  }

  territorios(): Promise<Voto1x10Territorio[]> {
    return this.get<Voto1x10Territorio[]>("/api/Territorio/listar?soloActivos=true");
  }

  usuarios(params: { idRol?: number; idTerritorio?: number; idUsuarioSupervisor?: number }): Promise<Voto1x10Usuario[]> {
    const query = new URLSearchParams({ soloActivos: "true" });
    if (params.idRol !== undefined) query.set("idRol", String(params.idRol));
    if (params.idTerritorio !== undefined) query.set("idTerritorio", String(params.idTerritorio));
    if (params.idUsuarioSupervisor !== undefined) query.set("idUsuarioSupervisor", String(params.idUsuarioSupervisor));
    return this.get<Voto1x10Usuario[]>(`/api/Usuario/listar?${query.toString()}`);
  }

  personasDeMovilizador(idUsuarioMovilizador: number): Promise<Voto1x10Persona[]> {
    return this.get<Voto1x10Persona[]>(`/api/PersonaMovilizada/buscar-general?idUsuarioMovilizador=${idUsuarioMovilizador}`);
  }

  celularesRepetidos(params: { idTerritorio?: number; idUsuarioMovilizador?: number }): Promise<Voto1x10PersonaRepetida[]> {
    const query = new URLSearchParams();
    if (params.idTerritorio !== undefined) query.set("idTerritorio", String(params.idTerritorio));
    if (params.idUsuarioMovilizador !== undefined) query.set("idUsuarioMovilizador", String(params.idUsuarioMovilizador));
    const suffix = query.toString();
    return this.get<Voto1x10PersonaRepetida[]>(`/api/PersonaMovilizada/celulares-repetidos${suffix ? `?${suffix}` : ""}`);
  }

  async procesarRespuestaBot(
    celular: string,
    textoRespuesta: string,
    idTerritorio?: number,
  ): Promise<Voto1x10BotRespuestaResult | null> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}/api/WhatsApp/bot/procesar-respuesta`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ celular, textoRespuesta, idTerritorio }),
    });

    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<Voto1x10BotRespuestaResult>;
    if (!response.ok || body.exito !== 1) {
      return null;
    }
    return body.dato ?? null;
  }
}
