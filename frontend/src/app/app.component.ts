import { Component, inject } from "@angular/core";
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
      <header class="topbar">
        <a routerLink="/" class="brand"><i class="pi pi-comments"></i> WhatsApp SaaS <small>v1.1.2 alpha</small></a>
        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Resumen</a>
          <a routerLink="/sessions" routerLinkActive="active">Sesiones</a>
          <a routerLink="/campaigns" routerLinkActive="active">Campañas</a>
          <a routerLink="/recurring-campaigns" routerLinkActive="active">Envíos recurrentes</a>
          <a routerLink="/campaigns-jerarquico" routerLinkActive="active">Envíos por jerarquía</a>
          <a routerLink="/flows" routerLinkActive="active">Bot Manager</a>
          <a routerLink="/conversations" routerLinkActive="active">Conversaciones</a>
          @if (auth.canViewAudit()) { <a routerLink="/audit" routerLinkActive="active">Auditoría</a> }
          @if (auth.canViewSystem()) { <a routerLink="/integrations" routerLinkActive="active">Integraciones</a> }
        </nav>
        <div class="identity"><span>{{ auth.user()?.email }}</span><small>{{ auth.user()?.role }}</small></div>
        <p-button label="Salir" icon="pi pi-sign-out" severity="secondary" [text]="true" (onClick)="logout()" />
      </header>
    }
    <router-outlet />
  `,
  styles: [`
    .topbar { min-height: 64px; display: flex; align-items: center; gap: 1.2rem; padding: .7rem 1.4rem; background: white; border-bottom: 1px solid #e4e8ec; position: sticky; top: 0; z-index: 10; }
    .brand { font-weight: 800; display: flex; align-items: center; gap: .5rem; white-space: nowrap; }
    .brand small { font-size: .65rem; background: #eef7f1; padding: .2rem .35rem; border-radius: .3rem; }
    nav { display: flex; gap: .25rem; flex: 1; }
    nav a { padding: .55rem .75rem; border-radius: .5rem; color: #52606d; }
    nav a.active { background: #eef7f1; color: #0b6b3a; font-weight: 700; }
    .identity { display: grid; text-align: right; font-size: .82rem; }
    .identity small { color: #64748b; }
    @media (max-width: 1000px) { .topbar { flex-wrap: wrap; } nav { order: 3; overflow-x: auto; width: 100%; } .identity { display: none; } }
  `],
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl("/login"),
      error: () => void this.router.navigateByUrl("/login"),
    });
  }
}
