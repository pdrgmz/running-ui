import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PlanGenerationJobResponseDto,
  PlanGenerationStatus,
} from '../../../../core/models/api.models';
import { ToastService } from '../../../../core/services/toast.service';
import { TrainingService } from '../../../../core/services/training.service';

const CLEANUP_STATUSES: PlanGenerationStatus[] = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
];

/**
 * Gestión de jobs de generación semanal con IA.
 * Vive en la pestaña Cuenta & API, junto a la consola de telemetría.
 */
@Component({
  selector: 'app-plan-generation-panel',
  imports: [DatePipe, FormsModule],
  templateUrl: './plan-generation-panel.html',
  styleUrl: './plan-generation-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanGenerationPanel implements OnInit {
  private readonly training = inject(TrainingService);
  private readonly toast = inject(ToastService);

  protected readonly cleanupStatuses = CLEANUP_STATUSES;

  /* Jobs */
  protected readonly jobs = signal<PlanGenerationJobResponseDto[] | null>(null);
  protected readonly jobsLoading = signal(false);
  protected readonly jobsError = signal(false);
  protected cleanupStatus: PlanGenerationStatus = 'FAILED';
  protected readonly cleaningJobs = signal(false);

  /* Confirmaciones de borrado */
  protected readonly confirmingJobId = signal<string | null>(null);
  protected readonly deletingJobId = signal<string | null>(null);

  constructor() {}

  ngOnInit(): void {
    this.loadJobs();
  }

  /* ------------------------------------------------------------------ */
  /* Jobs                                                                */
  /* ------------------------------------------------------------------ */

  /** GET /api/v1/training/generation-jobs */
  protected loadJobs(): void {
    this.jobsLoading.set(true);
    this.jobsError.set(false);
    this.training.jobs().subscribe({
      next: (list) => {
        this.jobsLoading.set(false);
        this.jobs.set(list);
      },
      error: () => {
        this.jobsLoading.set(false);
        this.jobsError.set(true);
      },
    });
  }

  protected requestDeleteJob(requestId: string): void {
    this.confirmingJobId.set(requestId);
  }

  protected cancelDeleteJob(): void {
    this.confirmingJobId.set(null);
  }

  /** DELETE /api/v1/training/generation-jobs/{requestId} */
  protected deleteJob(job: PlanGenerationJobResponseDto): void {
    if (this.deletingJobId()) {
      return;
    }
    this.deletingJobId.set(job.requestId);
    this.training.deleteJob(job.requestId, job.status === 'RUNNING').subscribe({
      next: () => {
        this.deletingJobId.set(null);
        this.confirmingJobId.set(null);
        this.toast.show('JOB DE GENERACIÓN ELIMINADO');
        this.loadJobs();
      },
      error: () => {
        this.deletingJobId.set(null);
        this.confirmingJobId.set(null);
      },
    });
  }

  /** DELETE /api/v1/training/generation-jobs?status=... */
  protected cleanupJobs(): void {
    if (this.cleaningJobs()) {
      return;
    }
    this.cleaningJobs.set(true);
    this.training.deleteJobs(this.cleanupStatus, this.cleanupStatus === 'RUNNING').subscribe({
      next: (res) => {
        this.cleaningJobs.set(false);
        this.toast.show(`${res.deleted} JOB(S) ${this.cleanupStatus} ELIMINADOS`);
        this.loadJobs();
      },
      error: () => this.cleaningJobs.set(false),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Etiquetas                                                           */
  /* ------------------------------------------------------------------ */

  protected jobStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'EN COLA',
      RUNNING: 'GENERANDO',
      COMPLETED: 'COMPLETADO',
      FAILED: 'FALLIDO',
      TIMEOUT: 'TIEMPO AGOTADO',
    };
    return labels[status] ?? status;
  }
}
