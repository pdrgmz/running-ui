import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Activity } from '../models/api.models';
import { ActivitiesService } from './activities.service';

/** Traza simplificada de una sesión: pares [latitud, longitud]. */
export interface HeatRoute {
  id: string;
  points: [number, number][];
}

export interface HeatmapStats {
  /** Sesiones dibujadas (con GPS válido). */
  activities: number;
  /** Sesiones consultadas en total. */
  activitiesTotal: number;
  /** Metros acumulados de las sesiones dibujadas. */
  distanceMeters: number;
  /** Puntos GPS agregados. */
  points: number;
  firstDate: string | null;
  lastDate: string | null;
}

export type HeatmapStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Trazas descargadas en paralelo por lote (para no saturar la API). */
const CONCURRENCY = 6;
/** Tamaño de página al recorrer el listado completo de actividades. */
const PAGE_SIZE = 100;

/**
 * Mapa de calor global: descarga las trazas GPS de todas las actividades del
 * usuario (una sola vez por sesión) y las agrega para dibujarlas superpuestas.
 * El estado vive aquí para sobrevivir al cambio de pestaña del dashboard.
 */
@Injectable({ providedIn: 'root' })
export class HeatmapService {
  private readonly activities = inject(ActivitiesService);

  private readonly statusSignal = signal<HeatmapStatus>('idle');
  private readonly routesSignal = signal<HeatRoute[]>([]);
  private readonly statsSignal = signal<HeatmapStats | null>(null);
  private readonly loadedSignal = signal(0);
  private readonly totalSignal = signal(0);

  readonly status = this.statusSignal.asReadonly();
  readonly routes = this.routesSignal.asReadonly();
  readonly stats = this.statsSignal.asReadonly();
  readonly progress = computed(() => ({ done: this.loadedSignal(), total: this.totalSignal() }));

  /** Descarga y agrega todas las trazas GPS (idempotente). */
  async load(): Promise<void> {
    if (this.statusSignal() === 'loading' || this.statusSignal() === 'ready') {
      return;
    }
    this.statusSignal.set('loading');
    try {
      const activities = await this.fetchAllActivities();
      this.totalSignal.set(activities.length);
      this.loadedSignal.set(0);

      const queue = [...activities];
      const routes: HeatRoute[] = [];
      const loadOne = async (activity: Activity): Promise<void> => {
        try {
          const track = await firstValueFrom(this.activities.trackpoints(activity.id, 'low'));
          const points = track
            .filter((p) => p.latitude !== null && p.longitude !== null)
            .map((p) => [p.latitude as number, p.longitude as number] as [number, number]);
          if (points.length >= 2) {
            routes.push({ id: activity.id, points });
          }
        } catch {
          /* Sesión sin GPS o error puntual: se omite del mapa. */
        }
        this.loadedSignal.update((n) => n + 1);
      };
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        let next = queue.shift();
        while (next) {
          await loadOne(next);
          next = queue.shift();
        }
      });
      await Promise.all(workers);

      routes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      this.routesSignal.set(routes);
      this.statsSignal.set(this.buildStats(activities, routes));
      this.statusSignal.set('ready');
    } catch {
      this.statusSignal.set('error');
    }
  }

  /** Reintenta la descarga completa tras un error. */
  retry(): void {
    if (this.statusSignal() === 'loading') {
      return;
    }
    this.statusSignal.set('idle');
    this.routesSignal.set([]);
    this.statsSignal.set(null);
    void this.load();
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

  private buildStats(activities: Activity[], routes: HeatRoute[]): HeatmapStats {
    const drawn = new Set(routes.map((r) => r.id));
    const withGps = activities.filter((a) => drawn.has(a.id));
    const times = withGps
      .map((a) => a.startTime)
      .filter((t): t is string => typeof t === 'string')
      .sort();
    return {
      activities: routes.length,
      activitiesTotal: activities.length,
      distanceMeters: withGps.reduce((sum, a) => sum + (a.distanceMeters ?? 0), 0),
      points: routes.reduce((sum, r) => sum + r.points.length, 0),
      firstDate: times[0] ?? null,
      lastDate: times[times.length - 1] ?? null,
    };
  }
}
