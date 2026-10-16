import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EddingtonStatsDto } from '../../../../core/models/api.models';

/** Número de Eddington (E) y progreso hacia el siguiente nivel. */
@Component({
  selector: 'app-eddington-card',
  templateUrl: './eddington-card.html',
  styleUrl: './eddington-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EddingtonCard {
  readonly eddington = input<EddingtonStatsDto | null>(null);

  protected readonly segments = Array.from({ length: 10 }, (_, i) => i);

  /** Progreso estimado hacia el siguiente número de Eddington. */
  protected readonly progress = computed(() => {
    const e = this.eddington();
    if (!e || e.nextTargetKm <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, 1 - e.runsNeededForNext / e.nextTargetKm));
  });

  protected readonly activeSegments = computed(() => Math.round(this.progress() * 10));

  protected readonly progressPercent = computed(() => Math.round(this.progress() * 100));
}
