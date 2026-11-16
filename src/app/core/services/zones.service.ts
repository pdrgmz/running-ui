import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  RunnerZonesResponseDto,
  UpdateRunnerZonesRequestDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';

/**
 * Perfil de zonas del corredor (`/api/v1/zones`): zonas de frecuencia cardíaca
 * y de ritmo calculadas desde el historial o editadas a mano.
 *
 * `get()` devuelve el perfil guardado y, si aún no existe, uno por defecto
 * calculado al vuelo con la FC máxima robusta y las marcas personales, sin
 * persistirlo. Por eso siempre se puede pintar algo en la ficha del corredor.
 */
@Injectable({ providedIn: 'root' })
export class ZonesService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  /** GET /api/v1/zones — perfil guardado o calculado por defecto. */
  get(): Observable<RunnerZonesResponseDto> {
    return this.http.get<RunnerZonesResponseDto>(this.api.url('/api/v1/zones'));
  }

  /**
   * POST /api/v1/zones/calculate — recalcula desde el historial y guarda el
   * resultado con source=CALCULATED.
   */
  calculate(): Observable<RunnerZonesResponseDto> {
    return this.http.post<RunnerZonesResponseDto>(this.api.url('/api/v1/zones/calculate'), {});
  }

  /** PUT /api/v1/zones — edición manual de FC máxima, reposo, umbral y rangos. */
  update(request: UpdateRunnerZonesRequestDto): Observable<RunnerZonesResponseDto> {
    return this.http.put<RunnerZonesResponseDto>(this.api.url('/api/v1/zones'), request);
  }
}
