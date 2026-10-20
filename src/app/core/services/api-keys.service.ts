import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApiKeyCreatedResponseDto,
  ApiKeyResponseDto,
  CreateApiKeyRequestDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';

/**
 * Claves de API (`/api/v1/auth/api-keys`): credenciales de máquina con
 * prefijo `rk_` que se envían en la cabecera `X-Api-Key` como alternativa
 * al JWT para automatizaciones (n8n, scripts, cron).
 */
@Injectable({ providedIn: 'root' })
export class ApiKeysService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  /** GET /api/v1/auth/api-keys — metadatos de las claves del usuario. */
  list(): Observable<ApiKeyResponseDto[]> {
    return this.http.get<ApiKeyResponseDto[]>(this.api.url('/api/v1/auth/api-keys'));
  }

  /** POST /api/v1/auth/api-keys — genera una clave nueva (valor visible una sola vez). */
  create(request: CreateApiKeyRequestDto): Observable<ApiKeyCreatedResponseDto> {
    return this.http.post<ApiKeyCreatedResponseDto>(this.api.url('/api/v1/auth/api-keys'), request);
  }

  /** DELETE /api/v1/auth/api-keys/{id} — revoca una clave propia. */
  revoke(id: number): Observable<void> {
    return this.http.delete<void>(this.api.url(`/api/v1/auth/api-keys/${id}`));
  }
}
