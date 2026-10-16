import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SessionState, UserResponseDto } from '../../../../core/models/api.models';

/** Tarjeta de identidad del corredor autenticado (perfil + sesión). */
@Component({
  selector: 'app-profile-card',
  imports: [DatePipe],
  templateUrl: './profile-card.html',
  styleUrl: './profile-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileCard {
  readonly user = input<UserResponseDto | null>(null);
  readonly session = input<SessionState | null>(null);
  readonly secondsLeft = input<number>(0);

  protected readonly initials = computed(() => {
    const email = this.user()?.email ?? '';
    return email.slice(0, 2).toUpperCase() || 'RT';
  });

  protected readonly remainingLabel = computed(() => formatRemaining(this.secondsLeft()));
}

function formatRemaining(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '0S';
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}H ${String(m).padStart(2, '0')}M`;
  }
  if (m > 0) {
    return `${m}M ${String(s).padStart(2, '0')}S`;
  }
  return `${s}S`;
}
