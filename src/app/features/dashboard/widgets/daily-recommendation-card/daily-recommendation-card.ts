import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { catchError, of } from 'rxjs';
import {
  DailyRecommendationResponseDto,
  WorkoutType,
} from '../../../../core/models/api.models';
import { TrainingService } from '../../../../core/services/training.service';
import { DurationPipe, KmPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

const WORKOUT_LABELS: Record<WorkoutType, string> = {
  EASY: 'RODAJE SUAVE',
  RECOVERY: 'RECUPERACIÓN',
  LONG_RUN: 'TIRADA LARGA',
  TEMPO: 'TEMPO',
  INTERVALS: 'SERIES',
  HILLS: 'CUESTAS',
  RACE_PACE: 'RITMO DE CARRERA',
  RACE: 'CARRERA',
  CROSS_TRAINING: 'FUERZA / CRUZADO',
  REST: 'DESCANSO',
  OTHER: 'OTRO',
};

/**
 * Tarjeta interna del entrenamiento recomendado del día.
 * Solo muestra la recomendación (tipo, título, métricas, descripción,
 * serie principal, análisis y consejos) sin controles de generación,
 * histórico ni preferencias.
 */
@Component({
  selector: 'app-daily-recommendation-card',
  imports: [DatePipe, DecimalPipe, DurationPipe, KmPipe, PacePipe],
  templateUrl: './daily-recommendation-card.html',
  styleUrl: './daily-recommendation-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyRecommendationCard {
  private readonly training = inject(TrainingService);

  protected readonly recommendation = signal<DailyRecommendationResponseDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  constructor() {
    this.loadToday();
  }

  protected loadToday(): void {
    this.loading.set(true);
    this.error.set(false);
    this.training
      .today()
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (rec) => {
          this.recommendation.set(rec ?? null);
          this.loading.set(false);
          if (!rec) {
            this.error.set(true);
          }
        },
        error: () => {
          this.recommendation.set(null);
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  protected workoutLabel(type: WorkoutType): string {
    return WORKOUT_LABELS[type] ?? type;
  }
}
