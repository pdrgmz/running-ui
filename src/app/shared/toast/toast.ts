import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

/** Notificación flotante basada en el componente `.toast-notice` del UI Kit. */
@Component({
  selector: 'app-toast',
  template: `
    <div
      class="toast-notice"
      [class.show]="toast.visible()"
      [class.toast-notice--error]="toast.kind() === 'error'"
      role="status"
      aria-live="polite"
    >
      {{ toast.message() }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
