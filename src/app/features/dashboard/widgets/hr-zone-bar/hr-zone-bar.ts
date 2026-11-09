import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HrZonesResponseDto } from '../../../../core/models/api.models';

const ZONE_DEFS: { key: keyof HrZonesResponseDto['zones']; label: string; cls: string }[] = [
  { key: 'Z1_Recovery', label: 'Z1 · Recuperación', cls: 'z1' },
  { key: 'Z2_Endurance', label: 'Z2 · Resistencia', cls: 'z2' },
  { key: 'Z3_Tempo', label: 'Z3 · Tempo', cls: 'z3' },
  { key: 'Z4_Threshold', label: 'Z4 · Umbral', cls: 'z4' },
  { key: 'Z5_Anaerobic', label: 'Z5 · Anaeróbico', cls: 'z5' },
];

/** Barra compacta de tiempo en zonas de FC, solo con colores. */
@Component({
  selector: 'app-hr-zone-bar',
  templateUrl: './hr-zone-bar.html',
  styleUrl: './hr-zone-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrZoneBar {
  readonly zones = input<HrZonesResponseDto | null>(null);

  protected readonly segments = computed(() => {
    const zones = this.zones()?.zones;
    if (!zones) {
      return [];
    }
    return ZONE_DEFS.map((def) => ({
      cls: def.cls,
      label: def.label,
      percentage: zones[def.key].percentage,
    })).filter((segment) => segment.percentage > 0);
  });

  protected readonly ariaLabel = computed(() => {
    const segments = this.segments();
    if (segments.length === 0) {
      return 'Sin datos de zonas de frecuencia cardíaca';
    }
    return `Tiempo en zonas de FC: ${segments
      .map((segment) => `${segment.label} ${segment.percentage}%`)
      .join(', ')}`;
  });
}
