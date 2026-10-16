import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SummaryStatsDto } from '../../../../core/models/api.models';
import { DurationPipe, KmPipe, KmhPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

/** Resumen acumulado de estadísticas del usuario (`/stats/summary`). */
@Component({
  selector: 'app-summary-stats',
  imports: [DecimalPipe, DurationPipe, KmPipe, KmhPipe, PacePipe],
  templateUrl: './summary-stats.html',
  styleUrl: './summary-stats.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryStats {
  readonly summary = input<SummaryStatsDto | null>(null);

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
