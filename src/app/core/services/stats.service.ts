import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AcwrStatusDto,
  EddingtonStatsDto,
  PmcPointDto,
  RecordResponseDto,
  SummaryStatsDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';

/**
 * Estadísticas acumuladas, récords personales (PB) y analítica
 * global del usuario autenticado.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  /** GET /api/v1/stats/summary — resumen acumulado del corredor. */
  summary(): Observable<SummaryStatsDto> {
    return this.http.get<SummaryStatsDto>(this.api.url('/api/v1/stats/summary'));
  }

  /** GET /api/v1/stats/records — marcas personales por distancia. */
  records(): Observable<RecordResponseDto[]> {
    return this.http.get<RecordResponseDto[]>(this.api.url('/api/v1/stats/records'));
  }

  /** POST /api/v1/stats/recalculate — recalcula estadísticas y PB. */
  recalculate(): Observable<unknown> {
    return this.http.post(this.api.url('/api/v1/stats/recalculate'), {});
  }

  /** GET /api/v1/analytics/pmc — histórico CTL/ATL/TSB/ACWR (90 días por defecto). */
  pmc(startDate?: string, endDate?: string): Observable<PmcPointDto[]> {
    let params = new HttpParams();
    if (startDate) {
      params = params.set('startDate', startDate);
    }
    if (endDate) {
      params = params.set('endDate', endDate);
    }
    return this.http.get<PmcPointDto[]>(this.api.url('/api/v1/analytics/pmc'), { params });
  }

  /** GET /api/v1/analytics/eddington — número de Eddington y progreso. */
  eddington(): Observable<EddingtonStatsDto> {
    return this.http.get<EddingtonStatsDto>(this.api.url('/api/v1/analytics/eddington'));
  }

  /** GET /api/v1/analytics/acwr/current — ratio de carga aguda:crónica actual. */
  acwrCurrent(): Observable<AcwrStatusDto> {
    return this.http.get<AcwrStatusDto>(this.api.url('/api/v1/analytics/acwr/current'));
  }
}
