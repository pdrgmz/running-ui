import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './shared/toast/toast';
import { PwaInstall } from './shared/pwa-install/pwa-install';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, PwaInstall],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
