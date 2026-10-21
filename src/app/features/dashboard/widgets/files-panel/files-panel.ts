import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import {
  BulkUploadStatusDto,
  FileUploadResponseDto,
} from '../../../../core/models/api.models';
import { FilesService } from '../../../../core/services/files.service';
import { ToastService } from '../../../../core/services/toast.service';
import { downloadBlob } from '../../../../core/utils/download';

type StreamMode = 'idle' | 'sse' | 'polling' | 'done' | 'error';

/**
 * Importación y exportación de archivos (`/api/v1/files/*`):
 * TCX/GPX/FIT individual, ZIP asíncrono con progreso y exportaciones ZIP.
 */
@Component({
  selector: 'app-files-panel',
  imports: [DecimalPipe, FormsModule],
  templateUrl: './files-panel.html',
  styleUrl: './files-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesPanel {
  private readonly files = inject(FilesService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Notifica al dashboard que el historial ha cambiado. */
  readonly changed = output<void>();

  protected readonly singleFile = signal<File | null>(null);
  protected readonly bulkFile = signal<File | null>(null);
  protected readonly uploadingSingle = signal(false);
  protected readonly uploadingBulk = signal(false);
  protected readonly singleResult = signal<FileUploadResponseDto | null>(null);
  protected readonly bulkStatus = signal<BulkUploadStatusDto | null>(null);
  protected readonly bulkError = signal<string | null>(null);
  protected readonly streamMode = signal<StreamMode>('idle');
  protected readonly exporting = signal<'json' | 'backup' | null>(null);

  protected exportIds = '';

  private readonly singleInput = viewChild<ElementRef<HTMLInputElement>>('singleInput');
  private readonly bulkInput = viewChild<ElementRef<HTMLInputElement>>('bulkInput');
  private watchSub: Subscription | null = null;
  private pollSub: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopWatching());
  }

  protected readonly progress = computed(() => {
    const value = this.bulkStatus()?.progress ?? 0;
    return Math.max(0, Math.min(100, value));
  });

  protected readonly bulkStateLabel = computed(() => {
    const status = this.bulkStatus()?.status ?? 'PENDING';
    const labels: Record<string, string> = {
      PENDING: 'EN COLA',
      PROCESSING: 'PROCESANDO',
      COMPLETED: 'COMPLETADA',
      FAILED: 'FALLIDA',
    };
    return labels[status] ?? status;
  });

  protected readonly streamLabel = computed(() => {
    switch (this.streamMode()) {
      case 'sse':
        return 'SSE EN VIVO';
      case 'polling':
        return 'POLLING (SSE NO DISPONIBLE)';
      case 'done':
        return 'FINALIZADO';
      case 'error':
        return 'ERROR';
      default:
        return 'SIN CARGA ACTIVA';
    }
  });

  protected readonly bulkErrors = computed(() => this.bulkStatus()?.errors ?? []);

  protected onSingleSelected(event: Event): void {
    this.singleFile.set(fileFromEvent(event));
  }

  protected onBulkSelected(event: Event): void {
    this.bulkFile.set(fileFromEvent(event));
  }

  /** POST /api/v1/files/upload */
  protected uploadSingle(): void {
    const file = this.singleFile();
    if (!file || this.uploadingSingle()) {
      return;
    }
    this.uploadingSingle.set(true);
    this.singleResult.set(null);
    this.files.upload(file).subscribe({
      next: (result) => {
        this.uploadingSingle.set(false);
        this.singleResult.set(result);
        this.singleFile.set(null);
        if (this.singleInput()) {
          this.singleInput()!.nativeElement.value = '';
        }
        this.toast.show(result.message || 'ACTIVIDAD IMPORTADA CORRECTAMENTE');
        this.changed.emit();
      },
      error: () => this.uploadingSingle.set(false),
    });
  }

  /** POST /api/v1/files/upload-bulk + seguimiento del uploadId. */
  protected uploadBulk(): void {
    const file = this.bulkFile();
    if (!file || this.uploadingBulk()) {
      return;
    }
    this.uploadingBulk.set(true);
    this.bulkStatus.set(null);
    this.bulkError.set(null);
    this.streamMode.set('idle');
    this.files.uploadBulk(file).subscribe({
      next: (status) => {
        this.uploadingBulk.set(false);
        this.bulkStatus.set(status);
        this.bulkFile.set(null);
        if (this.bulkInput()) {
          this.bulkInput()!.nativeElement.value = '';
        }
        this.watchUpload(status.uploadId);
      },
      error: (error: unknown) => {
        this.uploadingBulk.set(false);
        this.bulkError.set(errorMessage(error));
      },
    });
  }

  /** GET /api/v1/files/export-bulk */
  protected exportJson(): void {
    this.export('json');
  }

  /** GET /api/v1/files/export-backup-zip */
  protected exportBackup(): void {
    this.export('backup');
  }

  protected retryBulkStatus(): void {
    const status = this.bulkStatus();
    if (status) {
      this.watchUpload(status.uploadId);
    }
  }

  private export(kind: 'json' | 'backup'): void {
    if (this.exporting()) {
      return;
    }
    const ids = this.exportIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    this.exporting.set(kind);
    const request =
      kind === 'json' ? this.files.exportJsonZip(ids) : this.files.exportBackupZip(ids);
    request.subscribe({
      next: (blob) => {
        this.exporting.set(null);
        const suffix = kind === 'json' ? 'datos' : 'respaldos';
        downloadBlob(blob, `running-${suffix}-${new Date().toISOString().slice(0, 10)}.zip`);
        this.toast.show(
          ids.length > 0
            ? `EXPORTADAS ${ids.length} ACTIVIDADES (${suffix.toUpperCase()})`
            : `EXPORTACIÓN COMPLETA (${suffix.toUpperCase()})`,
        );
      },
      error: () => this.exporting.set(null),
    });
  }

  /** Prioriza SSE y cae a polling si el navegador o el proxy no lo permiten. */
  private watchUpload(uploadId: string): void {
    this.stopWatching();
    this.streamMode.set('sse');
    this.watchSub = this.files
      .streamUploadStatus(uploadId)
      .subscribe({
        next: (status) => this.applyStatus(status),
        error: () => this.startPolling(uploadId),
        complete: () => {
          if (!isTerminal(this.bulkStatus()?.status)) {
            this.startPolling(uploadId);
          }
        },
      });
  }

  private startPolling(uploadId: string): void {
    this.watchSub?.unsubscribe();
    this.watchSub = null;
    this.pollSub?.unsubscribe();
    if (isTerminal(this.bulkStatus()?.status)) {
      return;
    }
    this.streamMode.set('polling');
    this.pollSub = timer(0, 1500)
      .pipe(
        switchMap(() => this.files.uploadStatus(uploadId)),
        takeWhile((status) => !isTerminal(status.status), true),
      )
      .subscribe({
        next: (status) => this.applyStatus(status),
        error: (error: unknown) => {
          this.stopWatching();
          this.streamMode.set('error');
          this.bulkError.set(errorMessage(error));
        },
      });
  }

  private applyStatus(status: BulkUploadStatusDto): void {
    this.bulkStatus.set(status);
    if (!isTerminal(status.status)) {
      return;
    }
    this.stopWatching();
    if (status.status === 'COMPLETED') {
      this.streamMode.set('done');
      this.toast.show(
        `CARGA COMPLETADA: ${status.successCount}/${status.totalFiles} ARCHIVOS IMPORTADOS`,
      );
      this.changed.emit();
    } else {
      this.streamMode.set('error');
      this.bulkError.set(status.errors[0]?.errorMessage ?? 'La carga masiva ha fallado');
      this.toast.error('LA CARGA MASIVA HA FALLADO');
    }
  }

  private stopWatching(): void {
    this.watchSub?.unsubscribe();
    this.watchSub = null;
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }
}

function isTerminal(status: string | undefined): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

function fileFromEvent(event: Event): File | null {
  const input = event.target as HTMLInputElement;
  return input.files?.[0] ?? null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'No se pudo completar la operación';
}
