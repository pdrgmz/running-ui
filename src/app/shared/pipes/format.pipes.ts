import { Pipe, PipeTransform } from '@angular/core';

/** Segundos → "H:MM:SS" (o "MM:SS" si dura menos de una hora). */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(totalSeconds: number | null | undefined): string {
    if (totalSeconds === null || totalSeconds === undefined || !isFinite(totalSeconds)) {
      return '—';
    }
    const seconds = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
}

/** Metros → "12.34 KM". */
@Pipe({ name: 'km' })
export class KmPipe implements PipeTransform {
  transform(meters: number | null | undefined, decimals = 2): string {
    if (meters === null || meters === undefined || !isFinite(meters)) {
      return '—';
    }
    return `${(meters / 1000).toFixed(decimals)} KM`;
  }
}

/**
 * Ritmo en min/km con decimal (ej. 4.52) → "4:31 /KM".
 * La API documenta que la parte decimal expresa los segundos (4.52 = 4:31).
 */
@Pipe({ name: 'pace' })
export class PacePipe implements PipeTransform {
  transform(minPerKm: number | string | null | undefined): string {
    if (minPerKm === null || minPerKm === undefined) {
      return '—';
    }
    const value = typeof minPerKm === 'string' ? Number.parseFloat(minPerKm) : minPerKm;
    if (!isFinite(value) || value <= 0) {
      return '—';
    }
    let totalSeconds = Math.round(value * 60);
    const m = Math.floor(totalSeconds / 60);
    let s = totalSeconds - m * 60;
    let minutes = m;
    if (s === 60) {
      minutes += 1;
      s = 0;
    }
    return `${minutes}:${String(s).padStart(2, '0')} /KM`;
  }
}

/** Velocidad en m/s → "12.3 KM/H". */
@Pipe({ name: 'kmh' })
export class KmhPipe implements PipeTransform {
  transform(metersPerSecond: number | null | undefined, decimals = 1): string {
    if (metersPerSecond === null || metersPerSecond === undefined || !isFinite(metersPerSecond)) {
      return '—';
    }
    return `${(metersPerSecond * 3.6).toFixed(decimals)} KM/H`;
  }
}
