import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ACWR_ZONE_LABELS, AcwrStatusDto, PmcPointDto } from '../../../../core/models/api.models';

type Tone = 'risk' | 'warn' | 'ok' | 'neutral' | 'low';

interface TsbBand {
  id: string;
  range: string;
  tone: Tone;
  /** Límite superior de la banda (la primera banda cuyo tope supere el TSB actual gana). */
  max: number;
  text: string;
}

interface Verdict {
  label: string;
  tone: Tone;
}

/**
 * Bandas de forma (TSB) con su lectura, de más cargado a más descansado.
 * Referencias clásicas del modelo PMC (Banister / TrainingPeaks).
 */
const TSB_BANDS: TsbBand[] = [
  {
    id: 'SOBRECARGA',
    range: 'TSB < −30',
    tone: 'risk',
    max: -30,
    text: 'Forma muy mermada: reduce la carga unos días y prioriza la recuperación.',
  },
  {
    id: 'CONSTRUCCIÓN',
    range: '−30 … −10',
    tone: 'warn',
    max: -10,
    text: 'Estás asimilando entrenamiento: es el rango normal mientras construyes fondo.',
  },
  {
    id: 'TRANSICIÓN',
    range: '−10 … +5',
    tone: 'neutral',
    max: 5,
    text: 'Carga y frescura equilibradas: buen punto de transición entre bloques.',
  },
  {
    id: 'PICO DE FORMA',
    range: '+5 … +25',
    tone: 'ok',
    max: 25,
    text: 'Ventana ideal para competir, hacer un test o buscar marca.',
  },
  {
    id: 'DESENTRENAMIENTO',
    range: 'TSB > +25',
    tone: 'low',
    max: Number.POSITIVE_INFINITY,
    text: 'Demasiado descanso acumulado: la aptitud empezará a caer poco a poco.',
  },
];

const ZONE_FALLBACKS: Record<string, string> = {
  UNDERTRAINING: 'Relación carga aguda:crónica baja; podrías asumir algo más de volumen.',
  SWEET_SPOT: 'Relación carga aguda:crónica en zona óptima: progresión segura.',
  CAUTION: 'Relación carga aguda:crónica al alza; evita subidas bruscas de volumen.',
  DANGER: 'Relación carga aguda:crónica en riesgo: el salto de carga es demasiado alto.',
  OVERLOAD: 'Sobrecarga aguda: baja el ritmo hasta que la fatiga ceda.',
};

const SIGNED = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'always',
});

/**
 * Lectura dinámica del PMC: interpreta la data de /ANALYTICS/PMC y
 * /ANALYTICS/ACWR con las referencias clásicas del modelo de carga.
 */
@Component({
  selector: 'app-pmc-reading',
  imports: [DecimalPipe],
  templateUrl: './pmc-reading.html',
  styleUrl: './pmc-reading.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PmcReading {
  readonly pmc = input<PmcPointDto[]>([]);
  readonly acwr = input<AcwrStatusDto | null>(null);

  protected readonly hasData = computed(() => this.pmc().length > 0);

  protected readonly latest = computed(() => {
    const list = this.pmc();
    return list.length > 0 ? list[list.length - 1] : null;
  });

  /** Punto de referencia para las tendencias: 7 días atrás (o el primero disponible). */
  private readonly reference = computed(() => {
    const list = this.pmc();
    return list.length > 1 ? list[Math.max(0, list.length - 8)] : null;
  });

  protected readonly ctlDelta = computed(() => this.delta7('ctl'));
  protected readonly atlDelta = computed(() => this.delta7('atl'));

  protected readonly weeklyTrimp = computed(() =>
    this.pmc()
      .slice(-7)
      .reduce((sum, point) => sum + (point.dailyTrimp ?? 0), 0),
  );

  protected readonly tsbBand = computed<TsbBand>(() => {
    const tsb = this.latest()?.tsb ?? 0;
    return TSB_BANDS.find((band) => tsb < band.max) ?? TSB_BANDS[TSB_BANDS.length - 1];
  });

  protected readonly bands = computed(() =>
    TSB_BANDS.map((band) => ({ ...band, active: band.id === this.tsbBand().id })),
  );

  protected readonly ctlVerdict = computed<Verdict>(() => {
    const delta = this.ctlDelta();
    if (delta === null) {
      return { label: 'SIN DATOS', tone: 'low' };
    }
    if (delta > 2) {
      return { label: 'CONSTRUYENDO FONDO', tone: 'ok' };
    }
    if (delta < -2) {
      return { label: 'PERDIENDO FONDO', tone: 'low' };
    }
    return { label: 'ESTABLE', tone: 'neutral' };
  });

  protected readonly atlVerdict = computed<Verdict>(() => {
    const delta = this.atlDelta();
    if (delta === null) {
      return { label: 'SIN DATOS', tone: 'low' };
    }
    if (delta > 3) {
      return { label: 'FATIGA AL ALZA', tone: 'warn' };
    }
    if (delta < -3) {
      return { label: 'RECUPERANDO', tone: 'ok' };
    }
    return { label: 'ESTABLE', tone: 'neutral' };
  });

  protected readonly acwrZone = computed<Verdict>(() => {
    const zone = (this.acwr()?.zone ?? '').toUpperCase();
    return { label: ACWR_ZONE_LABELS[zone] ?? 'SIN DATOS', tone: zoneTone(zone) };
  });

  protected signedDelta(value: number | null): string {
    return value === null ? '—' : SIGNED.format(value);
  }

  /** Frases de lectura construidas a partir de la data actual del API. */
  protected readonly insights = computed<string[]>(() => {
    if (!this.latest()) {
      return [];
    }

    const lines: string[] = [this.tsbBand().text];

    const ctl = this.ctlDelta();
    const atl = this.atlDelta();
    if (ctl !== null && atl !== null) {
      if (ctl >= 1 && atl <= -1) {
        lines.push('Combinación ideal: el fondo sube mientras la fatiga baja.');
      } else if (ctl >= 1 && atl >= 1) {
        lines.push('Fondo y fatiga al alza: progresión en marcha, controla el tamaño de los saltos de carga.');
      } else if (ctl <= -1 && atl <= -1) {
        lines.push('Semana de descarga: la fatiga cae más rápido que el fondo; fase de asimilación.');
      } else if (ctl <= -1 && atl >= 1) {
        lines.push('Atención: la fatiga sube con el fondo cayendo; revisa el plan de entrenamiento.');
      } else {
        lines.push('Carga estable en los últimos 7 días.');
      }
    }

    const acwr = this.acwr();
    if (acwr) {
      const zone = (acwr.zone ?? '').toUpperCase();
      lines.push(acwr.recommendation || ZONE_FALLBACKS[zone] || `Ratio aguda:crónica ${acwr.acwr?.toFixed(2) ?? '—'}.`);
    }

    return lines;
  });

  private delta7(field: 'ctl' | 'atl' | 'tsb'): number | null {
    const last = this.latest();
    const ref = this.reference();
    if (!last || !ref) {
      return null;
    }
    return (last[field] ?? 0) - (ref[field] ?? 0);
  }
}

function zoneTone(zone: string): Tone {
  switch (zone) {
    case 'SWEET_SPOT':
      return 'ok';
    case 'CAUTION':
      return 'warn';
    case 'DANGER':
    case 'OVERLOAD':
      return 'risk';
    default:
      return 'low';
  }
}
