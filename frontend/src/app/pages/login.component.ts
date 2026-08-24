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
      <p-card header="WhatsApp SaaS" subheader="Panel de Administración">
        <form class="form-grid" (ngSubmit)="submit()">
          <label for="email">Correo Electrónico</label>
          <input 
            pInputText 
            id="email" 
            name="email" 
            type="email" 
            [(ngModel)]="email" 
            placeholder="admin@tudominio.com"
            autocomplete="username" 
            required 
          />

          <label for="password">Contraseña</label>
          <input 
            pInputText 
            id="password" 
            name="password" 
            type="password" 
            [(ngModel)]="password" 
            placeholder="••••••••"
            autocomplete="current-password" 
            required 
          />

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          <p-button 
            type="submit" 
            label="Ingresar al Panel" 
            icon="pi pi-sign-in" 
            [loading]="loading()" 
            [disabled]="!email || !password"
          />
        </form>
      </p-card>
    </main>
  `,
  styles: [`
    .login-shell { 
      min-height: 100vh; 
      display: grid; 
      place-items: center; 
      padding: 1rem; 
      background: radial-gradient(circle at top, #e5f7eb, #f4f6f8 55%); 
    }
    p-card { 
      width: min(430px, 100%); 
    }
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .error {
      color: #dc2626;
      font-size: 0.85rem;
      background: #fef2f2;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #fecaca;
    }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = "";
  password = "";
  readonly loading = signal(false);
  readonly error = signal("");

  submit(): void {
    if (!this.email.trim() || !this.password.trim()) {
      this.error.set("Por favor ingresa tu correo y contraseña.");
      return;
    }

    this.loading.set(true);
    this.error.set("");
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => void this.router.navigateByUrl("/"),
      error: (error: { error?: { message?: string } }) => {
        this.error.set(error.error?.message ?? "Credenciales inválidas o error de conexión.");
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
