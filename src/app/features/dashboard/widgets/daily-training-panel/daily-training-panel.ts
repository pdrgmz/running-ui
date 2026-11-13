import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, takeWhile, timer, switchMap } from 'rxjs';
import {
  DailyGenerationJobResponseDto,
  DailyRecommendationResponseDto,
  DailyRecommendationSummaryDto,
  TrainingJobStatus,
  TrainingPreferencesDto,
  WorkoutType,
} from '../../../../core/models/api.models';
import { ToastService } from '../../../../core/services/toast.service';
import { TrainingService } from '../../../../core/services/training.service';
import { DurationPipe, KmPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

const JOB_POLL_MS = 1800;

const WORKOUT_LABELS: Record<WorkoutType, string> = {
  EASY: 'RODAJE SUAVE',
  RECOVERY: 'RECUPERACIÓN',
  LONG_RUN: 'TIRADA LARGA',
  TEMPO: 'TEMPO',
  INTERVALS: 'SERIES',
  HILLS: 'CUESTAS',
  RACE_PACE: 'RITMO DE CARRERA',
  RACE: 'CARRERA',
  CROSS_TRAINING: 'FUERZA / CRUZADO',
  REST: 'DESCANSO',
  OTHER: 'OTRO',
};

const JOB_STATUS_LABELS: Record<TrainingJobStatus, string> = {
  PENDING: 'EN COLA',
  RUNNING: 'GENERANDO',
  COMPLETED: 'COMPLETADA',
  FAILED: 'FALLIDA',
  TIMEOUT: 'CADUCADA',
};

/**
 * Entrenamiento (`/api/v1/training/*`): recomendación diaria generada por IA,
 * histórico de recomendaciones, generación manual y preferencias del atleta.
 *
 * La generación es asíncrona: la API responde 202 con un `requestId` y la
 * recomendación solo aparece cuando n8n la guarda vía MCP. El panel sigue el
 * estado del job hasta que termina.
 */
@Component({
  selector: 'app-daily-training-panel',
  imports: [DatePipe, DecimalPipe, FormsModule, DurationPipe, KmPipe, PacePipe],
  templateUrl: './daily-training-panel.html',
  styleUrl: './daily-training-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyTrainingPanel implements OnInit {
  private readonly training = inject(TrainingService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /* Día seleccionado y recomendación */
  protected readonly selectedDate = signal(todayIso());
  protected readonly recommendation = signal<DailyRecommendationResponseDto | null>(null);
  protected readonly loadingRecommendation = signal(true);
  protected readonly recommendationError = signal(false);

  /* Histórico */
  protected readonly history = signal<DailyRecommendationSummaryDto[]>([]);
  protected readonly historyLoading = signal(true);
  protected readonly historyError = signal(false);

  /* Jobs de generación */
  protected readonly jobs = signal<DailyGenerationJobResponseDto[]>([]);
  protected readonly jobsLoading = signal(true);
  protected readonly job = signal<DailyGenerationJobResponseDto | null>(null);
  protected readonly generating = signal(false);
  protected readonly clearingPending = signal(false);

  /* Borrado */
  protected readonly deleting = signal(false);
  protected readonly confirmingDelete = signal(false);

  /* Preferencias */
  protected readonly preferences = signal<TrainingPreferencesDto | null>(null);
  protected readonly preferencesLoading = signal(true);
  protected readonly savingPreferences = signal(false);
  protected prefEnabled = false;
  protected prefTimezone = 'Europe/Madrid';
  protected prefGenerationHour: number | null = 6;
  protected prefNotes = '';

  private pollSub: Subscription | null = null;
  private dateTouched = false;

  protected readonly athleteToday = computed(() =>
    todayIso(this.preferences()?.timezone ?? null),
  );

  protected readonly isToday = computed(() => this.selectedDate() === this.athleteToday());

  protected readonly hasRecommendation = computed(() => this.recommendation() !== null);

  protected readonly generateLabel = computed(() =>
    this.hasRecommendation() ? 'REGENERAR' : 'GENERAR',
  );

  protected readonly jobActive = computed(() => {
    const current = this.job();
    return current !== null && (current.status === 'PENDING' || current.status === 'RUNNING');
  });

  protected readonly busy = computed(() => this.generating() || this.jobActive());

  protected readonly recentJobs = computed(() => this.jobs().slice(0, 5));

  protected readonly pendingJobsCount = computed(
    () => this.jobs().filter((item) => item.status === 'PENDING').length,
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  ngOnInit(): void {
    this.loadHistory();
    this.loadJobs();
    this.loadPreferences();
  }

  /* ------------------------------------------------------------------ */
  /* Carga                                                              */
  /* ------------------------------------------------------------------ */

  protected loadPreferences(): void {
    this.preferencesLoading.set(true);
    this.training.preferences().subscribe({
      next: (prefs) => {
        this.applyPreferences(prefs);
        this.preferencesLoading.set(false);
        if (!this.dateTouched) {
          this.selectedDate.set(this.athleteToday());
        }
        this.loadRecommendation(this.selectedDate());
      },
      error: () => {
        this.preferencesLoading.set(false);
        this.loadRecommendation(this.selectedDate());
      },
    });
  }

  protected loadRecommendation(date = this.selectedDate()): void {
    this.loadingRecommendation.set(true);
    this.recommendationError.set(false);
    const request =
      date === this.athleteToday()
        ? this.training.today()
        : this.training.recommendationByDate(date);

    request.subscribe({
      next: (recommendation) => {
        if (date !== this.selectedDate()) {
          return;
        }
        this.recommendation.set(recommendation);
        this.loadingRecommendation.set(false);
      },
      error: (error: unknown) => {
        if (date !== this.selectedDate()) {
          return;
        }
        this.recommendation.set(null);
        this.loadingRecommendation.set(false);
        if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
          this.recommendationError.set(true);
        }
      },
    });
  }

  protected loadHistory(): void {
    this.historyLoading.set(true);
    this.historyError.set(false);
    this.training.recommendations().subscribe({
      next: (items) => {
        this.history.set(items);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.historyError.set(true);
      },
    });
  }

  protected loadJobs(): void {
    this.jobsLoading.set(true);
    this.training.jobs().subscribe({
      next: (items) => {
        this.jobs.set(items);
        this.jobsLoading.set(false);
      },
      error: () => this.jobsLoading.set(false),
    });
  }

  protected refreshAll(): void {
    this.loadHistory();
    this.loadJobs();
    this.loadPreferences();
  }

  /* ------------------------------------------------------------------ */
  /* Generación                                                         */
  /* ------------------------------------------------------------------ */

  protected onDateChange(date: string): void {
    const effective = date || this.athleteToday();
    this.dateTouched = true;
    this.confirmingDelete.set(false);
    this.selectedDate.set(effective);
    this.job.set(null);
    this.loadRecommendation(effective);
  }

  protected generate(): void {
    if (this.busy()) {
      return;
    }
    const date = this.selectedDate();
    this.generating.set(true);
    this.confirmingDelete.set(false);
    this.job.set(null);

    this.training.generate({ date, replace: this.hasRecommendation() }).subscribe({
      next: (response) => {
        this.toast.show(`GENERACIÓN ENCOLADA: ${response.date}`);
        this.pollJob(response.requestId);
      },
      error: (error: unknown) => {
        this.generating.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  private pollJob(requestId: string): void {
    this.stopPolling();
    this.pollSub = timer(0, JOB_POLL_MS)
      .pipe(
        switchMap(() => this.training.job(requestId)),
        takeWhile((item) => !isTerminal(item.status), true),
      )
      .subscribe({
        next: (item) => {
          this.job.set(item);
          if (isTerminal(item.status)) {
            this.finishJob(item);
          }
        },
        error: (error: unknown) => {
          this.generating.set(false);
          this.toast.error(errorMessage(error));
        },
      });
  }

  private finishJob(item: DailyGenerationJobResponseDto): void {
    this.stopPolling();
    this.generating.set(false);
    this.loadJobs();

    if (item.status === 'COMPLETED') {
      this.toast.show(`RECOMENDACIÓN LISTA: ${item.date}`);
      if (item.date === this.selectedDate()) {
        this.loadRecommendation(item.date);
      }
      this.loadHistory();
      return;
    }

    this.toast.error(item.error ?? `LA GENERACIÓN TERMINÓ COMO ${item.status}`);
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  /* ------------------------------------------------------------------ */
  /* Borrado                                                            */
  /* ------------------------------------------------------------------ */

  protected requestDelete(): void {
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  protected deleteRecommendation(): void {
    const recommendation = this.recommendation();
    if (!recommendation || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.training.deleteRecommendation(recommendation.recommendationId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmingDelete.set(false);
        this.recommendation.set(null);
        this.toast.show(`RECOMENDACIÓN ELIMINADA: ${recommendation.date}`);
        this.loadHistory();
        this.loadJobs();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  protected clearPendingJobs(): void {
    if (this.clearingPending()) {
      return;
    }
    this.clearingPending.set(true);
    this.training.deleteJobs('PENDING').subscribe({
      next: (response) => {
        this.clearingPending.set(false);
        this.toast.show(`${response.deleted} JOBS PENDIENTES ELIMINADOS`);
        this.loadJobs();
      },
      error: (error: unknown) => {
        this.clearingPending.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Histórico y preferencias                                           */
  /* ------------------------------------------------------------------ */

  protected selectHistory(item: DailyRecommendationSummaryDto): void {
    this.dateTouched = true;
    this.confirmingDelete.set(false);
    this.selectedDate.set(item.date);
    this.job.set(null);
    this.loadRecommendation(item.date);
  }

  protected savePreferences(): void {
    if (this.savingPreferences()) {
      return;
    }
    const hour = Number(this.prefGenerationHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      this.toast.error('LA HORA DE GENERACIÓN DEBE ESTAR ENTRE 0 Y 23');
      return;
    }
    if (!this.prefTimezone.trim()) {
      this.toast.error('INDICA UNA ZONA HORARIA IANA (EJ. EUROPE/MADRID)');
      return;
    }

    this.savingPreferences.set(true);
    this.training
      .updatePreferences({
        enabled: this.prefEnabled,
        timezone: this.prefTimezone.trim(),
        generationHour: hour,
        notes: this.prefNotes,
      })
      .subscribe({
        next: (prefs) => {
          this.applyPreferences(prefs);
          this.savingPreferences.set(false);
          this.toast.show('PREFERENCIAS GUARDADAS');
          if (!this.dateTouched) {
            this.selectedDate.set(this.athleteToday());
          }
          this.loadRecommendation(this.selectedDate());
        },
        error: (error: unknown) => {
          this.savingPreferences.set(false);
          this.toast.error(errorMessage(error));
        },
      });
  }

  private applyPreferences(prefs: TrainingPreferencesDto): void {
    this.preferences.set(prefs);
    this.prefEnabled = prefs.enabled ?? false;
    this.prefTimezone = prefs.timezone || 'Europe/Madrid';
    this.prefGenerationHour = prefs.generationHour ?? 6;
    this.prefNotes = prefs.notes ?? '';
  }

  /* ------------------------------------------------------------------ */
  /* Etiquetas                                                          */
  /* ------------------------------------------------------------------ */

  protected workoutLabel(type: WorkoutType): string {
    return WORKOUT_LABELS[type] ?? type;
  }

  protected jobStatusLabel(status: TrainingJobStatus): string {
    return JOB_STATUS_LABELS[status] ?? status;
  }
}

function isTerminal(status: TrainingJobStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'TIMEOUT';
}

/** Fecha de hoy (yyyy-MM-dd) en la zona horaria indicada, o la local si falla. */
function todayIso(timezone?: string | null): string {
  const now = new Date();
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
      const year = value('year');
      const month = value('month');
      const day = value('day');
      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    } catch {
      /* zona inválida: se usa la fecha local */
    }
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string; error?: string } | string | null;
    if (typeof body === 'string' && body.trim()) {
      return body.toUpperCase();
    }
    if (body && typeof body === 'object') {
      const detail = body.message ?? body.error;
      if (detail) {
        return detail.toUpperCase();
      }
    }
    if (error.status === 503) {
      return 'EL WEBHOOK DE N8N NO ESTÁ CONFIGURADO';
    }
    if (error.status === 409) {
      return 'YA HAY UNA RECOMENDACIÓN O UNA GENERACIÓN EN CURSO PARA ESE DÍA';
    }
    return `ERROR HTTP ${error.status}`;
  }
  if (error instanceof Error && error.message) {
    return error.message.toUpperCase();
  }
  return 'ERROR DESCONOCIDO';
}
