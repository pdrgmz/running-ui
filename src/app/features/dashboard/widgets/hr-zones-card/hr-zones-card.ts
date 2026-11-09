import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SummaryStatsDto } from '../../../../core/models/api.models';

/** FC máxima por defecto, alineada con `app.user.max-hr` del backend. */
const FALLBACK_MAX_HR = 185;

interface ZoneRow {
  label: string;
  pct: string;
  bpm: string;
  cls: string;
}

/**
 * Zonas de frecuencia cardíaca del corredor (Z1–Z5) calculadas sobre su FC
 * máxima de referencia, siguiendo los mismos cortes que la analítica de la API:
 * 60 %, 70 %, 80 % y 90 % de la FC máxima.
 */
@Component({
  selector: 'app-hr-zones-card',
  templateUrl: './hr-zones-card.html',
  styleUrl: './hr-zones-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrZonesCard {
  readonly summary = input<SummaryStatsDto | null>(null);

  /** FC máxima observada en el historial; si no existe, la configurada por defecto. */
  protected readonly maxHr = computed(() => {
    const global = this.summary()?.maxHeartRateGlobal ?? 0;
    return global > 0 ? global : FALLBACK_MAX_HR;
  });

  protected readonly isEstimated = computed(() => (this.summary()?.maxHeartRateGlobal ?? 0) <= 0);

  protected readonly zoneRows = computed<ZoneRow[]>(() => {
    const max = this.maxHr();
    const z1 = Math.round(max * 0.6);
    const z2 = Math.round(max * 0.7);
    const z3 = Math.round(max * 0.8);
    const z4 = Math.round(max * 0.9);

    return [
      { label: 'Z1 · Recuperación', pct: '< 60%', bpm: `< ${z1} bpm`, cls: 'z1' },
      { label: 'Z2 · Resistencia', pct: '60–70%', bpm: `${z1}–${z2} bpm`, cls: 'z2' },
      { label: 'Z3 · Tempo', pct: '70–80%', bpm: `${z2}–${z3} bpm`, cls: 'z3' },
      { label: 'Z4 · Umbral', pct: '80–90%', bpm: `${z3}–${z4} bpm`, cls: 'z4' },
      { label: 'Z5 · Anaeróbico', pct: '≥ 90%', bpm: `≥ ${z4} bpm`, cls: 'z5' },
    ];
  });
}
