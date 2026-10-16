import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, shareReplay, tap, throwError } from 'rxjs';
import {
  AuthResponseDto,
  JwtPayload,
  LoginRequestDto,
  RefreshTokenRequestDto,
  RegisterRequestDto,
  SessionState,
  UserResponseDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';
import { TelemetryService } from './telemetry.service';

const STORAGE_KEY = 'rt.session';

interface PersistedState {
  session: SessionState | null;
  user: UserResponseDto | null;
}

/**
 * Gestión de la sesión JWT: login, registro, renovación de token y datos
 * del usuario autenticado (`/api/v1/auth/*`).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly telemetry = inject(TelemetryService);

  private readonly persisted = readPersistedState();

  private readonly sessionSignal = signal<SessionState | null>(this.persisted.session);
  private readonly userSignal = signal<UserResponseDto | null>(this.persisted.user);

  private refreshInFlight$: Observable<AuthResponseDto> | null = null;

  readonly session = this.sessionSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly token = computed(() => this.sessionSignal()?.token ?? null);
  readonly isAuthenticated = computed(() => !!this.sessionSignal()?.token);

  /** Momento de expiración del access token (epoch ms). */
  readonly accessExpiresAt = computed(() => {
    const s = this.sessionSignal();
    return s ? s.issuedAt + s.expiresInSeconds * 1000 : null;
  });

  /** Momento de expiración del refresh token (epoch ms). */
  readonly refreshExpiresAt = computed(() => {
    const s = this.sessionSignal();
    return s ? s.issuedAt + s.refreshExpiresInSeconds * 1000 : null;
  });

  /** Segundos restantes de validez del access token (aprox., sin refetch). */
  readonly accessTokenSecondsLeft = computed(() => {
    const expiresAt = this.accessExpiresAt();
    return expiresAt === null ? 0 : Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  });

  /** Claims decodificados del access token (sin verificar firma). */
  readonly accessTokenClaims = computed<JwtPayload | null>(() => {
    const token = this.token();
    return token ? decodeJwtPayload(token) : null;
  });

  /** Claims decodificados del refresh token (sin verificar firma). */
  readonly refreshTokenClaims = computed<JwtPayload | null>(() => {
    const token = this.sessionSignal()?.refreshToken;
    return token ? decodeJwtPayload(token) : null;
  });

  login(email: string, password: string): Observable<AuthResponseDto> {
    const body: LoginRequestDto = { email, password };
    return this.http
      .post<AuthResponseDto>(this.api.url('/api/v1/auth/login'), body)
      .pipe(tap((res) => this.storeAuthResponse(res, 'login')));
  }

  register(email: string, password: string): Observable<AuthResponseDto> {
    const body: RegisterRequestDto = { email, password };
    return this.http
      .post<AuthResponseDto>(this.api.url('/api/v1/auth/register'), body)
      .pipe(tap((res) => this.storeAuthResponse(res, 'registro')));
  }

  /** Renueva el access token usando el refresh token (deduplicado). */
  refresh(): Observable<AuthResponseDto> {
    const refreshToken = this.sessionSignal()?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No hay refresh token disponible'));
    }

    if (!this.refreshInFlight$) {
      const body: RefreshTokenRequestDto = { refreshToken };
      this.refreshInFlight$ = this.http
        .post<AuthResponseDto>(this.api.url('/api/v1/auth/refresh'), body)
        .pipe(
          tap((res) => this.storeAuthResponse(res, 'refresh')),
          finalize(() => (this.refreshInFlight$ = null)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refreshInFlight$;
  }

  /** ¿Es posible intentar una renovación silenciosa del token? */
  canRefresh(): boolean {
    return !!this.sessionSignal()?.refreshToken;
  }

  /** Obtiene los datos del usuario autenticado y actualiza la caché local. */
  loadMe(): Observable<UserResponseDto> {
    return this.http
      .get<UserResponseDto>(this.api.url('/api/v1/auth/me'))
      .pipe(tap((user) => this.persist({ session: this.sessionSignal(), user })));
  }

  /** Cierra la sesión local (opcionalmente silencioso para renovaciones fallidas). */
  logout(expired = false): void {
    this.sessionSignal.set(null);
    this.userSignal.set(null);
    this.persist({ session: null, user: null });
    this.telemetry.log('sys', expired ? 'Sesión expirada — token renovado sin éxito' : 'Sesión cerrada por el usuario');
  }

  private storeAuthResponse(res: AuthResponseDto, source: string): void {
    const session: SessionState = {
      token: res.token,
      tokenType: res.tokenType,
      refreshToken: res.refreshToken,
      expiresInSeconds: res.expiresInSeconds,
      refreshExpiresInSeconds: res.refreshExpiresInSeconds,
      issuedAt: Date.now(),
    };
    this.sessionSignal.set(session);
    this.userSignal.set(res.user);
    this.persist({ session, user: res.user });
    this.telemetry.log('sys', `Autenticación OK (${source}) — usuario #${res.user.id} ${res.user.email}`);
  }

  private persist(state: PersistedState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* almacenamiento no disponible */
    }
  }
}

function readPersistedState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { session: null, user: null };
    }
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.session?.token) {
      return { session: null, user: null };
    }
    return { session: parsed.session, user: parsed.user ?? null };
  } catch {
    return { session: null, user: null };
  }
}

/** Decodifica el payload de un JWT (Base64URL) sin verificar la firma. */
export function decodeJwtPayload(token: string): JwtPayload | null {
  const part = token.split('.')[1];
  if (!part) {
    return null;
  }
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}
