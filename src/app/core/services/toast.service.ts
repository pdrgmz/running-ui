import { Injectable, signal } from '@angular/core';

export type ToastKind = 'ok' | 'error';

/**
 * Notificaciones flotantes con el componente `.toast-notice` del UI Kit.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messageSignal = signal('');
  private readonly visibleSignal = signal(false);
  private readonly kindSignal = signal<ToastKind>('ok');

  readonly message = this.messageSignal.asReadonly();
  readonly visible = this.visibleSignal.asReadonly();
  readonly kind = this.kindSignal.asReadonly();

  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, kind: ToastKind = 'ok'): void {
    this.messageSignal.set(message);
    this.kindSignal.set(kind);
    this.visibleSignal.set(true);

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }
    this.hideTimer = setTimeout(() => this.hide(), 3200);
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  private hide(): void {
    this.visibleSignal.set(false);
    this.hideTimer = null;
  }
}
