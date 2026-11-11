import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DeletedJobsResponseDto,
  DeletedPlansResponseDto,
  GenerateTrainingPlanRequestDto,
  GenerateTrainingPlanResponseDto,
  PlanGenerationJobResponseDto,
  PlanGenerationStatus,
  TrainingPlanResponseDto,
  TrainingPlanSummaryDto,
  TrainingPreferencesDto,
  UpdateTrainingPreferencesRequestDto,
  WorkoutDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';

/**
 * Entrenamientos (`/api/v1/training/*`): preferencias de planificación,
 * planes semanales generados por IA y jobs de generación asíncronos.
 *
 * La generación responde 202 con un `requestId`; el plan solo existe cuando
 * n8n llama a `save_weekly_plan` y la API lo persiste. El estado se sigue con
 * `GET /generation-jobs/{requestId}`.
 */
@Injectable({ providedIn: 'root' })
export class TrainingService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  /** GET /api/v1/training/preferences — preferencias de planificación. */
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

  /** GET /api/v1/training/plans — planes del usuario, filtrables por rango de semanas. */
  plans(from?: string, to?: string): Observable<TrainingPlanSummaryDto[]> {
    let params = new HttpParams();
    if (from) {
      params = params.set('from', from);
    }
    if (to) {
      params = params.set('to', to);
    }
    return this.http.get<TrainingPlanSummaryDto[]>(this.api.url('/api/v1/training/plans'), {
      params,
    });
  }

  /** GET /api/v1/training/plans/{id} — plan con todas sus sesiones. */
  plan(id: string): Observable<TrainingPlanResponseDto> {
    return this.http.get<TrainingPlanResponseDto>(
      this.api.url(`/api/v1/training/plans/${encodeURIComponent(id)}`),
    );
  }

  /** GET /api/v1/training/plans/week/{weekStart} — plan de una semana (lunes). */
  planByWeek(weekStart: string): Observable<TrainingPlanResponseDto> {
    return this.http.get<TrainingPlanResponseDto>(
      this.api.url(`/api/v1/training/plans/week/${encodeURIComponent(weekStart)}`),
    );
  }

  /**
   * GET /api/v1/training/plans/current — plan activo de la semana actual o,
   * si no existe, el último activo. Responde 204 cuando aún no hay planes.
   */
  currentPlan(): Observable<TrainingPlanResponseDto | null> {
    return this.http.get<TrainingPlanResponseDto | null>(
      this.api.url('/api/v1/training/plans/current'),
    );
  }

  /** DELETE /api/v1/training/plans/{id} — elimina un plan y sus sesiones. */
  deletePlan(id: string): Observable<void> {
    return this.http.delete<void>(
      this.api.url(`/api/v1/training/plans/${encodeURIComponent(id)}`),
    );
  }

  /** DELETE /api/v1/training/plans/week/{weekStart} — todas las versiones de la semana. */
  deletePlansByWeek(weekStart: string): Observable<DeletedPlansResponseDto> {
    return this.http.delete<DeletedPlansResponseDto>(
      this.api.url(`/api/v1/training/plans/week/${encodeURIComponent(weekStart)}`),
    );
  }

  /** POST /api/v1/training/plans/generate — encola la generación (202 Accepted). */
  generate(request: GenerateTrainingPlanRequestDto): Observable<GenerateTrainingPlanResponseDto> {
    return this.http.post<GenerateTrainingPlanResponseDto>(
      this.api.url('/api/v1/training/plans/generate'),
      request,
    );
  }

  /** PUT /api/v1/training/plans/{planId}/workouts/{workoutId} — vincula/desvincula una actividad realizada a una sesión planificada. */
  updateWorkout(
    planId: string,
    workoutId: number,
    request: { completedActivityId?: string | null },
  ): Observable<WorkoutDto> {
    return this.http.put<WorkoutDto>(
      this.api.url(`/api/v1/training/plans/${encodeURIComponent(planId)}/workouts/${workoutId}`),
      request,
    );
  }

  /** GET /api/v1/training/generation-jobs — últimos jobs de generación. */
  jobs(): Observable<PlanGenerationJobResponseDto[]> {
    return this.http.get<PlanGenerationJobResponseDto[]>(
      this.api.url('/api/v1/training/generation-jobs'),
    );
  }

  /** GET /api/v1/training/generation-jobs/{requestId} — estado de un job. */
  job(requestId: string): Observable<PlanGenerationJobResponseDto> {
    return this.http.get<PlanGenerationJobResponseDto>(
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
  deleteJobs(status: PlanGenerationStatus, force = false): Observable<DeletedJobsResponseDto> {
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
