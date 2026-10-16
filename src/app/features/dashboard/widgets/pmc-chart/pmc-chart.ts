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
}

const VIEW_W = 860;
const VIEW_H = 260;
const PAD_L = 50;
const PAD_R = 18;
const PAD_T = 18;
const PAD_B = 30;

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
    const diff = (last[field] ?? 0) - (prev[field] ?? 0);
    if (Math.abs(diff) < 0.05) {
      return '≈ 0.0';
    }
    return `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)}`;
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

  const yTickCount = 4;
  const yTicks: ChartTick[] = Array.from({ length: yTickCount + 1 }, (_, i) => {
    const value = yMin + ((yMax - yMin) * i) / yTickCount;
    return { pos: y(value), label: value.toFixed(0) };
  });

  const xTickIndexes = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
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
  };
}

function shortDate(date: string): string {
  // Espera formato ISO yyyy-MM-dd; devuelve dd/MM.
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
}
