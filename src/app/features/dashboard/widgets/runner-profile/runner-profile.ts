import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import {
  ACWR_ZONE_LABELS,
  AcwrStatusDto,
  Activity,
  EddingtonStatsDto,
  ElevationCoverageDto,
  PmcPointDto,
  RecordResponseDto,
  RunnerZonesResponseDto,
  SummaryStatsDto,
  TrainingPreferencesDto,
  Vo2MaxVamResponseDto,
} from '../../../../core/models/api.models';
import {
  MilestoneProgress,
  formatMilestoneValue,
  milestoneRemainingLabel,
} from '../../../../core/models/milestone.models';
import { ActivitiesService } from '../../../../core/services/activities.service';
import { AuthService } from '../../../../core/services/auth.service';
import { MilestonesService } from '../../../../core/services/milestones.service';
import { StatsService } from '../../../../core/services/stats.service';
import { TrainingService } from '../../../../core/services/training.service';
import { ZonesService } from '../../../../core/services/zones.service';
import { DurationPipe, KmhPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

type Tone = 'ok' | 'warn' | 'risk' | 'neutral' | 'low';

interface SourceSlice {
  source: string;
  count: number;
  percent: number;
}

interface BackupCoverage {
  covered: number;
  total: number;
  percent: number;
}

interface MilestoneSummary {
  unlocked: number;
  total: number;
  percent: number;
  next: MilestoneProgress | null;
}

interface MissingGroup {
  id: string;
  title: string;
  items: string[];
}

const INTEGER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const DECIMAL_FORMATTERS = new Map<number, Intl.NumberFormat>();

function decimalFormatter(digits: number): Intl.NumberFormat {
  const cached = DECIMAL_FORMATTERS.get(digits);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  DECIMAL_FORMATTERS.set(digits, formatter);
  return formatter;
}

/** Etiquetas legibles para el origen del perfil de zonas. */
const ZONES_SOURCE_LABELS: Record<string, string> = {
  DEFAULT: 'POR DEFECTO',
  CALCULATED: 'CALCULADAS',
  MANUAL: 'MANUALES',
};

const HR_METHOD_LABELS: Record<string, string> = {
  MAX_HR_PERCENT: '% FC MÁXIMA',
  HEART_RATE_RESERVE: 'RESERVA DE FC',
  CUSTOM: 'PERSONALIZADO',
};

const PACE_METHOD_LABELS: Record<string, string> = {
  THRESHOLD_PACE_PERCENT: '% RITMO UMBRAL',
  CUSTOM: 'PERSONALIZADO',
};

/** Campos que enriquecerían el perfil y que todavía no expone la API v1.8.0. */
const MISSING_PROFILE_GROUPS: MissingGroup[] = [
  {
    id: 'identidad',
    title: 'Identidad',
    items: ['Nombre y apellidos', 'Fecha de nacimiento / edad', 'Sexo', 'Ciudad y país', 'Foto de perfil'],
  },
  {
    id: 'antropometria',
    title: 'Antropometría',
    items: ['Peso', 'Altura', 'IMC'],
  },
  {
    id: 'fisiologia',
    title: 'Fisiología',
    items: ['VO2Max de laboratorio', 'Umbrales LT1 / LT2'],
  },
  {
    id: 'objetivos',
    title: 'Objetivos',
    items: ['Carrera objetivo', 'Marca objetivo', 'Fecha de competición', 'Plan de entrenamiento activo'],
  },
  {
    id: 'salud',
    title: 'Salud y bienestar',
    items: ['Lesiones e historial', 'RPE / esfuerzo percibido', 'Sueño y fatiga', 'Disponibilidad semanal'],
  },
  {
    id: 'material',
    title: 'Material y preferencias',
    items: ['Zapatillas y km por par', 'Superficie habitual', 'Unidades (km / millas)'],
  },
];

/**
 * Pestaña «Corredor»: ficha completa del atleta construida con los datos que
 * la API ya expone para la cuenta autenticada.
 *
 * Mezcla la identidad de `/auth/me`, las preferencias de entrenamiento, el
 * resumen histórico, los récords, el PMC/ACWR, el número de Eddington, los
 * logros calculados sobre el historial y las métricas derivadas de las últimas
 * sesiones. Los campos de perfil deportivo que aún no existen en el backend se
 * listan en la última tarjeta para poder integrarlos cuando estén disponibles.
 */
@Component({
  selector: 'app-runner-profile',
  imports: [DatePipe, DecimalPipe, DurationPipe, KmhPipe, PacePipe],
  templateUrl: './runner-profile.html',
  styleUrl: './runner-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunnerProfile implements OnInit {
  readonly records = input<RecordResponseDto[]>([]);
  readonly pmc = input<PmcPointDto[]>([]);
  readonly acwr = input<AcwrStatusDto | null>(null);
  readonly eddington = input<EddingtonStatsDto | null>(null);
  readonly recentActivities = input<Activity[]>([]);

  readonly openActivity = output<string>();

  protected readonly auth = inject(AuthService);
  protected readonly milestones = inject(MilestonesService);
  private readonly stats = inject(StatsService);
  private readonly activities = inject(ActivitiesService);
  private readonly training = inject(TrainingService);
  private readonly zonesApi = inject(ZonesService);

  protected readonly careerSummary = signal<SummaryStatsDto | null>(null);
  protected readonly preferences = signal<TrainingPreferencesDto | null>(null);
  protected readonly oldestActivity = signal<Activity | null>(null);
  protected readonly elevationCoverage = signal<ElevationCoverageDto | null>(null);
  protected readonly zones = signal<RunnerZonesResponseDto | null>(null);
  protected readonly racePredictions = signal<Vo2MaxVamResponseDto | null>(null);
  protected readonly profileLoading = signal(true);

  protected readonly missingProfileGroups = MISSING_PROFILE_GROUPS;

  /* ------------------------------------------------------------------ */
  /* Identidad y trayectoria                                            */
  /* ------------------------------------------------------------------ */

  protected readonly initials = computed(() => {
    const email = this.auth.user()?.email ?? '';
    return email ? email.slice(0, 2).toUpperCase() : 'RT';
  });

  protected readonly latestSession = computed(() => this.recentActivities()[0] ?? null);

  protected readonly preferencesStatus = computed(() => {
    const prefs = this.preferences();
    if (!prefs || !prefs.configured) {
      return { label: 'SIN CONFIGURAR', tone: 'low' as Tone };
    }
    return prefs.enabled
      ? { label: 'IA ACTIVA', tone: 'ok' as Tone }
      : { label: 'IA PAUSADA', tone: 'neutral' as Tone };
  });

  protected readonly generationHourLabel = computed(() => {
    const hour = this.preferences()?.generationHour;
    return hour === null || hour === undefined ? '—' : `${String(hour).padStart(2, '0')}:00`;
  });

  protected readonly daysSinceLastRun = computed(() => {
    const latest = this.latestSession();
    if (!latest) {
      return null;
    }
    const time = new Date(latest.startTime).getTime();
    if (!Number.isFinite(time)) {
      return null;
    }
    return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  });

  protected readonly lastRunLabel = computed(() => {
    const days = this.daysSinceLastRun();
    if (days === null) {
      return '—';
    }
    if (days === 0) {
      return 'HOY';
    }
    if (days === 1) {
      return 'AYER';
    }
    return `HACE ${days} DÍAS`;
  });

  /** Antigüedad del historial entre la primera y la última carrera. */
  protected readonly historySpanDays = computed(() => {
    const first = this.oldestActivity();
    const latest = this.latestSession();
    if (!first) {
      return null;
    }
    const start = new Date(first.startTime).getTime();
    const end = latest ? new Date(latest.startTime).getTime() : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return null;
    }
    return Math.max(0, Math.round((end - start) / 86_400_000));
  });

  protected readonly historySpanLabel = computed(() => {
    const days = this.historySpanDays();
    return days === null ? '—' : historySpanLabel(days);
  });

  /** Ritmo medio global del historial (min/km). */
  protected readonly careerAvgPace = computed(() => {
    const summary = this.careerSummary();
    if (!summary || !summary.totalDistanceMeters || !summary.totalTimeSeconds) {
      return null;
    }
    return summary.totalTimeSeconds / 60 / (summary.totalDistanceMeters / 1000);
  });

  /** Equivalentes de maratón sobre la distancia acumulada. */
  protected readonly marathonEquivalents = computed(() => {
    const summary = this.careerSummary();
    return summary ? summary.totalDistanceMeters / 42195 : null;
  });

  /* ------------------------------------------------------------------ */
  /* Métricas fisiológicas de las últimas sesiones                      */
  /* ------------------------------------------------------------------ */

  protected readonly bestVo2 = computed(() =>
    maxOf(this.recentActivities().map((activity) => activity.vo2MaxEstimated)),
  );
  protected readonly bestVam = computed(() =>
    maxOf(this.recentActivities().map((activity) => activity.vamKmH)),
  );
  protected readonly avgCadence = computed(() =>
    avgOf(this.recentActivities().map((activity) => activity.avgCadence)),
  );
  protected readonly fastestPace = computed(() =>
    minOf(this.recentActivities().map((activity) => activity.avgPaceMinPerKm)),
  );
  protected readonly maxSpeed = computed(() =>
    maxOf(this.recentActivities().map((activity) => activity.maxSpeed)),
  );
  protected readonly longestRecent = computed(() =>
    maxOf(this.recentActivities().map((activity) => activity.distanceMeters)),
  );
  protected readonly biggestClimb = computed(() =>
    maxOf(this.recentActivities().map((activity) => activity.elevationGain)),
  );

  /* ------------------------------------------------------------------ */
  /* Zonas del corredor y predicciones de marca                         */
  /* ------------------------------------------------------------------ */

  protected readonly hrZones = computed(() => this.zones()?.heartRate.zones ?? []);
  protected readonly paceZones = computed(() => this.zones()?.pace.zones ?? []);

  protected readonly zonesSourceLabel = computed(
    () => ZONES_SOURCE_LABELS[this.zones()?.source ?? ''] ?? 'SIN PERFIL',
  );

  protected readonly hrMethodLabel = computed(() => {
    const method = this.zones()?.heartRate.method;
    return method ? (HR_METHOD_LABELS[method] ?? method) : '—';
  });

  protected readonly paceMethodLabel = computed(() => {
    const method = this.zones()?.pace.method;
    return method ? (PACE_METHOD_LABELS[method] ?? method) : '—';
  });

  protected readonly configuredMaxHr = computed(() => this.zones()?.heartRate.maxHeartRate ?? null);
  protected readonly restingHr = computed(() => this.zones()?.heartRate.restingHeartRate ?? null);
  protected readonly thresholdPace = computed(() => this.zones()?.pace.thresholdPaceFormatted ?? null);

  protected readonly predictionRows = computed(() => {
    const predictions = this.racePredictions()?.predictedRaceTimes;
    if (!predictions) {
      return [];
    }
    return [
      { label: '5K', value: predictions['5k'] },
      { label: '10K', value: predictions['10k'] },
      { label: '21K', value: predictions['21k'] },
      { label: '42K', value: predictions['42k'] },
    ];
  });

  protected readonly predictionHint = computed(() => {
    const predictions = this.racePredictions();
    if (!predictions) {
      return '—';
    }
    const parts = [`VO2Max ${this.fmt(predictions.vo2MaxEstimated)} ml/kg/min`];
    if (predictions.fitnessCategory) {
      parts.push(predictions.fitnessCategory);
    }
    return parts.join(' · ');
  });

  /* ------------------------------------------------------------------ */
  /* Estado de forma (PMC + ACWR)                                       */
  /* ------------------------------------------------------------------ */

  protected readonly latestPmc = computed(() => {
    const points = this.pmc();
    return points.length > 0 ? points[points.length - 1] : null;
  });

  protected readonly acwrZone = computed(() => {
    const zone = (this.acwr()?.zone ?? '').toUpperCase();
    return { label: ACWR_ZONE_LABELS[zone] ?? 'SIN DATOS', tone: zoneTone(zone) };
  });

  /** Días con carga registrada en los últimos 28 días del PMC. */
  protected readonly activeDays28 = computed(
    () => this.pmc().slice(-28).filter((point) => (point.dailyTrimp ?? 0) > 0).length,
  );

  /** Carga semanal media de las últimas 4 semanas (TRIMP). */
  protected readonly weeklyLoad28 = computed(() => {
    const points = this.pmc().slice(-28);
    if (points.length === 0) {
      return null;
    }
    const total = points.reduce((sum, point) => sum + (point.dailyTrimp ?? 0), 0);
    return (total / points.length) * 7;
  });

  /* ------------------------------------------------------------------ */
  /* Récords y calidad de datos                                         */
  /* ------------------------------------------------------------------ */

  protected readonly pbRows = computed(() =>
    [...this.records()].sort((a, b) => a.targetDistanceMeters - b.targetDistanceMeters),
  );

  protected readonly pbPace = computed(() =>
    minOf(this.records().map((record) => record.avgPaceMinPerKm)),
  );

  protected readonly sourceBreakdown = computed<SourceSlice[]>(() => {
    const activities = this.recentActivities();
    if (activities.length === 0) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const activity of activities) {
      const source = (activity.sourceFileType || 'DESCONOCIDO').toUpperCase();
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({
        source,
        count,
        percent: Math.round((count / activities.length) * 100),
      }));
  });

  protected readonly backupCoverage = computed<BackupCoverage>(() => {
    const activities = this.recentActivities();
    const covered = activities.filter((activity) => !!activity.backupFilePath).length;
    return {
      covered,
      total: activities.length,
      percent: activities.length === 0 ? 0 : Math.round((covered / activities.length) * 100),
    };
  });

  /* ------------------------------------------------------------------ */
  /* Logros y constancia                                                */
  /* ------------------------------------------------------------------ */

  protected readonly bestStreak = computed(() => {
    const streakMilestones = this.milestones
      .milestones()
      .filter((milestone) => milestone.metric === 'streakWeeks');
    if (streakMilestones.length === 0) {
      return null;
    }
    return Math.max(...streakMilestones.map((milestone) => milestone.current ?? 0));
  });

  protected readonly milestoneSummary = computed<MilestoneSummary>(() => {
    const list = this.milestones.milestones();
    const unlocked = list.filter((milestone) => milestone.unlocked).length;
    const total = list.length;
    const next =
      list
        .filter((milestone) => !milestone.unlocked && milestone.current !== null)
        .sort((a, b) => b.progress - a.progress)[0] ?? null;
    return { unlocked, total, percent: total === 0 ? 0 : Math.round((unlocked / total) * 100), next };
  });

  ngOnInit(): void {
    this.loadProfile();
  }

  protected loadProfile(): void {
    this.profileLoading.set(true);
    forkJoin({
      summary: this.stats.summary().pipe(catchError(() => of(null))),
      preferences: this.training.preferences().pipe(catchError(() => of(null))),
      coverage: this.activities.elevationCoverage().pipe(catchError(() => of(null))),
      zones: this.zonesApi.get().pipe(catchError(() => of(null))),
    }).subscribe((result) => {
      this.careerSummary.set(result.summary);
      this.preferences.set(result.preferences);
      this.elevationCoverage.set(result.coverage);
      this.zones.set(result.zones);
      this.profileLoading.set(false);

      const total = result.summary?.totalActivities ?? 0;
      if (total > 0) {
        this.loadOldestActivity(total);
      }
    });

    this.loadRacePredictions();
    void this.milestones.load();
  }

  /**
   * Predicciones de 5K/10K/21K/42K de la sesión reciente con mejor señal
   * fisiológica. El backend las deriva del VO2Max estimado de esa actividad.
   */
  private loadRacePredictions(): void {
    const candidate = this.recentActivities().find(
      (activity) => (activity.vo2MaxEstimated ?? 0) > 0,
    );
    if (!candidate) {
      return;
    }
    this.activities
      .vo2MaxVam(candidate.id)
      .pipe(catchError(() => of(null)))
      .subscribe((predictions) => this.racePredictions.set(predictions));
  }

  /** La primera carrera está en la última página del listado (orden DESC). */
  private loadOldestActivity(totalActivities: number): void {
    const lastPage = Math.max(0, totalActivities - 1);
    this.activities
      .list(lastPage, 1)
      .pipe(catchError(() => of(null)))
      .subscribe((page) => this.oldestActivity.set(page?.content[0] ?? null));
  }

  protected retryMilestones(): void {
    this.milestones.retry();
  }

  protected openLatest(): void {
    const latest = this.latestSession();
    if (latest) {
      this.openActivity.emit(latest.id);
    }
  }

  protected openRecord(record: RecordResponseDto): void {
    this.openActivity.emit(record.activityId);
  }

  protected milestoneValue(milestone: MilestoneProgress): string {
    return formatMilestoneValue(milestone, milestone.current);
  }

  protected milestoneTarget(milestone: MilestoneProgress): string {
    return formatMilestoneValue(milestone, milestone.target);
  }

  protected milestoneRemaining(milestone: MilestoneProgress): string {
    return milestoneRemainingLabel(milestone, milestone.current);
  }

  /* ------------------------------------------------------------------ */
  /* Formateo                                                           */
  /* ------------------------------------------------------------------ */

  protected fmt(value: number | null, digits = 1): string {
    if (value === null || !Number.isFinite(value)) {
      return '—';
    }
    return digits === 0
      ? INTEGER_FORMAT.format(value).replace(/,/g, '.')
      : decimalFormatter(digits).format(value);
  }

  protected fmtKm(meters: number | null): string {
    return meters === null ? '—' : `${this.fmt(meters / 1000, 1)} km`;
  }

  protected fmtMeters(meters: number | null): string {
    return meters === null ? '—' : `${this.fmt(meters, 0)} m`;
  }

  protected fmtPercent(value: number | null): string {
    return value === null ? '—' : `${decimalFormatter(1).format(value)}%`;
  }

  protected openToneClass(tone: Tone): string {
    return `runner-chip runner-chip--${tone}`;
  }
}

function maxOf(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value) && value > 0,
  );
  return valid.length > 0 ? Math.max(...valid) : null;
}

function minOf(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value) && value > 0,
  );
  return valid.length > 0 ? Math.min(...valid) : null;
}

function avgOf(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value) && value > 0,
  );
  return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function historySpanLabel(days: number): string {
  if (days < 45) {
    return `${days} días`;
  }
  const months = Math.round(days / 30.44);
  if (months < 24) {
    return `${months} meses`;
  }
  return `${(days / 365.25).toFixed(1).replace('.', ',')} años`;
}

function zoneTone(zone: string): Tone {
  switch (zone) {
    case 'SWEET_SPOT':
      return 'ok';
    case 'CAUTION':
    case 'HIGH_RISK':
      return 'warn';
    case 'DANGER':
    case 'DANGER_ZONE':
    case 'OVERLOAD':
      return 'risk';
    default:
      return 'low';
  }
}
