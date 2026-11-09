import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ACWR_ZONE_LABELS, AcwrStatusDto, PmcPointDto } from '../../../../core/models/api.models';

/** Estado del ratio de carga aguda:crónica (riesgo de lesión). */
@Component({
  selector: 'app-acwr-card',
  imports: [DecimalPipe],
  templateUrl: './acwr-card.html',
  styleUrl: './acwr-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcwrCard {
  readonly acwr = input<AcwrStatusDto | null>(null);
  readonly history = input<PmcPointDto[]>([]);

  protected readonly zoneLabel = computed(() => {
    const zone = this.acwr()?.zone ?? '';
    return ACWR_ZONE_LABELS[zone.toUpperCase()] ?? zone.replaceAll('_', ' ') ?? '—';
  });

  protected readonly zoneClass = computed(() => {
    switch ((this.acwr()?.zone ?? '').toUpperCase()) {
      case 'SWEET_SPOT':
        return 'zone-ok';
      case 'CAUTION':
      case 'HIGH_RISK':
        return 'zone-warn';
      case 'DANGER':
      case 'DANGER_ZONE':
      case 'OVERLOAD':
        return 'zone-risk';
      default:
        return 'zone-low';
    }
  });

  /** Posición del marcador en la escala 0.0 – 2.0. */
  protected readonly markerPercent = computed(() => {
    const value = this.acwr()?.acwr ?? 0;
    return Math.min(100, Math.max(0, (value / 2) * 100));
  });

  /** Variación porcentual de la carga aguda respecto a la crónica. */
  protected readonly variationLabel = computed(() => {
    const a = this.acwr();
    if (!a || a.chronicLoad <= 0) {
      return '—';
    }
    const value = (a.acuteLoad / a.chronicLoad - 1) * 100;
    return `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`;
  });

  /** Diferencia absoluta entre carga aguda y crónica (ATL − CTL). */
  protected readonly loadDifferenceLabel = computed(() => {
    const a = this.acwr();
    if (!a) {
      return '—';
    }
    const value = a.acuteLoad - a.chronicLoad;
    return `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}`;
  });

  /** Distancia hasta el umbral de riesgo (1.50). */
  protected readonly riskMarginLabel = computed(() => {
    const a = this.acwr();
    if (!a) {
      return '—';
    }
    const value = 1.5 - a.acwr;
    return `${value > 0 ? '+' : ''}${value.toFixed(2).replace('.', ',')}`;
  });

  /** Bandas de referencia del gráfico de tendencia (escala 0.0 – 2.0). */
  protected readonly trendBands = [
    { y: 0, height: 25, cls: 'band-risk' },
    { y: 25, height: 10, cls: 'band-warn' },
    { y: 35, height: 25, cls: 'band-ok' },
    { y: 60, height: 40, cls: 'band-low' },
  ];

  /** Últimos 30 días de ACWR en el histórico PMC. */
  protected readonly trend = computed(() => {
    const points = this.history()
      .filter((point) => Number.isFinite(point.acwr))
      .slice(-30);
    if (points.length < 2) {
      return null;
    }

    const values = points.map((point) => point.acwr);
    const width = 600;
    const height = 100;
    const x = (index: number) => (index * width) / (values.length - 1);
    const y = (value: number) => height - (Math.min(2, Math.max(0, value)) / 2) * height;
    const last = values[values.length - 1];

    return {
      count: points.length,
      linePoints: values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' '),
      lastX: x(values.length - 1),
      lastY: y(last),
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
      delta: last - values[0],
    };
  });
}
