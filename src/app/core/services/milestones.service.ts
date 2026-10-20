import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Activity } from '../models/api.models';
import {
  MILESTONE_DEFINITIONS,
  MilestoneDefinition,
  MilestoneMetric,
  MilestoneProgress,
  buildMilestoneProgress,
} from '../models/milestone.models';
import { ActivitiesService } from './activities.service';

export type MilestonesStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Métricas que se calculan recorriendo el historial de actividades. */
const ACTIVITY_METRICS: readonly MilestoneMetric[] = [
  'distanceKm',
  'sessions',
  'elevationM',
  'hours',
  'longestKm',
  'streakWeeks',
];

/** Tamaño de página al recorrer el listado completo de actividades. */
const PAGE_SIZE = 100;

const WEEK_MS = 7 * 86_400_000;
/** Lunes de referencia para numerar semanas consecutivas. */
const WEEK_REFERENCE_UTC = Date.UTC(1970, 0, 5);

interface MilestoneState {
  current: number;
  unlockedAt: string | null;
  unlockedActivityId: string | null;
}

/**
 * Cálculo de logros automáticos sobre el historial completo del corredor.
 *
 * Descarga únicamente los metadatos de las actividades (sin telemetría) y
 * recorre el historial en orden cronológico para conocer no solo el progreso
 * actual, sino también la fecha en la que se cruzó cada objetivo.
 *
 * El estado vive en el servicio (root) para no recalcular al cambiar de
 * pestaña. El widget de logros se encarga de los récords y Eddington, que ya
 * llegan al dashboard desde `/stats/records` y `/analytics/eddington`.
 */
@Injectable({ providedIn: 'root' })
export class MilestonesService {
  private readonly activities = inject(ActivitiesService);

  private readonly statusSignal = signal<MilestonesStatus>('idle');
  private readonly milestonesSignal = signal<MilestoneProgress[]>([]);
  private readonly activityCountSignal = signal(0);

  readonly status = this.statusSignal.asReadonly();
  readonly milestones = this.milestonesSignal.asReadonly();
  readonly activityCount = this.activityCountSignal.asReadonly();

  /** Descarga el historial y calcula los logros (idempotente). */
  async load(): Promise<void> {
    if (this.statusSignal() === 'loading' || this.statusSignal() === 'ready') {
      return;
    }
    this.statusSignal.set('loading');
    try {
      const activities = await this.fetchAllActivities();
      this.activityCountSignal.set(activities.length);
      this.milestonesSignal.set(computeActivityMilestones(activities));
      this.statusSignal.set('ready');
    } catch {
      this.statusSignal.set('error');
    }
  }

  /** Reintenta el cálculo tras un error de red. */
  retry(): void {
    if (this.statusSignal() === 'loading') {
      return;
    }
    this.statusSignal.set('idle');
    this.milestonesSignal.set([]);
    void this.load();
  }

  /** Recalcula solo si el panel ya se había abierto (refresco global del dashboard). */
  refreshIfLoaded(): void {
    if (this.statusSignal() === 'ready' || this.statusSignal() === 'error') {
      this.retry();
    }
  }

  /** Recorre el listado completo de actividades (orden startTime DESC). */
  private async fetchAllActivities(): Promise<Activity[]> {
    const all: Activity[] = [];
    for (let page = 0; ; page += 1) {
      const chunk = await firstValueFrom(this.activities.list(page, PAGE_SIZE));
      all.push(...chunk.content);
      if (chunk.last || chunk.content.length === 0 || page + 1 >= chunk.totalPages) {
        break;
      }
    }
    return all;
  }
}

/**
 * Recorre las actividades en orden ascendente acumulando las métricas y
 * registrando la actividad y la fecha en las que cada logro cruzó su objetivo.
 */
function computeActivityMilestones(activities: Activity[]): MilestoneProgress[] {
  const definitions = MILESTONE_DEFINITIONS.filter((def) => ACTIVITY_METRICS.includes(def.metric));
  const state = new Map<string, MilestoneState>();
  for (const def of definitions) {
    state.set(def.id, { current: 0, unlockedAt: null, unlockedActivityId: null });
  }

  const sorted = activities
    .filter((activity) => Number.isFinite(new Date(activity.startTime).getTime()))
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  let distanceKm = 0;
  let sessions = 0;
  let elevationM = 0;
  let hours = 0;
  let longestKm = 0;

  const update = (metric: MilestoneMetric, value: number, activity: Activity): void => {
    for (const def of definitions) {
      if (def.metric !== metric) {
        continue;
      }
      const entry = state.get(def.id);
      if (!entry) {
        continue;
      }
      entry.current = value;
      if (entry.unlockedAt === null && value >= def.target) {
        entry.unlockedAt = activity.startTime;
        entry.unlockedActivityId = activity.id;
      }
    }
  };

  for (const activity of sorted) {
    const distance = Math.max(0, activity.distanceMeters ?? 0);
    distanceKm += distance / 1000;
    sessions += 1;
    elevationM += Math.max(0, activity.elevationGain ?? 0);
    hours += Math.max(0, activity.totalTimeSeconds ?? 0) / 3600;
    longestKm = Math.max(longestKm, distance / 1000);

    update('distanceKm', distanceKm, activity);
    update('sessions', sessions, activity);
    update('elevationM', elevationM, activity);
    update('hours', hours, activity);
    update('longestKm', longestKm, activity);
  }

  updateStreakMilestones(sorted, definitions, state);

  return definitions.map((def) => {
    const entry = state.get(def.id) ?? { current: 0, unlockedAt: null, unlockedActivityId: null };
    return buildMilestoneProgress(def, entry.current, entry.unlockedAt, entry.unlockedActivityId);
  });
}

/** Racha máxima de semanas consecutivas con al menos una carrera. */
function updateStreakMilestones(
  activities: Activity[],
  definitions: MilestoneDefinition[],
  state: Map<string, MilestoneState>,
): void {
  const streakDefinitions = definitions.filter((def) => def.metric === 'streakWeeks');
  if (streakDefinitions.length === 0) {
    return;
  }

  const lastActivityByWeek = new Map<number, Activity>();
  for (const activity of activities) {
    const week = weekIndex(new Date(activity.startTime));
    const previous = lastActivityByWeek.get(week);
    if (!previous || activity.startTime > previous.startTime) {
      lastActivityByWeek.set(week, activity);
    }
  }

  let previousWeek: number | null = null;
  let streak = 0;
  let best = 0;
  for (const week of [...lastActivityByWeek.keys()].sort((a, b) => a - b)) {
    streak = previousWeek !== null && week === previousWeek + 1 ? streak + 1 : 1;
    previousWeek = week;
    best = Math.max(best, streak);
    const lastActivity = lastActivityByWeek.get(week);
    for (const def of streakDefinitions) {
      const entry = state.get(def.id);
      if (!entry) {
        continue;
      }
      entry.current = best;
      if (entry.unlockedAt === null && best >= def.target && lastActivity) {
        entry.unlockedAt = lastActivity.startTime;
        entry.unlockedActivityId = lastActivity.id;
      }
    }
  }
}

/**
 * Índice de semana con lunes como inicio. Se usan fechas UTC del calendario
 * local para que los cambios de horario (DST) no desplacen las semanas.
 */
function weekIndex(date: Date): number {
  const calendarUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((calendarUtc - WEEK_REFERENCE_UTC) / WEEK_MS);
}
