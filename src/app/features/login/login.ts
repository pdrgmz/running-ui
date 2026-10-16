import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ErrorResponseDto } from '../../core/models/api.models';
import { ApiConfigService } from '../../core/services/api-config.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiConfigService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly apiBaseUrl = this.api.baseUrl;

  protected mode: AuthMode = 'login';
  protected email = '';
  protected password = '';
  protected serverUrl = this.api.baseUrl();
  protected readonly busy = signal(false);
  protected readonly inlineError = signal<string | null>(null);

  protected setMode(mode: AuthMode): void {
    this.mode = mode;
    this.inlineError.set(null);
  }

  protected applyServerUrl(): void {
    this.api.setBaseUrl(this.serverUrl);
    this.serverUrl = this.api.baseUrl();
    this.toast.show(`SERVIDOR API: ${this.api.baseUrl() || '(mismo origen)'}`);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }

    const email = this.email.trim();
    const password = this.password;
    this.inlineError.set(null);

    if (!email || !password) {
      this.inlineError.set('Introduce email y contraseña.');
      return;
    }
    if (this.mode === 'register' && password.length < 8) {
      this.inlineError.set('La contraseña debe tener entre 8 y 100 caracteres.');
      return;
    }

    this.busy.set(true);
    const request$ = this.mode === 'login' ? this.auth.login(email, password) : this.auth.register(email, password);

    request$.subscribe({
      next: (res) => {
        this.busy.set(false);
        this.toast.show(`ACCESO CONCEDIDO — BIENVENIDO ${res.user.email.toUpperCase()}`);
        void this.router.navigate(['/dashboard']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const payload = (err as { error?: ErrorResponseDto })?.error;
        this.inlineError.set(payload?.message ?? 'No se pudo completar la autenticación.');
      },
    });
  }
}
