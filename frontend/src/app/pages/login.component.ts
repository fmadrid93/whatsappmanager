import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { AuthService } from "../core/auth.service";

@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  template: `
    <main class="login-wrapper">
      <!-- Subtle Decorative Background Glows -->
      <div class="light-ambient-glow glow-1"></div>
      <div class="light-ambient-glow glow-2"></div>

      <div class="login-grid">
        
        <!-- Left Side: Interactive Live SaaS Workspace Preview (Light Enterprise) -->
        <section class="workspace-showcase">
          
          <div class="brand-badge-row">
            <div class="brand-logo">
              <i class="pi pi-whatsapp"></i>
            </div>
            <div class="brand-info">
              <span class="brand-title">WhatsApp SaaS <span class="badge-pro">EMPRESARIAL</span></span>
              <span class="brand-sub">Plataforma de Automatización y Mensajería Cloud</span>
            </div>
          </div>

          <div class="hero-text">
            <h1>Orquesta tus conversaciones, ventas y campañas masivas</h1>
            <p>
              Automatiza la atención con flujos inteligentes, gestiona múltiples números y monitorea tus métricas en tiempo real desde un solo panel productivo.
            </p>
          </div>

          <!-- Light Glassmorphism Live Workspace Console Preview -->
          <div class="live-console-mock">
            <div class="mock-topbar">
              <div class="mock-status">
                <span class="live-dot"></span>
                <span class="mock-campaign-title">Campaña Activa: <strong>Reactivación de Clientes Q3</strong></span>
              </div>
              <span class="mock-delivery-rate"><i class="pi pi-check-circle"></i> 99.4% Entrega</span>
            </div>

            <!-- Progress Bar -->
            <div class="mock-progress-container">
              <div class="mock-progress-bar"></div>
            </div>
            <div class="mock-progress-stats">
              <span>4,820 / 4,850 mensajes enviados</span>
              <span>Tiempo real</span>
            </div>

            <!-- Simulated WhatsApp Conversation Stream (WhatsApp Style) -->
            <div class="mock-chat-stream">
              <div class="chat-bubble user-msg">
                <span class="msg-sender">Cliente (+58 412...)</span>
                <p>Hola, buenas tardes. Quisiera activar el servicio para mi empresa.</p>
                <span class="msg-time">19:40</span>
              </div>

              <div class="chat-bubble bot-msg">
                <div class="bot-header">
                  <span class="bot-tag"><i class="pi pi-bolt"></i> Bot Automatizado</span>
                </div>
                <p>¡Hola! Con gusto. El sistema permite conectar múltiples números y flujos con IA. ¿Deseas acceso inmediato?</p>
                <span class="msg-time">19:40</span>
              </div>

              <div class="chat-bubble user-msg">
                <p>Sí, por favor. Necesitamos atención 24/7 y campañas masivas.</p>
                <span class="msg-time">19:41</span>
              </div>

              <div class="chat-action-pill">
                <i class="pi pi-user-plus"></i>
                <span>Lead calificado automáticamente • Transferido a Agente de Ventas</span>
              </div>
            </div>
          </div>

          <!-- Micro KPI Highlights -->
          <div class="kpi-pills-row">
            <div class="kpi-pill">
              <i class="pi pi-bolt icon-green"></i>
              <span><strong>1.2s</strong> Respuesta Promedio</span>
            </div>
            <div class="kpi-pill">
              <i class="pi pi-send icon-teal"></i>
              <span><strong>99.8%</strong> Tasa de Entrega</span>
            </div>
            <div class="kpi-pill">
              <i class="pi pi-shield icon-purple"></i>
              <span><strong>Anti-Ban</strong> Rotación Inteligente</span>
            </div>
          </div>

        </section>

        <!-- Right Side: Clean & Secure Login Form (Light Enterprise Card) -->
        <section class="auth-card-section">
          <div class="auth-card">
            
            <div class="auth-card-header">
              <div class="auth-icon-circle">
                <i class="pi pi-lock"></i>
              </div>
              <h2>Iniciar Sesión</h2>
              <p>Ingresa tus credenciales para acceder al centro de control.</p>
            </div>

            <form class="auth-form" (ngSubmit)="submit()">
              
              <!-- Email Input -->
              <div class="form-field">
                <label for="email">Correo Electrónico</label>
                <div class="input-wrapper">
                  <i class="pi pi-envelope input-icon"></i>
                  <input 
                    pInputText 
                    id="email" 
                    name="email" 
                    type="email" 
                    [(ngModel)]="email" 
                    placeholder="usuario@empresa.com"
                    autocomplete="username" 
                    required 
                    class="auth-input"
                  />
                </div>
              </div>

              <!-- Password Input -->
              <div class="form-field">
                <div class="field-header">
                  <label for="password">Contraseña</label>
                  <button type="button" class="btn-toggle-pass" (click)="togglePassword()">
                    <i [class]="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'"></i>
                    <span>{{ showPassword ? 'Ocultar' : 'Mostrar' }}</span>
                  </button>
                </div>
                <div class="input-wrapper">
                  <i class="pi pi-lock input-icon"></i>
                  <input 
                    pInputText 
                    id="password" 
                    name="password" 
                    [type]="showPassword ? 'text' : 'password'" 
                    [(ngModel)]="password" 
                    placeholder="••••••••••••"
                    autocomplete="current-password" 
                    required 
                    class="auth-input"
                  />
                </div>
              </div>

              <!-- Remember Me Option -->
              <div class="form-extra">
                <label class="remember-checkbox">
                  <input type="checkbox" [(ngModel)]="rememberMe" name="rememberMe" />
                  <span>Recordar sesión en este equipo</span>
                </label>
              </div>

              <!-- Error Box -->
              @if (error()) {
                <div class="auth-error-banner">
                  <i class="pi pi-exclamation-triangle"></i>
                  <span>{{ error() }}</span>
                </div>
              }

              <!-- Submit Button -->
              <button 
                type="submit" 
                class="btn-login-submit" 
                [disabled]="!email.trim() || !password.trim() || loading()"
              >
                @if (loading()) {
                  <i class="pi pi-spin pi-spinner"></i>
                  <span>Iniciando sesión...</span>
                } @else {
                  <span>Ingresar al Panel de Control</span>
                  <i class="pi pi-arrow-right"></i>
                }
              </button>

            </form>

            <div class="auth-card-footer">
              <div class="security-guarantee">
                <i class="pi pi-shield"></i>
                <span>Cifrado SSL de 256 bits • Acceso Seguro Corporativo</span>
              </div>
            </div>

          </div>
        </section>

      </div>
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #f8fafc;
      color: #1e293b;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .login-wrapper {
      position: relative;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2.5rem 1.5rem;
      box-sizing: border-box;
      overflow: hidden;
      background: radial-gradient(circle at 10% 15%, #ecfdf5 0%, transparent 40%),
                  radial-gradient(circle at 90% 85%, #f0fdfa 0%, transparent 40%),
                  #f8fafc;
    }

    /* Ambient Lighting */
    .light-ambient-glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      pointer-events: none;
      z-index: 0;
      opacity: 0.6;
    }
    .glow-1 {
      width: 500px;
      height: 500px;
      background: #d1fae5;
      top: -80px;
      left: -100px;
    }
    .glow-2 {
      width: 450px;
      height: 450px;
      background: #e0f2fe;
      bottom: -80px;
      right: -80px;
    }

    /* Main Grid */
    .login-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      max-width: 1180px;
      width: 100%;
      gap: 3.5rem;
      align-items: center;
    }

    /* Left: Workspace Showcase */
    .workspace-showcase {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .brand-badge-row {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #00a884, #059669);
      display: grid;
      place-items: center;
      color: white;
      font-size: 1.5rem;
      box-shadow: 0 8px 18px rgba(0, 168, 132, 0.25);
    }
    .brand-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .brand-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      letter-spacing: -0.02em;
    }
    .badge-pro {
      font-size: 0.65rem;
      font-weight: 800;
      background: #e6f7f2;
      color: #008769;
      border: 1px solid #bbf0e2;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      letter-spacing: 0.05em;
    }
    .brand-sub {
      font-size: 0.82rem;
      color: #64748b;
    }

    .hero-text h1 {
      font-size: 2.15rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      line-height: 1.2;
      letter-spacing: -0.03em;
    }
    .hero-text p {
      font-size: 0.95rem;
      color: #475569;
      line-height: 1.6;
      margin: 0.6rem 0 0 0;
      max-width: 520px;
    }

    /* Live Workspace Console Mock Preview (Light Card) */
    .live-console-mock {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 1.15rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.04), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .mock-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
    }
    .mock-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #1e293b;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .mock-delivery-rate {
      color: #047857;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.76rem;
      background: #ecfdf5;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
    }

    .mock-progress-container {
      width: 100%;
      height: 6px;
      background: #f1f5f9;
      border-radius: 999px;
      overflow: hidden;
    }
    .mock-progress-bar {
      width: 99.4%;
      height: 100%;
      background: linear-gradient(90deg, #00a884, #0284c7);
      border-radius: 999px;
    }
    .mock-progress-stats {
      display: flex;
      justify-content: space-between;
      font-size: 0.73rem;
      color: #64748b;
    }

    .mock-chat-stream {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      background: #f8fafc;
      border: 1px solid #edf2f7;
      border-radius: 12px;
      padding: 0.85rem;
    }

    .chat-bubble {
      max-width: 84%;
      padding: 0.55rem 0.85rem;
      border-radius: 10px;
      font-size: 0.82rem;
      line-height: 1.4;
      position: relative;
    }
    .chat-bubble p { margin: 0; }
    .chat-bubble .msg-time {
      font-size: 0.65rem;
      color: #94a3b8;
      display: block;
      text-align: right;
      margin-top: 0.2rem;
    }
    .user-msg {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      color: #1e293b;
      align-self: flex-start;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .user-msg .msg-sender {
      font-size: 0.7rem;
      color: #0284c7;
      font-weight: 600;
      display: block;
      margin-bottom: 0.2rem;
    }
    .bot-msg {
      background: #d9fdd3;
      border: 1px solid #c0ebba;
      color: #111827;
      align-self: flex-end;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .bot-header {
      margin-bottom: 0.2rem;
    }
    .bot-tag {
      font-size: 0.68rem;
      font-weight: 700;
      color: #047857;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .chat-action-pill {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 0.4rem 0.75rem;
      border-radius: 8px;
      font-size: 0.74rem;
      color: #1d4ed8;
      margin-top: 0.2rem;
    }

    /* KPI Pills Row */
    .kpi-pills-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .kpi-pill {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      padding: 0.45rem 0.85rem;
      border-radius: 999px;
      font-size: 0.76rem;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .kpi-pill strong { color: #0f172a; }
    .icon-green { color: #059669; }
    .icon-teal { color: #0d9488; }
    .icon-purple { color: #7c3aed; }

    /* Right: Auth Card Section */
    .auth-card-section {
      display: flex;
      justify-content: center;
    }
    .auth-card {
      width: 100%;
      max-width: 430px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 2.25rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.08),
                  0 0 0 1px rgba(0, 168, 132, 0.05);
      display: flex;
      flex-direction: column;
      gap: 1.45rem;
    }

    .auth-card-header {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .auth-icon-circle {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #059669;
      display: grid;
      place-items: center;
      font-size: 1.15rem;
      margin-bottom: 0.35rem;
    }
    .auth-card-header h2 {
      font-size: 1.45rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      letter-spacing: -0.02em;
    }
    .auth-card-header p {
      font-size: 0.85rem;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
    }

    /* Form Styles */
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 1.15rem;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .form-field label {
      font-size: 0.82rem;
      font-weight: 600;
      color: #334155;
    }
    .field-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-toggle-pass {
      background: none;
      border: none;
      color: #0284c7;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0;
    }
    .btn-toggle-pass:hover {
      text-decoration: underline;
      color: #0369a1;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-icon {
      position: absolute;
      left: 1rem;
      color: #94a3b8;
      font-size: 0.95rem;
      pointer-events: none;
      z-index: 2;
    }
    .auth-input {
      width: 100%;
      padding: 0.75rem 1rem 0.75rem 2.65rem !important;
      background: #f8fafc !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 10px !important;
      color: #0f172a !important;
      font-size: 0.9rem !important;
      transition: all 0.2s ease !important;
      box-sizing: border-box;
    }
    .auth-input:focus {
      border-color: #00a884 !important;
      box-shadow: 0 0 0 3px rgba(0, 168, 132, 0.15) !important;
      background: #ffffff !important;
    }
    .auth-input::placeholder {
      color: #94a3b8;
    }

    .form-extra {
      display: flex;
      align-items: center;
      font-size: 0.8rem;
    }
    .remember-checkbox {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      color: #64748b;
      cursor: pointer;
    }
    .remember-checkbox input {
      accent-color: #00a884;
      width: 15px;
      height: 15px;
      cursor: pointer;
    }

    .auth-error-banner {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.7rem 0.9rem;
      border-radius: 8px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      font-size: 0.82rem;
    }
    .auth-error-banner i { color: #dc2626; font-size: 1.05rem; }

    .btn-login-submit {
      width: 100%;
      padding: 0.85rem 1.25rem;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #00a884 0%, #059669 100%);
      color: #ffffff;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.55rem;
      box-shadow: 0 4px 12px rgba(0, 168, 132, 0.25);
      transition: all 0.2s ease;
      letter-spacing: -0.01em;
    }
    .btn-login-submit:hover:not(:disabled) {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(0, 168, 132, 0.35);
    }
    .btn-login-submit:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .auth-card-footer {
      text-align: center;
      padding-top: 0.5rem;
      border-top: 1px solid #f1f5f9;
    }
    .security-guarantee {
      font-size: 0.73rem;
      color: #94a3b8;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .login-grid {
        grid-template-columns: 1fr;
        gap: 2.5rem;
        max-width: 540px;
      }
      .workspace-showcase {
        order: 2;
      }
      .auth-card-section {
        order: 1;
      }
    }
    @media (max-width: 640px) {
      .login-wrapper {
        padding: 1.25rem 1rem;
      }
      .hero-text h1 {
        font-size: 1.6rem;
      }
      .auth-card {
        padding: 1.5rem;
      }
    }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = "";
  password = "";
  rememberMe = true;
  showPassword = false;
  readonly loading = signal(false);
  readonly error = signal("");

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    if (!this.email.trim() || !this.password.trim()) {
      this.error.set("Por favor ingresa tu correo y contraseña corporativa.");
      return;
    }

    this.loading.set(true);
    this.error.set("");
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => void this.router.navigateByUrl("/"),
      error: (error: { error?: { message?: string } }) => {
        this.error.set(error.error?.message ?? "Credenciales inválidas o error de conexión con el servidor.");
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
