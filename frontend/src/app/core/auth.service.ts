import { Injectable, computed, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom, finalize, Observable, of, shareReplay, tap } from "rxjs";

export interface CurrentUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  displayName?: string;
}

interface AuthResponse {
  accessToken: string;
  user: CurrentUser;
}

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly userSignal = signal<CurrentUser | null>(null);
  private refreshRequest?: Observable<AuthResponse>;

  readonly user = this.userSignal.asReadonly();
  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.accessTokenSignal() && !!this.userSignal());
  readonly canViewAudit = computed(() => this.hasAnyRole("SUPER_ADMIN", "TENANT_ADMIN", "ADMIN", "SUPERVISOR"));
  readonly canViewSystem = computed(() => this.hasAnyRole("SUPER_ADMIN", "TENANT_ADMIN", "ADMIN"));

  constructor(private readonly http: HttpClient) {}

  async restoreSession(): Promise<void> {
    try {
      await firstValueFrom(this.refreshAccessToken());
    } catch {
      this.clearLocalSession();
    }
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>("/api/auth/login", { email, password }, { withCredentials: true }).pipe(
      tap((result) => this.applyAuth(result)),
    );
  }

  refreshAccessToken(): Observable<AuthResponse> {
    if (!this.refreshRequest) {
      this.refreshRequest = this.http
        .post<AuthResponse>("/api/auth/refresh", {}, { withCredentials: true })
        .pipe(
          tap((result) => this.applyAuth(result)),
          finalize(() => { this.refreshRequest = undefined; }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refreshRequest;
  }

  logout(): Observable<void> {
    return this.http.post<void>("/api/auth/logout", {}, { withCredentials: true }).pipe(
      finalize(() => this.clearLocalSession()),
    );
  }

  logoutAll(): Observable<void> {
    return this.http.post<void>("/api/auth/logout-all", {}, { withCredentials: true }).pipe(
      finalize(() => this.clearLocalSession()),
    );
  }

  hasAnyRole(...roles: string[]): boolean {
    const role = this.userSignal()?.role;
    return !!role && roles.includes(role);
  }

  clearLocalSession(): void {
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
  }

  private applyAuth(result: AuthResponse): void {
    this.accessTokenSignal.set(result.accessToken);
    this.userSignal.set(result.user);
  }
}
