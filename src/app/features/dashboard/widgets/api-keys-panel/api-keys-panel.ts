import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiKeyCreatedResponseDto, ApiKeyResponseDto } from '../../../../core/models/api.models';
import { ApiKeysService } from '../../../../core/services/api-keys.service';
import { ToastService } from '../../../../core/services/toast.service';

/** Vigencia máxima aceptada por la API (10 años). */
const MAX_EXPIRY_DAYS = 3650;

interface ApiKeyRow {
  key: ApiKeyResponseDto;
  expired: boolean;
}

/**
 * Generación y gestión de claves de API (`/api/v1/auth/api-keys`):
 * credenciales de máquina con prefijo `rk_` que se envían en la cabecera
 * `X-Api-Key` como alternativa al JWT (n8n, scripts, cron).
 *
 * El valor completo de una clave solo viaja en la respuesta de creación,
 * por lo que se muestra una única vez y se puede copiar al portapapeles.
 */
@Component({
  selector: 'app-api-keys-panel',
  imports: [DatePipe, FormsModule],
  templateUrl: './api-keys-panel.html',
  styleUrl: './api-keys-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeysPanel implements OnInit {
  private readonly apiKeysService = inject(ApiKeysService);
  private readonly toast = inject(ToastService);

  /** `null` mientras no se ha completado la primera carga. */
  protected readonly keys = signal<ApiKeyResponseDto[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly creating = signal(false);
  protected readonly confirmingId = signal<number | null>(null);
  protected readonly revokingId = signal<number | null>(null);
  protected readonly createdKey = signal<ApiKeyCreatedResponseDto | null>(null);

  /* Campos del formulario de generación (ngModel). */
  protected newName = '';
  protected newExpiresInDays: number | null = null;
  protected readonly maxExpiryDays = MAX_EXPIRY_DAYS;

  protected readonly rows = computed<ApiKeyRow[]>(() =>
    (this.keys() ?? []).map((key) => ({ key, expired: isExpired(key.expiresAt) })),
  );

  ngOnInit(): void {
    this.load();
  }

  /** GET /api/v1/auth/api-keys — recarga el listado de claves. */
  protected load(): void {
    this.loadError.set(false);
    this.apiKeysService.list().subscribe({
      next: (list) => this.keys.set(list),
      error: () => {
        this.keys.set(null);
        this.loadError.set(true);
      },
    });
  }

  /** POST /api/v1/auth/api-keys — valida el formulario y genera la clave. */
  protected createKey(): void {
    if (this.creating()) {
      return;
    }
    const name = this.newName.trim();
    if (!name) {
      this.toast.error('INDICA UN NOMBRE PARA IDENTIFICAR LA CLAVE');
      return;
    }
    const days = this.newExpiresInDays;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS)) {
      this.toast.error(`VIGENCIA INVÁLIDA: ENTRE 1 Y ${MAX_EXPIRY_DAYS} DÍAS (O VACÍO PARA SIN CADUCIDAD)`);
      return;
    }

    this.creating.set(true);
    this.apiKeysService.create({ name, expiresInDays: days ?? undefined }).subscribe({
      next: (created) => {
        this.creating.set(false);
        this.createdKey.set(created);
        this.keys.update((list) => [created, ...(list ?? [])]);
        this.newName = '';
        this.newExpiresInDays = null;
        this.toast.show('CLAVE CREADA — CÓPIALA AHORA: NO SE VOLVERÁ A MOSTRAR');
      },
      error: () => this.creating.set(false),
    });
  }

  /** Copia el valor de la clave recién creada al portapapeles. */
  protected copyKey(value: string): void {
    this.writeToClipboard(value).then(
      () => this.toast.show('CLAVE COPIADA AL PORTAPAPELES'),
      () => this.toast.error('NO SE PUDO COPIAR — SELECCIONA Y COPIA MANUALMENTE'),
    );
  }

  /** Oculta el aviso con la clave recién creada (ya no se puede recuperar). */
  protected dismissCreated(): void {
    this.createdKey.set(null);
  }

  /** Primer paso de la revocación: pide confirmación en la propia fila. */
  protected requestRevoke(id: number): void {
    this.confirmingId.set(id);
  }

  protected cancelRevoke(): void {
    this.confirmingId.set(null);
  }

  /** DELETE /api/v1/auth/api-keys/{id} — segundo paso: revoca la clave. */
  protected revoke(row: ApiKeyRow): void {
    if (this.revokingId() !== null) {
      return;
    }
    this.revokingId.set(row.key.id);
    this.apiKeysService.revoke(row.key.id).subscribe({
      next: () => {
        this.revokingId.set(null);
        this.confirmingId.set(null);
        this.keys.update((list) => (list ?? []).filter((key) => key.id !== row.key.id));
        if (this.createdKey()?.id === row.key.id) {
          this.createdKey.set(null);
        }
        this.toast.show(`CLAVE «${row.key.name.toUpperCase()}» REVOCADA`);
      },
      error: () => {
        this.revokingId.set(null);
        this.confirmingId.set(null);
      },
    });
  }

  /**
   * Copia con doble estrategia: API asíncrona del portapapeles y, si el
   * navegador la rechaza (permisos, contexto no seguro, ventana sin foco),
   * fallback clásico con un textarea temporal.
   */
  private writeToClipboard(value: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(value).catch(() => this.legacyCopy(value));
    }
    return this.legacyCopy(value);
  }

  private legacyCopy(value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      ok ? resolve() : reject(new Error('Portapapeles no soportado'));
    });
  }
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const time = new Date(expiresAt).getTime();
  return Number.isFinite(time) && time <= Date.now();
}
