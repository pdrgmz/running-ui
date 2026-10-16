import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, tap, throwError } from 'rxjs';
import { ErrorResponseDto } from '../models/api.models';
import { AuthService } from '../services/auth.service';
import { TelemetryService } from '../services/telemetry.service';
import { ToastService } from '../services/toast.service';

const AUTH_ENDPOINT = /\/api\/v1\/auth\/(login|register|refresh)$/;

/**
 * Interceptor funcional:
 *  - Añade `Authorization: Bearer <token>` a las peticiones autenticadas.
 *  - Ante un 401 intenta renovar el token con el refresh token y reintenta.
 *  - Registra cada intercambio HTTP en la consola de telemetría.
 *  - Muestra un toast con el mensaje de error devuelto por la API.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const telemetry = inject(TelemetryService);
  const toast = inject(ToastService);
  const router = inject(Router);

  const isAuthEndpoint = AUTH_ENDPOINT.test(req.url);
  const startedAt = performance.now();

  let request = req;
  const token = auth.token();
  if (!isAuthEndpoint && token) {
    request = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  telemetry.log('req', `→ ${req.method} ${shortUrl(req.url)}`);

  const logResponse = (event: HttpEvent<unknown>): void => {
    if (event instanceof HttpResponse) {
      const ms = Math.round(performance.now() - startedAt);
      telemetry.log('ok', `← ${event.status} ${shortUrl(req.url)} · ${ms} ms`);
    }
  };

  const handleError = (err: unknown): Observable<HttpEvent<unknown>> => {
    const httpError = err as HttpErrorResponse;
    const status = httpError.status ?? 0;
    telemetry.log('err', `✖ ${status || 'NET'} ${shortUrl(req.url)}`);

    // Token caducado: intentar refrescar y reintentar una única vez.
    if (status === 401 && !isAuthEndpoint && auth.canRefresh()) {
      return auth.refresh().pipe(
        switchMap(() =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${auth.token() ?? ''}` } })).pipe(tap(logResponse)),
        ),
        catchError((refreshError: unknown) => {
          auth.logout(true);
          toast.error('SESIÓN EXPIRADA — VUELVE A INICIAR SESIÓN');
          void router.navigate(['/login']);
          return throwError(() => refreshError);
        }),
      );
    }

    toast.error(`ERROR ${status || 'NET'}: ${extractMessage(httpError)}`);
    return throwError(() => err);
  };

  return next(request).pipe(tap(logResponse), catchError(handleError));
};

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://local');
    return parsed.pathname + (parsed.search ? parsed.search : '');
  } catch {
    return url;
  }
}

function extractMessage(err: HttpErrorResponse): string {
  const payload = err.error as ErrorResponseDto | string | null;
  if (payload && typeof payload === 'object' && typeof payload.message === 'string' && payload.message) {
    return payload.message;
  }
  if (typeof payload === 'string' && payload) {
    return payload;
  }
  return err.message || 'Error de red desconocido';
}
