import { Pipe, PipeTransform } from '@angular/core';

/**
 * Segundos → duración compacta omitiendo los segmentos a cero:
 * "37m52s", "01h42m10s", "10d09h37m08s". Devuelve "—" si el valor no es válido.
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !isFinite(totalSeconds)) {
    return '—';
  }
  const seconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${String(days).padStart(2, '0')}d`);
  }
  if (h > 0) {
    parts.push(`${String(h).padStart(2, '0')}h`);
  }
  if (m > 0) {
    parts.push(`${String(m).padStart(2, '0')}m`);
  }
  if (s > 0) {
    parts.push(`${String(s).padStart(2, '0')}s`);
  }
  return parts.length > 0 ? parts.join('') : '0s';
}

/** "01:42:10" o "22:35" → segundos. Devuelve `null` si no es parseable. */
export function parseTimeToSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const numbers = parts.map((part) => Number.parseInt(part, 10));
  if (numbers.some((number) => !Number.isFinite(number) || number < 0)) {
    return null;
  }
  return parts.length === 3 ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2] : numbers[0] * 60 + numbers[1];
}

/** Segundos → "00d00h00m00s" omitiendo los segmentos a cero (ej. "37m52s"). */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(totalSeconds: number | null | undefined): string {
    return formatDuration(totalSeconds);
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
