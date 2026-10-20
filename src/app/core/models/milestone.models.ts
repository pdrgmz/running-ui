/**
 * Catálogo de logros automáticos del corredor y utilidades de presentación.
 *
 * Los logros se calculan a partir de los datos que ya expone la API: el
 * historial completo de actividades (`/activities`) y, para Eddington y los
 * récords, los endpoints de analítica y estadísticas.
 */

import { formatDuration } from '../../shared/pipes/format.pipes';

export type MilestoneCategoryId =
  | 'distance'
  | 'sessions'
  | 'elevation'
  | 'time'
  | 'longest'
  | 'streak'
  | 'eddington'
  | 'records';

/** Métrica que alimenta cada logro. */
export type MilestoneMetric =
  | 'distanceKm'
  | 'sessions'
  | 'elevationM'
  | 'hours'
  | 'longestKm'
  | 'streakWeeks'
  | 'eddington'
  | 'recordTime';

export type MilestoneFormat = 'km' | 'sessions' | 'elevation' | 'hours' | 'weeks' | 'eddington' | 'time';

export interface MilestoneDefinition {
  id: string;
  category: MilestoneCategoryId;
  title: string;
  metric: MilestoneMetric;
  target: number;
  format: MilestoneFormat;
  /** En récords de tiempo, bajar del objetivo es lo que desbloquea el logro. */
  lowerIsBetter?: boolean;
  /** En récords, categoría del PB a consultar (`5k`, `10k`, `21k`, `42k`). */
  recordCategory?: string;
}

export interface MilestoneProgress extends MilestoneDefinition {
  /** Valor actual de la métrica (`null` si no hay datos, p. ej. sin PB). */
  current: number | null;
  unlocked: boolean;
  /** Fecha ISO en la que se cruzó el objetivo (null si no es calculable). */
  unlockedAt: string | null;
  /** Actividad con la que se cruzó el objetivo (null si no hay una concreta). */
  unlockedActivityId: string | null;
  /** Progreso normalizado 0..1 para la barra. */
  progress: number;
}

export const MILESTONE_CATEGORY_LABELS: Record<MilestoneCategoryId, string> = {
  distance: 'Distancia',
  sessions: 'Sesiones',
  elevation: 'Desnivel',
  time: 'Tiempo',
  longest: 'Distancia larga',
  streak: 'Constancia',
  eddington: 'Eddington',
  records: 'Récords',
};

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  /* --- Distancia acumulada --- */
  { id: 'distance-100', category: 'distance', title: 'Primeros 100 km', metric: 'distanceKm', target: 100, format: 'km' },
  { id: 'distance-500', category: 'distance', title: '500 km acumulados', metric: 'distanceKm', target: 500, format: 'km' },
  { id: 'distance-1000', category: 'distance', title: '1.000 km acumulados', metric: 'distanceKm', target: 1000, format: 'km' },
  { id: 'distance-2500', category: 'distance', title: '2.500 km acumulados', metric: 'distanceKm', target: 2500, format: 'km' },
  { id: 'distance-5000', category: 'distance', title: '5.000 km acumulados', metric: 'distanceKm', target: 5000, format: 'km' },
  { id: 'distance-10000', category: 'distance', title: '10.000 km acumulados', metric: 'distanceKm', target: 10000, format: 'km' },

  /* --- Número de sesiones --- */
  { id: 'sessions-1', category: 'sessions', title: 'Primera carrera', metric: 'sessions', target: 1, format: 'sessions' },
  { id: 'sessions-10', category: 'sessions', title: '10 carreras', metric: 'sessions', target: 10, format: 'sessions' },
  { id: 'sessions-25', category: 'sessions', title: '25 carreras', metric: 'sessions', target: 25, format: 'sessions' },
  { id: 'sessions-50', category: 'sessions', title: '50 carreras', metric: 'sessions', target: 50, format: 'sessions' },
  { id: 'sessions-100', category: 'sessions', title: '100 carreras', metric: 'sessions', target: 100, format: 'sessions' },
  { id: 'sessions-250', category: 'sessions', title: '250 carreras', metric: 'sessions', target: 250, format: 'sessions' },
  { id: 'sessions-500', category: 'sessions', title: '500 carreras', metric: 'sessions', target: 500, format: 'sessions' },

  /* --- Desnivel positivo --- */
  { id: 'elevation-1000', category: 'elevation', title: '1.000 m de desnivel', metric: 'elevationM', target: 1000, format: 'elevation' },
  { id: 'elevation-5000', category: 'elevation', title: '5.000 m de desnivel', metric: 'elevationM', target: 5000, format: 'elevation' },
  { id: 'elevation-10000', category: 'elevation', title: '10.000 m de desnivel', metric: 'elevationM', target: 10000, format: 'elevation' },
  { id: 'elevation-25000', category: 'elevation', title: '25.000 m de desnivel', metric: 'elevationM', target: 25000, format: 'elevation' },
  { id: 'elevation-50000', category: 'elevation', title: '50.000 m de desnivel', metric: 'elevationM', target: 50000, format: 'elevation' },

  /* --- Tiempo en movimiento --- */
  { id: 'time-10', category: 'time', title: '10 horas corriendo', metric: 'hours', target: 10, format: 'hours' },
  { id: 'time-50', category: 'time', title: '50 horas corriendo', metric: 'hours', target: 50, format: 'hours' },
  { id: 'time-100', category: 'time', title: '100 horas corriendo', metric: 'hours', target: 100, format: 'hours' },
  { id: 'time-250', category: 'time', title: '250 horas corriendo', metric: 'hours', target: 250, format: 'hours' },
  { id: 'time-500', category: 'time', title: '500 horas corriendo', metric: 'hours', target: 500, format: 'hours' },

  /* --- Distancia máxima en una sola sesión --- */
  { id: 'longest-5k', category: 'longest', title: 'Primer 5K', metric: 'longestKm', target: 5, format: 'km' },
  { id: 'longest-10k', category: 'longest', title: 'Primer 10K', metric: 'longestKm', target: 10, format: 'km' },
  { id: 'longest-15k', category: 'longest', title: 'Primer 15K', metric: 'longestKm', target: 15, format: 'km' },
  { id: 'longest-21k', category: 'longest', title: 'Media maratón (21,1 km)', metric: 'longestKm', target: 21.1, format: 'km' },
  { id: 'longest-42k', category: 'longest', title: 'Maratón (42,2 km)', metric: 'longestKm', target: 42.2, format: 'km' },

  /* --- Constancia: semanas consecutivas con al menos una carrera --- */
  { id: 'streak-4', category: 'streak', title: '4 semanas seguidas', metric: 'streakWeeks', target: 4, format: 'weeks' },
  { id: 'streak-8', category: 'streak', title: '8 semanas seguidas', metric: 'streakWeeks', target: 8, format: 'weeks' },
  { id: 'streak-12', category: 'streak', title: '12 semanas seguidas', metric: 'streakWeeks', target: 12, format: 'weeks' },
  { id: 'streak-26', category: 'streak', title: '26 semanas seguidas', metric: 'streakWeeks', target: 26, format: 'weeks' },
  { id: 'streak-52', category: 'streak', title: '52 semanas seguidas', metric: 'streakWeeks', target: 52, format: 'weeks' },

  /* --- Eddington (valor actual expuesto por /analytics/eddington) --- */
  { id: 'eddington-10', category: 'eddington', title: 'Eddington 10', metric: 'eddington', target: 10, format: 'eddington' },
  { id: 'eddington-15', category: 'eddington', title: 'Eddington 15', metric: 'eddington', target: 15, format: 'eddington' },
  { id: 'eddington-20', category: 'eddington', title: 'Eddington 20', metric: 'eddington', target: 20, format: 'eddington' },
  { id: 'eddington-25', category: 'eddington', title: 'Eddington 25', metric: 'eddington', target: 25, format: 'eddington' },
  { id: 'eddington-30', category: 'eddington', title: 'Eddington 30', metric: 'eddington', target: 30, format: 'eddington' },

  /* --- Récords personales (PB) --- */
  { id: 'pb-5k-1800', category: 'records', title: '5K sub 30:00', metric: 'recordTime', target: 1800, format: 'time', lowerIsBetter: true, recordCategory: '5k' },
  { id: 'pb-5k-1500', category: 'records', title: '5K sub 25:00', metric: 'recordTime', target: 1500, format: 'time', lowerIsBetter: true, recordCategory: '5k' },
  { id: 'pb-5k-1200', category: 'records', title: '5K sub 20:00', metric: 'recordTime', target: 1200, format: 'time', lowerIsBetter: true, recordCategory: '5k' },
  { id: 'pb-10k-3600', category: 'records', title: '10K sub 60:00', metric: 'recordTime', target: 3600, format: 'time', lowerIsBetter: true, recordCategory: '10k' },
  { id: 'pb-10k-3000', category: 'records', title: '10K sub 50:00', metric: 'recordTime', target: 3000, format: 'time', lowerIsBetter: true, recordCategory: '10k' },
  { id: 'pb-10k-2700', category: 'records', title: '10K sub 45:00', metric: 'recordTime', target: 2700, format: 'time', lowerIsBetter: true, recordCategory: '10k' },
  { id: 'pb-21k-7200', category: 'records', title: 'Media maratón sub 2h', metric: 'recordTime', target: 7200, format: 'time', lowerIsBetter: true, recordCategory: '21k' },
  { id: 'pb-21k-6300', category: 'records', title: 'Media maratón sub 1h45', metric: 'recordTime', target: 6300, format: 'time', lowerIsBetter: true, recordCategory: '21k' },
  { id: 'pb-42k-14400', category: 'records', title: 'Maratón sub 4h', metric: 'recordTime', target: 14400, format: 'time', lowerIsBetter: true, recordCategory: '42k' },
];

const NUMBER_FORMAT = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
});

/**
 * El locale español no agrupa números de 4 cifras (norma RAE), pero en la
 * interfaz conviven títulos como "1.000 km" con estos valores; forzamos el
 * mismo separador de millares para que todo el panel sea coherente.
 */
function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Valor de una métrica con su unidad (`22:35`, `1.240 km`, `E=15`…). */
export function formatMilestoneValue(milestone: MilestoneDefinition, value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  switch (milestone.format) {
    case 'km':
      return `${formatNumber(value)} km`;
    case 'sessions': {
      const count = Math.floor(value);
      return `${count} ${count === 1 ? 'carrera' : 'carreras'}`;
    }
    case 'elevation':
      return `${formatNumber(Math.round(value))} m D+`;
    case 'hours':
      return `${formatNumber(value)} h`;
    case 'weeks':
      return `${Math.floor(value)} semanas`;
    case 'eddington':
      return `E=${Math.floor(value)}`;
    case 'time':
      return formatDuration(value);
  }
}

/** Texto de "cuánto falta" para un logro todavía bloqueado. */
export function milestoneRemainingLabel(milestone: MilestoneDefinition, current: number | null): string {
  if (current === null || !Number.isFinite(current)) {
    return 'Sin datos todavía';
  }
  if (milestone.lowerIsBetter) {
    if (current <= milestone.target) {
      return 'Objetivo cumplido';
    }
    return `Te faltan ${formatDuration(current - milestone.target)}`;
  }
  if (current >= milestone.target) {
    return 'Objetivo cumplido';
  }
  const remaining = milestone.target - current;
  switch (milestone.format) {
    case 'km':
      return `Te faltan ${formatNumber(remaining)} km`;
    case 'sessions': {
      const count = Math.ceil(remaining);
      return count === 1 ? 'Te falta 1 carrera' : `Te faltan ${count} carreras`;
    }
    case 'elevation':
      return `Te faltan ${formatNumber(Math.ceil(remaining))} m`;
    case 'hours':
      return `Te faltan ${formatNumber(remaining)} h`;
    case 'weeks': {
      const count = Math.ceil(remaining);
      return count === 1 ? 'Te falta 1 semana' : `Te faltan ${count} semanas`;
    }
    case 'eddington': {
      const count = Math.ceil(remaining);
      return count === 1 ? 'Te falta 1 nivel E' : `Te faltan ${count} niveles E`;
    }
    case 'time':
      return `Te faltan ${formatDuration(remaining)}`;
  }
}

/**
 * Construye el estado visual de un logro a partir de su valor actual.
 * `unlockedActivityId` identifica la actividad con la que se cruzó el objetivo
 * (permite abrir su detalle desde el timeline).
 */
export function buildMilestoneProgress(
  definition: MilestoneDefinition,
  current: number | null,
  unlockedAt: string | null,
  unlockedActivityId: string | null = null,
): MilestoneProgress {
  const unlocked =
    current !== null &&
    Number.isFinite(current) &&
    (definition.lowerIsBetter ? current <= definition.target : current >= definition.target);

  let progress = 0;
  if (current !== null && Number.isFinite(current) && current >= 0) {
    if (definition.target <= 0) {
      progress = 1;
    } else if (definition.lowerIsBetter) {
      progress = Math.min(1, definition.target / Math.max(current, 1));
    } else {
      progress = Math.min(1, current / definition.target);
    }
  }

  return {
    ...definition,
    current,
    unlocked,
    unlockedAt: unlocked ? unlockedAt : null,
    unlockedActivityId: unlocked ? unlockedActivityId : null,
    progress: Math.max(0, Math.min(1, progress)),
  };
}
