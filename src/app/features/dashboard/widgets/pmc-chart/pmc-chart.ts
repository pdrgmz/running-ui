import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PmcPointDto } from '../../../../core/models/api.models';

interface ChartTick {
  pos: number;
  label: string;
}

interface ChartGeometry {
  ctlPolyline: string;
  atlPolyline: string;
  tsbPolyline: string;
  yTicks: ChartTick[];
  xTicks: ChartTick[];
  zeroY: number | null;
  single: { x: number; ctl: number; atl: number; tsb: number } | null;
}

const VIEW_W = 860;
const VIEW_H = 260;
const PAD_L = 50;
const PAD_R = 18;
const PAD_T = 18;
const PAD_B = 30;
const Y_TARGET_TICKS = 6;

/**
 * Gráfico de líneas del Performance Management Chart (CTL / ATL / TSB)
 * dibujado en SVG puro con la estética mono del UI Kit.
 */
@Component({
  selector: 'app-pmc-chart',
  imports: [DecimalPipe],
  templateUrl: './pmc-chart.html',
  styleUrl: './pmc-chart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PmcChart {
  readonly points = input<PmcPointDto[]>([]);

  protected readonly viewBox = `0 0 ${VIEW_W} ${VIEW_H}`;
  protected readonly viewHeight = VIEW_H;
  protected readonly viewWidth = VIEW_W;

  protected readonly geometry = computed<ChartGeometry>(() => buildGeometry(this.points()));

  protected readonly latest = computed(() => {
    const list = this.points();
    return list.length > 0 ? list[list.length - 1] : null;
  });

  protected readonly previous = computed(() => {
    const list = this.points();
    return list.length > 1 ? list[list.length - 2] : null;
  });

  protected delta(field: 'ctl' | 'atl' | 'tsb' | 'acwr'): string {
    const last = this.latest();
    const prev = this.previous();
    if (!last || !prev) {
      return '';
    }
    const digits = field === 'acwr' ? 2 : 1;
    const diff = (last[field] ?? 0) - (prev[field] ?? 0);
    if (Math.abs(diff) < (field === 'acwr' ? 0.005 : 0.05)) {
      return `≈ ${(0).toFixed(digits)}`;
    }
    return `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(digits)}`;
  }
}

function buildGeometry(points: PmcPointDto[]): ChartGeometry {
  const empty: ChartGeometry = {
    ctlPolyline: '',
    atlPolyline: '',
    tsbPolyline: '',
    yTicks: [],
    xTicks: [],
    zeroY: null,
    single: null,
  };
  if (points.length === 0) {
    return empty;
  }

  const values = points.flatMap((p) => [p.ctl ?? 0, p.atl ?? 0, p.tsb ?? 0]);
  let yMin = Math.min(0, ...values);
  let yMax = Math.max(0, ...values);
  if (yMax - yMin < 1) {
    yMax += 1;
  }
  const margin = (yMax - yMin) * 0.08;
  yMin -= margin;
  yMax += margin;

  const plotW = VIEW_W - PAD_L - PAD_R;
  const plotH = VIEW_H - PAD_T - PAD_B;
  const n = points.length;

  const x = (index: number): number => (n === 1 ? PAD_L + plotW / 2 : PAD_L + (index / (n - 1)) * plotW);
  const y = (value: number): number => PAD_T + (1 - (value - yMin) / (yMax - yMin)) * plotH;
  const polyline = (picker: (p: PmcPointDto) => number): string =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(picker(p) ?? 0).toFixed(1)}`).join(' ');

  // Ticks "bonitos": múltiplos de un paso redondeado (1/2/2.5/5 × 10ⁿ) dentro del rango visible.
  const step = niceStep((yMax - yMin) / Y_TARGET_TICKS);
  const yTicks: ChartTick[] = [];
  for (let value = Math.ceil(yMin / step) * step; value <= yMax + step / 100; value += step) {
    yTicks.push({ pos: y(value), label: tickLabel(value, step) });
  }
  if (yTicks.length === 0) {
    yTicks.push({ pos: y(0), label: tickLabel(0, step) });
  }

  const xTickIndexes = n === 1 ? [0] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const xTicks: ChartTick[] = xTickIndexes.map((i) => ({
    pos: x(i),
    label: shortDate(points[i].date),
  }));

  const zeroY = yMin <= 0 && yMax >= 0 ? y(0) : null;

  return {
    ctlPolyline: polyline((p) => p.ctl),
    atlPolyline: polyline((p) => p.atl),
    tsbPolyline: polyline((p) => p.tsb),
    yTicks,
    xTicks,
    zeroY,
    single:
      n === 1
        ? {
            x: x(0),
            ctl: y(points[0].ctl ?? 0),
            atl: y(points[0].atl ?? 0),
            tsb: y(points[0].tsb ?? 0),
          }
        : null,
  };
}

/** Redondea un rango al paso "bonito" más cercano: 1, 2, 2.5, 5 o 10 × 10ⁿ. */
function niceStep(range: number): number {
  if (!Number.isFinite(range) || range <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

function tickLabel(value: number, step: number): string {
  if (Number.isInteger(step) && Math.abs(step) >= 1) {
    return value.toFixed(0);
  }
  return step >= 0.1 ? value.toFixed(1) : value.toFixed(2);
}

function shortDate(date: string): string {
  // Espera formato ISO yyyy-MM-dd; devuelve dd/MM.
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
}
