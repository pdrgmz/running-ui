import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Activity,
  ActivityTrackpoint,
  CardiacDriftResponseDto,
  ElevationCoverageDto,
  HrZonesResponseDto,
  PageActivity,
  SplitDto,
  TrackpointCompletionResultDto,
  TrackpointMetricsBatchCompletionResultDto,
  TrackpointMetricsCompletionResultDto,
  TrainingLoadResponseDto,
  Vo2MaxVamResponseDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';

export type TrackpointResolution = 'low' | 'medium' | 'high';

/**
 * Consulta de actividades (carreras) del usuario autenticado y sus
 * analíticas por sesión: splits, zonas de FC, carga, VO2Max y GPS.
 */
@Injectable({ providedIn: 'root' })
export class ActivitiesService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  /** GET /api/v1/activities — página de actividades (orden startTime DESC). */
  list(page = 0, size = 10): Observable<PageActivity> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('sort', 'startTime,DESC');
    return this.http.get<PageActivity>(this.api.url('/api/v1/activities'), { params });
  }

  /** GET /api/v1/activities/{id} — resumen consolidado de una carrera. */
  byId(id: string): Observable<Activity> {
    return this.http.get<Activity>(this.api.url(`/api/v1/activities/${encodeURIComponent(id)}`));
  }

  /** GET /api/v1/activities/{id}/trackpoints — telemetría segundo a segundo. */
  trackpoints(id: string, resolution: TrackpointResolution = 'medium'): Observable<ActivityTrackpoint[]> {
    const params = new HttpParams().set('resolution', resolution);
    return this.http.get<ActivityTrackpoint[]>(
      this.api.url(`/api/v1/activities/${encodeURIComponent(id)}/trackpoints`),
      { params },
    );
  }

  /** DELETE /api/v1/activities/{id} — elimina una carrera del usuario. */
  deleteById(id: string): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(
      this.api.url(`/api/v1/activities/${encodeURIComponent(id)}`),
    );
  }

  /** DELETE /api/v1/activities — vacía todo el historial del usuario. */
  deleteAll(): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(this.api.url('/api/v1/activities'));
  }

  /** POST /api/v1/activities/{id}/complete-trackpoints — completa GPS, altitud y métricas. */
  completeTrackpoints(id: string): Observable<TrackpointCompletionResultDto> {
    return this.http.post<TrackpointCompletionResultDto>(
      this.api.url(`/api/v1/activities/${encodeURIComponent(id)}/complete-trackpoints`),
      {},
    );
  }

  /** POST /api/v1/activities/{id}/complete-metrics — completa FC, cadencia y velocidad. */
  completeMetrics(id: string): Observable<TrackpointMetricsCompletionResultDto> {
    return this.http.post<TrackpointMetricsCompletionResultDto>(
      this.api.url(`/api/v1/activities/${encodeURIComponent(id)}/complete-metrics`),
      {},
    );
  }

  /** POST /api/v1/activities/complete-metrics — completa las métricas de todo el historial. */
  completeAllMetrics(): Observable<TrackpointMetricsBatchCompletionResultDto> {
    return this.http.post<TrackpointMetricsBatchCompletionResultDto>(
      this.api.url('/api/v1/activities/complete-metrics'),
      {},
    );
  }

  /** GET /api/v1/activities/elevation-coverage — cobertura de altitudes del usuario. */
  elevationCoverage(): Observable<ElevationCoverageDto> {
    return this.http.get<ElevationCoverageDto>(this.api.url('/api/v1/activities/elevation-coverage'));
  }

  /** GET /api/v1/analytics/{id}/splits — splits por kilómetro. */
  splits(id: string): Observable<SplitDto[]> {
    return this.http.get<SplitDto[]>(this.api.url(`/api/v1/analytics/${encodeURIComponent(id)}/splits`));
  }

  /** GET /api/v1/analytics/{id}/hr-zones — distribución de tiempo en zonas. */
  hrZones(id: string): Observable<HrZonesResponseDto> {
    return this.http.get<HrZonesResponseDto>(this.api.url(`/api/v1/analytics/${encodeURIComponent(id)}/hr-zones`));
  }

  /** GET /api/v1/analytics/{id}/training-load — TRIMP / HRSS de la sesión. */
  trainingLoad(id: string): Observable<TrainingLoadResponseDto> {
    return this.http.get<TrainingLoadResponseDto>(
      this.api.url(`/api/v1/analytics/${encodeURIComponent(id)}/training-load`),
    );
  }

  /** GET /api/v1/analytics/{id}/vo2max-vam — VO2Max, VAM y predicciones. */
  vo2MaxVam(id: string): Observable<Vo2MaxVamResponseDto> {
    return this.http.get<Vo2MaxVamResponseDto>(
      this.api.url(`/api/v1/analytics/${encodeURIComponent(id)}/vo2max-vam`),
    );
  }

  /** GET /api/v1/analytics/{id}/cardiac-drift — desacople aeróbico. */
  cardiacDrift(id: string): Observable<CardiacDriftResponseDto> {
    return this.http.get<CardiacDriftResponseDto>(
      this.api.url(`/api/v1/analytics/${encodeURIComponent(id)}/cardiac-drift`),
    );
  }
}
