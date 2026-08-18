import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { AuthService } from "../core/auth.service";

@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule],
  template: `
    <main class="login-shell">
      <p-card header="WhatsApp SaaS" subheader="Administración multi-sesión">
        <form class="form-grid" (ngSubmit)="submit()">
          <label for="email">Correo</label>
          <input pInputText id="email" name="email" type="email" [(ngModel)]="email" autocomplete="username" />
          <label for="password">Contraseña</label>
          <input pInputText id="password" name="password" type="password" [(ngModel)]="password" autocomplete="current-password" />
          @if (error()) { <div class="error">{{ error() }}</div> }
          <p-button type="submit" label="Ingresar" icon="pi pi-sign-in" [loading]="loading()" />
          <small class="muted">Demo: admin&#64;demo.local / Cambiar123!</small>
        </form>
      </p-card>
    </main>
  `,
  styles: [`
    .login-shell { min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: radial-gradient(circle at top, #e5f7eb, #f4f6f8 55%); }
    p-card { width: min(430px, 100%); }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  email = "admin@demo.local";
  password = "Cambiar123!";
  readonly loading = signal(false);
  readonly error = signal("");

  submit(): void {
    this.loading.set(true);
    this.error.set("");
    this.auth.login(this.email, this.password).subscribe({
      next: () => void this.router.navigateByUrl("/"),
      error: (error: { error?: { message?: string } }) => {
        this.error.set(error.error?.message ?? "No se pudo iniciar sesión.");
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
