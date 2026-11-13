import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DailyGenerationJobResponseDto,
  DailyRecommendationResponseDto,
  DailyRecommendationSummaryDto,
  DeletedJobsResponseDto,
  DeletedRecommendationsResponseDto,
  GenerateDailyRecommendationRequestDto,
  GenerateDailyRecommendationResponseDto,
  TrainingJobStatus,
  TrainingPreferencesDto,
  UpdateTrainingPreferencesRequestDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';

/**
 * Entrenamientos (`/api/v1/training/*`): recomendación diaria generada por IA,
 * histórico, preferencias y jobs de generación asíncronos.
 *
 * La generación responde 202 con un `requestId`; la recomendación solo existe
 * cuando n8n llama a `save_daily_recommendation` y la API la persiste. El
 * estado se sigue con `GET /generation-jobs/{requestId}`.
 */
@Injectable({ providedIn: 'root' })
export class TrainingService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  /** GET /api/v1/training/preferences — preferencias de generación diaria. */
  preferences(): Observable<TrainingPreferencesDto> {
    return this.http.get<TrainingPreferencesDto>(this.api.url('/api/v1/training/preferences'));
  }

  /** PUT /api/v1/training/preferences — activa/desactiva y configura la generación. */
  updatePreferences(
    request: UpdateTrainingPreferencesRequestDto,
  ): Observable<TrainingPreferencesDto> {
    return this.http.put<TrainingPreferencesDto>(
      this.api.url('/api/v1/training/preferences'),
      request,
    );
  }

  /**
   * GET /api/v1/training/recommendations/today — recomendación de hoy en la
   * zona horaria del atleta. Responde 204 (body `null`) si aún no existe.
   */
  today(): Observable<DailyRecommendationResponseDto | null> {
    return this.http.get<DailyRecommendationResponseDto | null>(
      this.api.url('/api/v1/training/recommendations/today'),
    );
  }

  /** GET /api/v1/training/recommendations — histórico, filtrable por rango. */
  recommendations(
    from?: string,
    to?: string,
  ): Observable<DailyRecommendationSummaryDto[]> {
    let params = new HttpParams();
    if (from) {
      params = params.set('from', from);
    }
    if (to) {
      params = params.set('to', to);
    }
    return this.http.get<DailyRecommendationSummaryDto[]>(
      this.api.url('/api/v1/training/recommendations'),
      { params },
    );
  }

  /** GET /api/v1/training/recommendations/{id} — recomendación completa. */
  recommendation(id: string): Observable<DailyRecommendationResponseDto> {
    return this.http.get<DailyRecommendationResponseDto>(
      this.api.url(`/api/v1/training/recommendations/${encodeURIComponent(id)}`),
    );
  }

  /** GET /api/v1/training/recommendations/date/{date} — recomendación de un día. */
  recommendationByDate(date: string): Observable<DailyRecommendationResponseDto> {
    return this.http.get<DailyRecommendationResponseDto>(
      this.api.url(`/api/v1/training/recommendations/date/${encodeURIComponent(date)}`),
    );
  }

  /** DELETE /api/v1/training/recommendations/{id} — recomendación y jobs asociados. */
  deleteRecommendation(id: string): Observable<void> {
    return this.http.delete<void>(
      this.api.url(`/api/v1/training/recommendations/${encodeURIComponent(id)}`),
    );
  }

  /** DELETE /api/v1/training/recommendations/date/{date} — recomendación de un día. */
  deleteRecommendationByDate(date: string): Observable<void> {
    return this.http.delete<void>(
      this.api.url(`/api/v1/training/recommendations/date/${encodeURIComponent(date)}`),
    );
  }

  /** POST /api/v1/training/recommendations/generate — encola la generación (202). */
  generate(
    request: GenerateDailyRecommendationRequestDto,
  ): Observable<GenerateDailyRecommendationResponseDto> {
    return this.http.post<GenerateDailyRecommendationResponseDto>(
      this.api.url('/api/v1/training/recommendations/generate'),
      request,
    );
  }

  /** GET /api/v1/training/generation-jobs — últimos jobs de generación. */
  jobs(): Observable<DailyGenerationJobResponseDto[]> {
    return this.http.get<DailyGenerationJobResponseDto[]>(
      this.api.url('/api/v1/training/generation-jobs'),
    );
  }

  /** GET /api/v1/training/generation-jobs/{requestId} — estado de un job. */
  job(requestId: string): Observable<DailyGenerationJobResponseDto> {
    return this.http.get<DailyGenerationJobResponseDto>(
      this.api.url(`/api/v1/training/generation-jobs/${encodeURIComponent(requestId)}`),
    );
  }

  /** DELETE /api/v1/training/generation-jobs/{requestId} — elimina el registro del job. */
  deleteJob(requestId: string, force = false): Observable<void> {
    const params = force ? new HttpParams().set('force', true) : undefined;
    return this.http.delete<void>(
      this.api.url(`/api/v1/training/generation-jobs/${encodeURIComponent(requestId)}`),
      { params },
    );
  }

  /** DELETE /api/v1/training/generation-jobs?status=... — limpia jobs por estado. */
  deleteJobs(status: TrainingJobStatus, force = false): Observable<DeletedJobsResponseDto> {
    let params = new HttpParams().set('status', status);
    if (force) {
      params = params.set('force', true);
    }
    return this.http.delete<DeletedJobsResponseDto>(
      this.api.url('/api/v1/training/generation-jobs'),
      { params },
    );
  }
}
