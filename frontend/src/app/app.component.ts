import { Component, inject, signal } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { AuthService } from "./core/auth.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, ToastModule],
  template: `
    <p-toast />
    @if (auth.isAuthenticated()) {
      <div class="shell" [class.collapsed]="sidebarCollapsed()">
        <aside class="sidebar">
          <a routerLink="/" class="brand">
            <i class="pi pi-comments"></i>
            <span class="brand-text">WhatsApp SaaS <small>v1.2.1</small></span>
          </a>

          <nav>
            <span class="nav-section">Mensajería</span>
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><i class="pi pi-home"></i><span>Resumen</span></a>
            <a routerLink="/sesiones" routerLinkActive="active"><i class="pi pi-wifi"></i><span>Sesiones</span></a>
            <a routerLink="/campanias" routerLinkActive="active"><i class="pi pi-send"></i><span>Campañas</span></a>
            <a routerLink="/envios-jerarquia" routerLinkActive="active"><i class="pi pi-sitemap"></i><span>Envíos por jerarquía</span></a>
            <a routerLink="/numeros-repetidos" routerLinkActive="active"><i class="pi pi-copy"></i><span>Números repetidos</span></a>

            <span class="nav-section">Automatización</span>
            <a routerLink="/flows" routerLinkActive="active"><i class="pi pi-comment"></i><span>Bot Manager</span></a>
            <a routerLink="/conversations" routerLinkActive="active"><i class="pi pi-comments"></i><span>Conversaciones</span></a>

            @if (auth.canViewAudit() || auth.canViewSystem()) {
              <span class="nav-section">Sistema</span>
              @if (auth.canViewAudit()) { <a routerLink="/audit" routerLinkActive="active"><i class="pi pi-shield"></i><span>Auditoría</span></a> }
              @if (auth.canViewSystem()) { <a routerLink="/integrations" routerLinkActive="active"><i class="pi pi-link"></i><span>Integraciones</span></a> }
            }
          </nav>

          <div class="identity">
            <div class="avatar">{{ initials() }}</div>
            <div class="identity-text">
              <span>{{ auth.user()?.email }}</span>
              <small>{{ auth.user()?.role }}</small>
            </div>
          </div>
          <p-button label="Salir" icon="pi pi-sign-out" severity="secondary" [text]="true" styleClass="logout-btn" (onClick)="logout()" />
        </aside>

        <div class="main-col">
          <header class="topbar">
            <button type="button" class="collapse-btn" (click)="toggleSidebar()" aria-label="Colapsar menú">
              <i class="pi" [class.pi-angle-left]="!sidebarCollapsed()" [class.pi-angle-right]="sidebarCollapsed()"></i>
            </button>
          </header>
          <main class="content"><router-outlet /></main>
        </div>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styles: [`
    :host { display: block; }
    .shell { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; background: #f4f6f9; }
    .shell.collapsed { grid-template-columns: 72px 1fr; }

    .sidebar {
      background: #10192e;
      color: #cbd5e1;
      display: flex;
      flex-direction: column;
      padding: 1.1rem .85rem;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 20;
    }
    .brand { display: flex; align-items: center; gap: .6rem; color: #fff; font-weight: 800; text-decoration: none; padding: .3rem .4rem .9rem; white-space: nowrap; overflow: hidden; }
    .brand i { font-size: 1.25rem; color: #34d399; flex-shrink: 0; }
    .brand-text { display: flex; flex-direction: column; line-height: 1.15; }
    .brand small { font-size: .62rem; font-weight: 600; color: #34d399; letter-spacing: .02em; }
    .collapsed .brand-text { display: none; }

    nav { display: flex; flex-direction: column; gap: .15rem; flex: 1; margin-top: .3rem; }
    .nav-section { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: #64748b; font-weight: 700; padding: .9rem .6rem .3rem; }
    .collapsed .nav-section { display: none; }
    nav a { display: flex; align-items: center; gap: .7rem; padding: .6rem .65rem; border-radius: .55rem; color: #cbd5e1; text-decoration: none; font-size: .87rem; font-weight: 500; white-space: nowrap; overflow: hidden; transition: background .12s ease, color .12s ease; }
    nav a i { font-size: 1rem; width: 1.1rem; text-align: center; flex-shrink: 0; color: #8896ab; transition: color .12s ease; }
    nav a:hover { background: #1a2740; color: #fff; }
    nav a:hover i { color: #cbd5e1; }
    nav a.active { background: #16351f; color: #6ee7a8; font-weight: 700; }
    nav a.active i { color: #34d399; }
    .collapsed nav a span:not(.avatar) { display: none; }
    .collapsed nav a { justify-content: center; }

    .identity { display: flex; align-items: center; gap: .6rem; padding: .8rem .4rem; margin-top: .5rem; border-top: 1px solid #1f2c47; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; background: #1a2740; color: #6ee7a8; display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 700; flex-shrink: 0; }
    .identity-text { display: flex; flex-direction: column; overflow: hidden; }
    .identity-text span { font-size: .78rem; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .identity-text small { font-size: .7rem; color: #64748b; }
    .collapsed .identity-text { display: none; }
    :host ::ng-deep .logout-btn { justify-content: flex-start; color: #94a3b8 !important; padding-left: .65rem !important; }
    .collapsed :host ::ng-deep .logout-btn .p-button-label { display: none; }

    .main-col { display: flex; flex-direction: column; min-width: 0; }
    .topbar { min-height: 52px; display: flex; align-items: center; padding: 0 1.1rem; background: #fff; border-bottom: 1px solid #e4e8ec; position: sticky; top: 0; z-index: 10; }
    .collapse-btn { border: 1px solid #e2e8f0; background: #fff; border-radius: .5rem; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #52606d; }
    .collapse-btn:hover { background: #f4f6f9; }
    .content { padding: 0; flex: 1; min-width: 0; }

    @media (max-width: 900px) {
      .shell, .shell.collapsed { grid-template-columns: 72px 1fr; }
      .brand-text, nav a span, .identity-text { display: none; }
      nav a { justify-content: center; }
    }
  `],
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly sidebarCollapsed = signal(false);

  initials(): string {
    const email = this.auth.user()?.email ?? "";
    const name = email.split("@")[0] ?? "";
    const parts = name.split(/[._-]/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl("/login"),
      error: () => void this.router.navigateByUrl("/login"),
    });
  }
}
