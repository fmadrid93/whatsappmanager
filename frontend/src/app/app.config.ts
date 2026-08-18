import { ApplicationConfig, inject, provideAppInitializer } from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeng/themes/aura";
import { MessageService } from "primeng/api";
import { routes } from "./app.routes";
import { authInterceptor } from "./core/auth.interceptor";
import { AuthService } from "./core/auth.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: Aura } }),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    MessageService,
  ],
};
