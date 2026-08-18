import { inject } from "@angular/core";
import type { HttpInterceptorFn } from "@angular/common/http";
import { HttpErrorResponse } from "@angular/common/http";
import { catchError, switchMap, throwError } from "rxjs";
import { AuthService } from "./auth.service";

const refreshExcluded = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();
  const isApi = request.url.startsWith("/api/");
  const prepared = request.clone({
    withCredentials: isApi || request.withCredentials,
    setHeaders: token && isApi ? { Authorization: `Bearer ${token}` } : {},
  });

  return next(prepared).pipe(
    catchError((error: unknown) => {
      const canRefresh = error instanceof HttpErrorResponse
        && error.status === 401
        && isApi
        && !refreshExcluded.some((path) => request.url.startsWith(path));
      if (!canRefresh) return throwError(() => error);

      return auth.refreshAccessToken().pipe(
        switchMap((result) => next(request.clone({
          withCredentials: true,
          setHeaders: { Authorization: `Bearer ${result.accessToken}` },
        }))),
        catchError((refreshError) => {
          auth.clearLocalSession();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
