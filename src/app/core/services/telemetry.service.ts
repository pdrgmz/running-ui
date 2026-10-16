import { Injectable, signal } from '@angular/core';

export type TelemetryLevel = 'req' | 'ok' | 'err' | 'sys';

export interface TelemetryEntry {
  time: string;
  level: TelemetryLevel;
  text: string;
}

const MAX_ENTRIES = 120;

/**
 * Registro de telemetría de la aplicación (tráfico HTTP y eventos de sistema)
 * que se muestra en el panel terminal estilo consola del UI Kit.
 */
@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly entriesSignal = signal<TelemetryEntry[]>([]);

  readonly entries = this.entriesSignal.asReadonly();

  log(level: TelemetryLevel, text: string): void {
    const entry: TelemetryEntry = { time: timestamp(), level, text };
    this.entriesSignal.update((list) => {
      const next = [...list, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }

  clear(): void {
    this.entriesSignal.set([]);
  }
}

function timestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
