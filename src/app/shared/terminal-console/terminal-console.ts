import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { TelemetryEntry, TelemetryService } from '../../core/services/telemetry.service';

/**
 * Consola estilo terminal del UI Kit que muestra el tráfico HTTP y los
 * eventos de sistema de la aplicación en tiempo real.
 */
@Component({
  selector: 'app-terminal-console',
  template: `
    <div class="terminal-panel">
      <div class="terminal-header">
        <span>API TELEMETRY CONSOLE</span>
        <span>STATUS: {{ telemetry.entries().length }} EVENTOS</span>
      </div>
      <div class="terminal-lines-container" #scrollArea>
        @for (entry of telemetry.entries(); track $index) {
          <div class="terminal-line">
            <span class="t-time">[{{ entry.time }}]</span>
            <span [class]="levelClass(entry)">{{ entry.text }}</span>
          </div>
        } @empty {
          <div class="terminal-line">
            <span class="t-time">[--:--:--]</span>
            <span>Esperando tráfico HTTP…</span>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerminalConsole {
  protected readonly telemetry = inject(TelemetryService);
  private readonly scrollArea = viewChild<ElementRef<HTMLDivElement>>('scrollArea');

  constructor() {
    effect(() => {
      // Autoscroll al final cada vez que entra un evento nuevo.
      const entries = this.telemetry.entries();
      const el = this.scrollArea()?.nativeElement;
      if (el && entries.length > 0) {
        queueMicrotask(() => el.scrollTo({ top: el.scrollHeight }));
      }
    });
  }

  protected levelClass(entry: TelemetryEntry): string {
    switch (entry.level) {
      case 'ok':
        return 't-ok';
      case 'err':
        return 't-err';
      case 'req':
        return 't-req';
      default:
        return '';
    }
  }
}
