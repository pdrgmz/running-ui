import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ActivityTrackpoint } from '../../../../core/models/api.models';
import { PacePipe } from '../../../../shared/pipes/format.pipes';

type MetricKey = 'pace' | 'cadence' | 'heartRate' | 'altitude';

interface ProfileEntry {
  /** Índice del trackpoint original (para sincronizar con el mapa). */
  src: number;
  distanceMeters: number;
  /** Posición horizontal 0..100 (%). */
  x: number;
  pace: number | null;
  cadence: number | null;
  heartRate: number | null;
  altitude: number | null;
}

interface ProfileChart {
  key: MetricKey;
  label: string;
  unit: string;
  path: string;
  area: string;
  xs: number[];
  ys: (number | null)[];
}

interface ProfileData {
  entries: ProfileEntry[];
  charts: ProfileChart[];
  srcToPos: Map<number, number>;
}

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  /** En ritmo, el valor más bajo (más rápido) se dibuja arriba. */
  invert: boolean;
}

const METRICS: MetricDef[] = [
  { key: 'pace', label: 'Ritmo', unit: 'min/km', invert: true },
  { key: 'cadence', label: 'Cadencia', unit: 'spm', invert: false },
  { key: 'heartRate', label: 'Frecuencia cardíaca', unit: 'bpm', invert: false },
  { key: 'altitude', label: 'Altitud', unit: 'm', invert: false },
];

/** Normaliza un valor al rango vertical 4..96 % del gráfico. */
function toY(value: number, min: number, max: number, invert: boolean): number {
  if (max === min) {
    return 50;
  }
  const ratio = (value - min) / (max - min);
  const norm = invert ? 1 - ratio : ratio;
  return 96 - norm * 92;
}

/** Traza la línea de una serie, cortando en los valores nulos. */
function buildPath(xs: number[], ys: (number | null)[]): string {
  let d = '';
  let open = false;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    if (y === null) {
      open = false;
      continue;
    }
    d += `${open ? 'L' : 'M'}${xs[i].toFixed(2)},${y.toFixed(2)}`;
    open = true;
  }
  return d;
}

/** Área bajo la línea (por tramos continuos) para dar peso visual al perfil. */
function buildArea(xs: number[], ys: (number | null)[]): string {
  let d = '';
  let segment: { x: number; y: number }[] = [];
  const flush = () => {
    if (segment.length >= 2) {
      const first = segment[0];
      const last = segment[segment.length - 1];
      d += `M${first.x.toFixed(2)},100`;
      d += segment.map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`).join('');
      d += `L${last.x.toFixed(2)},100Z`;
    }
    segment = [];
  };
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    if (y === null) {
      flush();
      continue;
    }
    segment.push({ x: xs[i], y });
  }
  flush();
  return d;
}

/**
 * Perfiles de la carrera (ritmo, cadencia, FC y altitud) con un cursor común:
 * al pasar el ratón se resalta el mismo punto en las cuatro series y se emite
 * el trackpoint activo para que el mapa coloque su marcador.
 */
@Component({
  selector: 'app-activity-profiles',
  imports: [DecimalPipe, PacePipe],
  templateUrl: './activity-profiles.html',
  styleUrl: './activity-profiles.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityProfiles {
  readonly points = input<ActivityTrackpoint[]>([]);
  readonly hoverIndex = input<number | null>(null);

  /** Trackpoint bajo el cursor (o bajo el ratón del mapa) o null al salir. */
  readonly hoverChange = output<number | null>();

  protected readonly profile = computed<ProfileData>(() => {
    const entries: ProfileEntry[] = [];
    this.points().forEach((point, src) => {
      const distance = point.distanceMeters;
      if (distance === null || !Number.isFinite(distance)) {
        return;
      }
      const speed = point.speed;
      entries.push({
        src,
        distanceMeters: distance,
        x: 0,
        pace: speed !== null && Number.isFinite(speed) && speed > 0 ? 1000 / (speed * 60) : null,
        cadence: point.cadence,
        heartRate: point.heartRate,
        altitude: point.altitudeMeters,
      });
    });
    entries.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const minDistance = entries[0]?.distanceMeters ?? 0;
    const maxDistance = entries[entries.length - 1]?.distanceMeters ?? 0;
    const span = maxDistance - minDistance || 1;
    for (const entry of entries) {
      entry.x = ((entry.distanceMeters - minDistance) / span) * 100;
    }

    const xs = entries.map((entry) => entry.x);
    const charts = METRICS.map((metric) => {
      const values = entries.map((entry) => entry[metric.key]);
      const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
      const min = valid.length > 0 ? Math.min(...valid) : null;
      const max = valid.length > 0 ? Math.max(...valid) : null;
      const ys = values.map((value) =>
        value === null || min === null || max === null ? null : toY(value, min, max, metric.invert),
      );
      return {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        path: buildPath(xs, ys),
        area: buildArea(xs, ys),
        xs,
        ys,
      };
    });

    return {
      entries,
      charts,
      srcToPos: new Map(entries.map((entry, pos) => [entry.src, pos])),
    };
  });

  /** Posición del punto activo dentro de las series (null si no hay cursor). */
  protected readonly hoverPos = computed<number | null>(() => {
    const index = this.hoverIndex();
    return index === null ? null : (this.profile().srcToPos.get(index) ?? null);
  });

  protected readonly hoverEntry = computed<ProfileEntry | null>(() => {
    const pos = this.hoverPos();
    return pos === null ? null : (this.profile().entries[pos] ?? null);
  });

  protected xPct(chart: ProfileChart): number {
    const pos = this.hoverPos();
    return pos === null ? 0 : (chart.xs[pos] ?? 0);
  }

  protected yPct(chart: ProfileChart): number | null {
    const pos = this.hoverPos();
    return pos === null ? null : (chart.ys[pos] ?? null);
  }

  /** Convierte la posición del ratón en el trackpoint más cercano (por distancia). */
  protected onPointerMove(event: PointerEvent): void {
    const { entries } = this.profile();
    if (entries.length === 0) {
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));

    let low = 0;
    let high = entries.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (entries[mid].x < x) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    if (low > 0 && Math.abs(entries[low - 1].x - x) <= Math.abs(entries[low].x - x)) {
      low -= 1;
    }

    const src = entries[low].src;
    if (src !== this.hoverIndex()) {
      this.hoverChange.emit(src);
    }
  }

  protected onPointerLeave(): void {
    if (this.hoverIndex() !== null) {
      this.hoverChange.emit(null);
    }
  }
}
