import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SummaryPeriod, SummaryStatsDto } from '../../../../core/models/api.models';
import { DurationPipe, KmPipe, KmhPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

/** Filtro de periodo del resumen; `ALL` equivale al acumulado histórico. */
export type SummaryPeriodFilter = SummaryPeriod | 'ALL';

/** Resumen acumulado de estadísticas del usuario (`/stats/summary`). */
@Component({
  selector: 'app-summary-stats',
  imports: [DecimalPipe, FormsModule, DurationPipe, KmPipe, KmhPipe, PacePipe],
  templateUrl: './summary-stats.html',
  styleUrl: './summary-stats.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryStats {
  readonly summary = input<SummaryStatsDto | null>(null);
  readonly period = input<SummaryPeriodFilter>('ALL');
  readonly periodChange = output<SummaryPeriodFilter>();

  protected readonly periodOptions: Array<{ value: SummaryPeriodFilter; label: string }> = [
    { value: 'ALL', label: 'HISTÓRICO' },
    { value: 'THIS_MONTH', label: 'ESTE MES' },
    { value: 'LAST_MONTH', label: 'MES PASADO' },
    { value: 'THIS_YEAR', label: 'ESTE AÑO' },
    { value: 'LAST_YEAR', label: 'AÑO PASADO' },
  ];

  protected onPeriodChange(value: string): void {
    this.periodChange.emit(value as SummaryPeriodFilter);
  }

  /** Ritmo medio global en min/km (derivado de tiempo total y distancia total). */
  protected readonly avgPaceMinPerKm = computed(() => {
    const s = this.summary();
    if (!s || !s.totalDistanceMeters || !s.totalTimeSeconds) {
      return null;
    }
    return s.totalTimeSeconds / 60 / (s.totalDistanceMeters / 1000);
  });

  /** Velocidad media global en m/s. */
  protected readonly avgSpeedMps = computed(() => {
    const s = this.summary();
    if (!s || !s.totalTimeSeconds) {
      return null;
    }
    return s.totalDistanceMeters / s.totalTimeSeconds;
  });

  /** Maratones equivalentes sobre la distancia total (42.195 km). */
  protected readonly marathonEquivalents = computed(() => {
    const s = this.summary();
    return s ? s.totalDistanceMeters / 42195 : null;
  });
}
