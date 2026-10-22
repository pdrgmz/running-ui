import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PwaService } from '../../core/services/pwa.service';

@Component({
  selector: 'app-pwa-install',
  templateUrl: './pwa-install.html',
  styleUrl: './pwa-install.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaInstall {
  protected readonly pwa = inject(PwaService);

  /** Si el usuario descartó el banner temporalmente en esta sesión */
  protected readonly bannerDismissed = signal<boolean>(false);

  dismissBanner(): void {
    this.bannerDismissed.set(true);
  }

  install(): void {
    this.pwa.promptInstall();
  }

  closeIosModal(): void {
    this.pwa.closeIosInstructions();
  }
}
