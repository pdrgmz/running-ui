import { DatePipe, DecimalPipe } from '@angular/common';
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
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import {
  GenerateTrainingPlanResponseDto,
  PlanGenerationJobResponseDto,
  PlanGenerationStatus,
  TrainingPlanResponseDto,
  TrainingPlanSummaryDto,
  TrainingPreferencesDto,
  WorkoutDto,
  WorkoutType,
} from '../../../../core/models/api.models';
import { ToastService } from '../../../../core/services/toast.service';
import { TrainingService } from '../../../../core/services/training.service';
import { DurationPipe, KmPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

const LONG_RUN_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const CLEANUP_STATUSES: PlanGenerationStatus[] = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
];

/**
 * Entrenamientos (`/api/v1/training/*`): preferencias de planificación,
 * generación semanal con IA, planes (listado, detalle, borrado) y jobs de
 * generación asíncronos.
 */
@Component({
  selector: 'app-training-panel',
  imports: [DatePipe, DecimalPipe, FormsModule, DurationPipe, KmPipe, PacePipe],
  templateUrl: './training-panel.html',
  styleUrl: './training-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingPanel implements OnInit {
  private readonly training = inject(TrainingService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly longRunDays = LONG_RUN_DAYS;
  protected readonly cleanupStatuses = CLEANUP_STATUSES;

  /* Preferencias */
  protected readonly preferences = signal<TrainingPreferencesDto | null>(null);
  protected readonly preferencesLoading = signal(true);
  protected readonly savingPreferences = signal(false);
  protected prefEnabled = false;
  protected prefTimezone = defaultTimezone();
  protected prefDaysPerWeek: number | null = 5;
  protected prefLongRunDay = 'SATURDAY';
  protected prefNotes = '';

  /* Planes */
  protected readonly plans = signal<TrainingPlanSummaryDto[] | null>(null);
  protected readonly plansLoading = signal(false);
  protected readonly plansError = signal(false);
  protected readonly currentPlan = signal<TrainingPlanResponseDto | null>(null);
  protected readonly selectedPlan = signal<TrainingPlanResponseDto | null>(null);
  protected readonly planLoading = signal(false);
  protected plansFrom = '';
  protected plansTo = '';

  /* Navegación de semanas en el calendario */
  protected readonly calendarPlan = signal<TrainingPlanResponseDto | null>(null);
  protected readonly calendarPlanLoading = signal(false);
  protected readonly calendarWeekOffset = signal(0); // 0 = semana actual

  /* Generación */
  protected generateWeekStart = nextMondayIso();
  protected generateReplace = false;
  protected readonly generating = signal(false);
  protected readonly generationResponse = signal<GenerateTrainingPlanResponseDto | null>(null);
  protected readonly generationJob = signal<PlanGenerationJobResponseDto | null>(null);
  private generationSub: Subscription | null = null;

  /* Jobs */
  protected readonly jobs = signal<PlanGenerationJobResponseDto[] | null>(null);
  protected readonly jobsLoading = signal(false);
  protected readonly jobsError = signal(false);
  protected cleanupStatus: PlanGenerationStatus = 'FAILED';
  protected readonly cleaningJobs = signal(false);

  /* Confirmaciones de borrado */
  protected readonly confirmingPlanId = signal<string | null>(null);
  protected readonly deletingPlanId = signal<string | null>(null);
  protected readonly confirmingWeek = signal<string | null>(null);
  protected readonly deletingWeek = signal<string | null>(null);
  protected readonly confirmingJobId = signal<string | null>(null);
  protected readonly deletingJobId = signal<string | null>(null);

  /** Plan visible: el seleccionado en el listado o el plan actual. */
  protected readonly displayedPlan = computed(() => this.selectedPlan() ?? this.currentPlan());

  /* ------------------------------------------------------------------ */
  /* Semana actual                                                      */
  /* ------------------------------------------------------------------ */

  /** Offsets de día respecto al lunes de la semana (0 = lunes … 6 = domingo). */
  protected readonly weekOffsets = [0, 1, 2, 3, 4, 5, 6];

  /** Etiqueta del día de la semana en español. */
  protected dayLabel(offset: number): string {
    const labels = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
    return labels[offset];
  }

  /** Fecha ISO (yyyy-MM-dd) del día `offset` dentro de la semana del plan. */
  protected planDayDate(plan: TrainingPlanResponseDto, offset: number): string | null {
    const parts = plan.weekStart.split('-');
    if (parts.length !== 3) {
      return null;
    }
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    const d = new Date(year, month, day + offset);
    return isoDate(d);
  }

  /** Workout del plan para el día `offset` (según su fecha). */
  protected workoutOf(plan: TrainingPlanResponseDto, offset: number): WorkoutDto | null {
    const dateStr = this.planDayDate(plan, offset);
    if (!dateStr) {
      return null;
    }
    return plan.workouts.find((w) => w.date === dateStr) ?? null;
  }

  /** ¿El día `offset` ya pasó respecto a hoy? */
  protected isDayPassed(plan: TrainingPlanResponseDto, offset: number): boolean {
    const dateStr = this.planDayDate(plan, offset);
    if (!dateStr) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const workoutDate = new Date(dateStr + 'T00:00:00');
    return workoutDate < today;
  }

  /** ¿El entrenamiento del día `offset` se cumplió (estado completado o con RPE)? */
  protected isWorkoutDone(plan: TrainingPlanResponseDto, offset: number): boolean {
    const w = this.workoutOf(plan, offset);
    return Boolean(w && (w.status === 'COMPLETED' || (w.rpe ?? 0) > 0));
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  protected readonly generationStatusLabel = computed(() => {
    const status = this.generationJob()?.status ?? this.generationResponse()?.status;
    return status ? this.jobStatusLabel(status) : 'SIN GENERACIÓN';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopGenerationPolling());
  }

  ngOnInit(): void {
    this.loadPreferences();
    this.loadPlans();
    this.loadCurrentPlan();
    this.loadWeekPlan();
    this.loadJobs();
  }

  /* ------------------------------------------------------------------ */
  /* Preferencias                                                        */
  /* ------------------------------------------------------------------ */

  /** GET /api/v1/training/preferences */
  protected loadPreferences(): void {
    this.preferencesLoading.set(true);
    this.training.preferences().subscribe({
      next: (prefs) => {
        this.preferencesLoading.set(false);
        this.preferences.set(prefs);
        this.prefEnabled = prefs.enabled;
        this.prefTimezone = prefs.timezone || defaultTimezone();
        this.prefDaysPerWeek = prefs.daysPerWeek || 5;
        this.prefLongRunDay = prefs.preferredLongRunDay || 'SATURDAY';
        this.prefNotes = prefs.notes ?? '';
      },
      error: () => this.preferencesLoading.set(false),
    });
  }

  /** PUT /api/v1/training/preferences */
  protected savePreferences(): void {
    if (this.savingPreferences()) {
      return;
    }
    const days = this.prefDaysPerWeek;
    if (days === null || !Number.isInteger(days) || days < 1 || days > 7) {
      this.toast.error('SESIONES POR SEMANA INVÁLIDAS: ENTRE 1 Y 7');
      return;
    }
    this.savingPreferences.set(true);
    this.training
      .updatePreferences({
        enabled: this.prefEnabled,
        timezone: this.prefTimezone.trim() || defaultTimezone(),
        daysPerWeek: days,
        preferredLongRunDay: this.prefLongRunDay,
        notes: this.prefNotes,
      })
      .subscribe({
        next: (prefs) => {
          this.savingPreferences.set(false);
          this.preferences.set(prefs);
          this.toast.show('PREFERENCIAS DE ENTRENAMIENTO GUARDADAS');
        },
        error: () => this.savingPreferences.set(false),
      });
  }

  /* ------------------------------------------------------------------ */
  /* Planes                                                              */
  /* ------------------------------------------------------------------ */

  /** GET /api/v1/training/plans?from=&to= */
  protected loadPlans(): void {
    this.plansLoading.set(true);
    this.plansError.set(false);
    this.training.plans(this.plansFrom || undefined, this.plansTo || undefined).subscribe({
      next: (list) => {
        this.plansLoading.set(false);
        this.plans.set(list);
      },
      error: () => {
        this.plansLoading.set(false);
        this.plansError.set(true);
      },
    });
  }

  /** GET /api/v1/training/plans/current */
  protected loadCurrentPlan(): void {
    this.training.currentPlan().subscribe({
      next: (plan) => this.currentPlan.set(plan),
      error: () => this.currentPlan.set(null),
    });
  }

  /** Lunes de la semana actual en ISO. */
  protected currentWeekStart(): string | null {
    const plan = this.currentPlan();
    return plan ? plan.weekStart : null;
  }

  /** Lunes de la semana que se está viendo en el calendario. */
  protected calendarWeekStart(): string | null {
    const base = this.currentWeekStart();
    if (!base) {
      return null;
    }
    const parts = base.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    const d = new Date(year, month, day + this.calendarWeekOffset() * 7);
    return isoDate(d);
  }

  /** Rango de fechas legible de la semana vista en el calendario. */
  protected calendarWeekRange(): string {
    const start = this.calendarWeekStart();
    if (!start) {
      return '';
    }
    const parts = start.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    const fmt = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${dd}/${m}/${y}`;
    };
    return `${fmt(d)} – ${fmt(end)}`;
  }

  /** Navega a la semana anterior/siguiente en el calendario. */
  protected changeCalendarWeek(delta: number): void {
    this.calendarWeekOffset.set(this.calendarWeekOffset() + delta);
    this.loadWeekPlan();
  }

  /** Vuelve a la semana actual. */
  protected goToCurrentCalendarWeek(): void {
    this.calendarWeekOffset.set(0);
    this.loadWeekPlan();
  }

  /** Carga el plan de la semana que se está viendo en el calendario. */
  protected loadWeekPlan(): void {
    const weekStart = this.calendarWeekStart();
    if (!weekStart) {
      return;
    }
    // Primero buscar en los planes ya cargados
    const existing = this.plans()?.find((p) => p.weekStart === weekStart);
    if (existing) {
      this.training.plan(existing.planId).subscribe({
        next: (plan) => this.calendarPlan.set(plan),
        error: () => this.calendarPlan.set(null),
      });
      return;
    }
    this.calendarPlanLoading.set(true);
    this.training.planByWeek(weekStart).subscribe({
      next: (plan) => {
        this.calendarPlanLoading.set(false);
        this.calendarPlan.set(plan);
      },
      error: () => {
        this.calendarPlanLoading.set(false);
        this.calendarPlan.set(null);
      },
    });
  }

  /** GET /api/v1/training/plans/{id} — abre el detalle de un plan. */
  protected selectPlan(planId: string): void {
    if (this.planLoading()) {
      return;
    }
    this.planLoading.set(true);
    this.training.plan(planId).subscribe({
      next: (plan) => {
        this.planLoading.set(false);
        this.selectedPlan.set(plan);
      },
      error: () => this.planLoading.set(false),
    });
  }

  protected showCurrentPlan(): void {
    this.selectedPlan.set(null);
  }

  protected requestDeletePlan(planId: string): void {
    this.confirmingPlanId.set(planId);
  }

  protected cancelDeletePlan(): void {
    this.confirmingPlanId.set(null);
  }

  /** DELETE /api/v1/training/plans/{id} */
  protected deletePlan(planId: string): void {
    if (this.deletingPlanId()) {
      return;
    }
    this.deletingPlanId.set(planId);
    this.training.deletePlan(planId).subscribe({
      next: () => {
        this.deletingPlanId.set(null);
        this.confirmingPlanId.set(null);
        if (this.selectedPlan()?.planId === planId) {
          this.selectedPlan.set(null);
        }
        this.toast.show('PLAN ELIMINADO');
        this.loadPlans();
        this.loadCurrentPlan();
        this.loadJobs();
      },
      error: () => {
        this.deletingPlanId.set(null);
        this.confirmingPlanId.set(null);
      },
    });
  }

  protected requestDeleteWeek(weekStart: string): void {
    this.confirmingWeek.set(weekStart);
  }

  protected cancelDeleteWeek(): void {
    this.confirmingWeek.set(null);
  }

  /** DELETE /api/v1/training/plans/week/{weekStart} */
  protected deleteWeek(weekStart: string): void {
    if (this.deletingWeek()) {
      return;
    }
    this.deletingWeek.set(weekStart);
    this.training.deletePlansByWeek(weekStart).subscribe({
      next: (res) => {
        this.deletingWeek.set(null);
        this.confirmingWeek.set(null);
        this.toast.show(`${res.deleted} VERSIÓN(ES) DE PLAN ELIMINADAS`);
        if (this.selectedPlan()?.weekStart === weekStart) {
          this.selectedPlan.set(null);
        }
        this.loadPlans();
        this.loadCurrentPlan();
        this.loadJobs();
      },
      error: () => {
        this.deletingWeek.set(null);
        this.confirmingWeek.set(null);
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Generación                                                          */
  /* ------------------------------------------------------------------ */

  /** POST /api/v1/training/plans/generate (202) + polling del job. */
  protected generatePlan(): void {
    if (this.generating()) {
      return;
    }
    this.generating.set(true);
    this.generationJob.set(null);
    this.generationResponse.set(null);
    this.training
      .generate({
        weekStart: this.generateWeekStart || undefined,
        replace: this.generateReplace,
      })
      .subscribe({
        next: (res) => {
          this.generationResponse.set(res);
          this.toast.show(res.message || 'GENERACIÓN DE PLAN ENCOLADA');
          this.pollGeneration(res.requestId);
        },
        error: () => this.generating.set(false),
      });
  }

  private pollGeneration(requestId: string): void {
    this.stopGenerationPolling();
    this.generationSub = timer(0, 2000)
      .pipe(
        switchMap(() => this.training.job(requestId)),
        takeWhile((job) => !isJobTerminal(job.status), true),
      )
      .subscribe({
        next: (job) => this.applyGenerationJob(job),
        error: () => {
          this.stopGenerationPolling();
          this.generating.set(false);
          this.loadJobs();
        },
      });
  }

  private applyGenerationJob(job: PlanGenerationJobResponseDto): void {
    this.generationJob.set(job);
    if (!isJobTerminal(job.status)) {
      this.generating.set(true);
      return;
    }
    this.generating.set(false);
    this.stopGenerationPolling();
    this.loadJobs();
    if (job.status === 'COMPLETED') {
      this.toast.show('PLAN SEMANAL GENERADO Y GUARDADO');
      this.loadPlans();
      this.loadCurrentPlan();
      if (job.planId) {
        this.selectPlan(job.planId);
      }
      return;
    }
    this.toast.error(job.error || `LA GENERACIÓN DEL PLAN ${this.jobStatusLabel(job.status)}`);
  }

  private stopGenerationPolling(): void {
    this.generationSub?.unsubscribe();
    this.generationSub = null;
  }

  /* ------------------------------------------------------------------ */
  /* Jobs                                                                */
  /* ------------------------------------------------------------------ */

  /** GET /api/v1/training/generation-jobs */
  protected loadJobs(): void {
    this.jobsLoading.set(true);
    this.jobsError.set(false);
    this.training.jobs().subscribe({
      next: (list) => {
        this.jobsLoading.set(false);
        this.jobs.set(list);
      },
      error: () => {
        this.jobsLoading.set(false);
        this.jobsError.set(true);
      },
    });
  }

  protected requestDeleteJob(requestId: string): void {
    this.confirmingJobId.set(requestId);
  }

  protected cancelDeleteJob(): void {
    this.confirmingJobId.set(null);
  }

  /** DELETE /api/v1/training/generation-jobs/{requestId} */
  protected deleteJob(job: PlanGenerationJobResponseDto): void {
    if (this.deletingJobId()) {
      return;
    }
    this.deletingJobId.set(job.requestId);
    this.training.deleteJob(job.requestId, job.status === 'RUNNING').subscribe({
      next: () => {
        this.deletingJobId.set(null);
        this.confirmingJobId.set(null);
        this.toast.show('JOB DE GENERACIÓN ELIMINADO');
        this.loadJobs();
      },
      error: () => {
        this.deletingJobId.set(null);
        this.confirmingJobId.set(null);
      },
    });
  }

  /** DELETE /api/v1/training/generation-jobs?status=... */
  protected cleanupJobs(): void {
    if (this.cleaningJobs()) {
      return;
    }
    this.cleaningJobs.set(true);
    this.training.deleteJobs(this.cleanupStatus, this.cleanupStatus === 'RUNNING').subscribe({
      next: (res) => {
        this.cleaningJobs.set(false);
        this.toast.show(`${res.deleted} JOB(S) ${this.cleanupStatus} ELIMINADOS`);
        this.loadJobs();
      },
      error: () => this.cleaningJobs.set(false),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Etiquetas                                                           */
  /* ------------------------------------------------------------------ */

  protected planStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      ACTIVE: 'ACTIVO',
      ARCHIVED: 'ARCHIVADO',
      COMPLETED: 'COMPLETADO',
    };
    return labels[status] ?? status;
  }

  protected jobStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'EN COLA',
      RUNNING: 'GENERANDO',
      COMPLETED: 'COMPLETADO',
      FAILED: 'FALLIDO',
      TIMEOUT: 'TIEMPO AGOTADO',
    };
    return labels[status] ?? status;
  }

  protected workoutTypeLabel(type: WorkoutType | string): string {
    const labels: Record<string, string> = {
      EASY: 'SUAVE',
      RECOVERY: 'RECUPERACIÓN',
      LONG_RUN: 'TIRADA LARGA',
      TEMPO: 'TEMPO',
      INTERVALS: 'SERIES',
      HILLS: 'CUESTAS',
      RACE_PACE: 'RITMO DE CARRERA',
      RACE: 'CARRERA',
      CROSS_TRAINING: 'ENTRENAMIENTO CRUZADO',
      REST: 'DESCANSO',
      OTHER: 'OTRO',
    };
    return labels[type] ?? type;
  }

  protected workoutTypeShortLabel(type: WorkoutType | string): string {
    const labels: Record<string, string> = {
      EASY: 'SUAVE',
      RECOVERY: 'RECUPERACIÓN',
      LONG_RUN: 'TIRADA LARGA',
      TEMPO: 'TEMPO',
      INTERVALS: 'SERIES',
      HILLS: 'CUESTAS',
      RACE_PACE: 'RITMO',
      RACE: 'CARRERA',
      CROSS_TRAINING: 'CRUZADO',
      REST: 'DESCANSO',
      OTHER: 'OTRO',
    };
    return labels[type] ?? type;
  }
}

function isJobTerminal(status: string | undefined): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'TIMEOUT';
}

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
  } catch {
    return 'Europe/Madrid';
  }
}

/** Próximo lunes en formato yyyy-MM-dd (el que usa la API por defecto). */
function nextMondayIso(): string {
  const date = new Date();
  const day = date.getDay();
  const delta = ((8 - day) % 7) || 7;
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
