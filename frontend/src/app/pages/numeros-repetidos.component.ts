import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { MessageService } from "primeng/api";
import {
  ApiService,
  type Voto1x10Jerarquia,
  type Voto1x10PersonaRepetida,
  type Voto1x10Usuario,
} from "../core/api.service";

/**
 * Reporte de calidad de datos: personas del padrón 1x10 que comparten el
 * mismo número de celular con otra persona (dentro del mismo territorio o
 * movilizador elegido). Algunos casos son legítimos (familias compartiendo
 * un teléfono), otros son datos de relleno cargados por error — esta
 * pantalla ayuda a distinguirlos antes de armar un envío masivo.
 */
@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule],
  template: `
    <main class="page">
      <div class="page-header">
        <div>
          <h1>Números repetidos</h1>
          <div class="muted">Personas del padrón que comparten el mismo celular con otra — revisá si es real (familia) o un dato cargado por error antes de mandar una campaña.</div>
        </div>
      </div>

      <p-card header="Filtro">
        <div class="filter-row">
          <div class="filter-field">
            <label>Territorio</label>
            <select [ngModel]="territorioId()" (ngModelChange)="territorioId.set($event)">
              <option [ngValue]="undefined">Todos (puede tardar más)</option>
              @for (territorio of territorioOptions(); track territorio.id) {
                <option [ngValue]="territorio.id">{{ territorio.label }}</option>
              }
            </select>
          </div>

          <div class="filter-field">
            <label>Movilizador <span class="muted small">({{ movilizadorOptions().length }})</span></label>
            <select [ngModel]="movilizadorId()" (ngModelChange)="movilizadorId.set($event)">
              <option [ngValue]="undefined">Todos los de este territorio</option>
              @for (movilizador of movilizadorOptions(); track movilizador.id) {
                <option [ngValue]="movilizador.id">{{ movilizador.label }}</option>
              }
            </select>
          </div>

          <p-button label="Buscar repetidos" icon="pi pi-search" [loading]="loading()" (onClick)="buscar()" />
        </div>
      </p-card>

      @if (resultado(); as grupos) {
        <p-card header="Resultado">
          @if (grupos.length === 0) {
            <div class="muted">No se encontraron números repetidos con este filtro.</div>
          } @else {
            <div class="muted small" style="margin-bottom:.8rem">{{ grupos.length }} número(s) repetido(s), {{ totalPersonas() }} persona(s) en total.</div>
            <div class="grupos">
              @for (grupo of grupos; track grupo.celular) {
                <div class="grupo-card">
                  <div class="grupo-header">
                    <i class="pi pi-phone"></i>
                    <strong>{{ grupo.celular }}</strong>
                    <span class="badge">{{ grupo.personas.length }} personas</span>
                  </div>
                  <div class="grupo-personas">
                    @for (persona of grupo.personas; track persona.idPersonaMovilizada) {
                      <div class="persona-row">
                        <span class="persona-nombre">{{ persona.nombres }} {{ persona.apellidos }}</span>
                        <span class="persona-meta">{{ persona.nombreMovilizador }}@if (persona.nombreTerritorio) { <span> · {{ persona.nombreTerritorio }}</span> }</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </p-card>
      }
    </main>
  `,
  styles: [`
    .filter-row{display:flex;gap:1rem;align-items:flex-end;flex-wrap:wrap}
    .filter-field{display:flex;flex-direction:column;gap:.35rem;min-width:220px}
    .filter-field label{font-size:.85rem;font-weight:600;color:#334155}
    .filter-field select{border:1px solid #cfd8e3;border-radius:9px;padding:.6rem .7rem;background:#fff}
    .small{font-size:.75rem}
    .grupos{display:grid;gap:.7rem}
    .grupo-card{border:1px solid #fecaca;background:#fef2f2;border-radius:12px;padding:.75rem .9rem}
    .grupo-header{display:flex;align-items:center;gap:.5rem;font-size:.95rem;color:#7f1d1d}
    .grupo-header i{color:#991b1b}
    .badge{margin-left:auto;background:#fee2e2;color:#991b1b;border-radius:999px;padding:.2rem .6rem;font-size:.72rem;font-weight:700}
    .grupo-personas{margin-top:.6rem;display:grid;gap:.35rem;border-top:1px dashed #fecaca;padding-top:.5rem}
    .persona-row{display:flex;justify-content:space-between;gap:.6rem;font-size:.84rem;flex-wrap:wrap}
    .persona-nombre{font-weight:600;color:#334155}
    .persona-meta{color:#7f1d1d}
  `],
})
export class NumerosRepetidosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly messages = inject(MessageService);

  readonly jerarquia = signal<Voto1x10Jerarquia | null>(null);
  readonly territorioId = signal<number | undefined>(undefined);
  readonly movilizadorId = signal<number | undefined>(undefined);
  readonly loading = signal(false);
  readonly personasRepetidas = signal<Voto1x10PersonaRepetida[] | null>(null);

  readonly territorioOptions = computed<{ id: number; label: string }[]>(() =>
    (this.jerarquia()?.territorios ?? []).map((t) => ({ id: t.idTerritorio, label: `${t.nombre} (${t.tipoTerritorio})` })));

  readonly movilizadorOptions = computed<{ id: number; label: string }[]>(() => {
    const data = this.jerarquia();
    if (!data) return [];
    const territorio = this.territorioId();
    const movilizadores: Voto1x10Usuario[] = territorio === undefined
      ? data.movilizadores
      : data.movilizadores.filter((m) => m.idTerritorio === territorio);
    return movilizadores.map((m) => ({ id: m.idUsuario, label: m.nombreCompleto }));
  });

  readonly resultado = computed(() => {
    const items = this.personasRepetidas();
    if (!items) return null;
    const grupos = new Map<string, Voto1x10PersonaRepetida[]>();
    for (const item of items) {
      const lista = grupos.get(item.celular) ?? [];
      lista.push(item);
      grupos.set(item.celular, lista);
    }
    return [...grupos.entries()].map(([celular, personas]) => ({ celular, personas }));
  });

  readonly totalPersonas = computed(() => this.personasRepetidas()?.length ?? 0);

  ngOnInit(): void {
    this.api.voto1x10Jerarquia().subscribe({
      next: (data) => this.jerarquia.set(data),
      error: (error: { error?: { message?: string } }) =>
        this.messages.add({ severity: "error", summary: "No se pudo cargar la estructura de 1x10", detail: error.error?.message }),
    });
  }

  buscar(): void {
    this.loading.set(true);
    this.api.voto1x10CelularesRepetidos({ idTerritorio: this.territorioId(), idUsuarioMovilizador: this.movilizadorId() }).subscribe({
      next: (items) => {
        this.loading.set(false);
        this.personasRepetidas.set(items);
      },
      error: (error: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo buscar números repetidos", detail: error.error?.message });
      },
    });
  }
}
