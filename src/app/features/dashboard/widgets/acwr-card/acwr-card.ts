import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ACWR_ZONE_LABELS, AcwrStatusDto } from '../../../../core/models/api.models';

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

  protected readonly zoneLabel = computed(() => {
    const zone = this.acwr()?.zone ?? '';
    return ACWR_ZONE_LABELS[zone.toUpperCase()] ?? zone.replaceAll('_', ' ') ?? '—';
  });

  protected readonly zoneClass = computed(() => {
    switch ((this.acwr()?.zone ?? '').toUpperCase()) {
      case 'SWEET_SPOT':
        return 'zone-ok';
      case 'CAUTION':
        return 'zone-warn';
      case 'DANGER':
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
}
