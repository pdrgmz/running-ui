import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'rt.apiBaseUrl';

/**
 * Configuración del servidor de la API.
 *
 * Por defecto se usa una URL relativa (''), lo que permite:
 *  - Desarrollo: `ng serve` aplica `proxy.conf.json` hacia https://running-api.pdrgmz.uk
 *  - Producción: servir la app detrás del mismo dominio/reverse-proxy que la API
 *
 * El usuario puede sobreescribir el servidor desde la pantalla de acceso
 * (se persiste en localStorage).
 */
@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private readonly baseUrlSignal = signal<string>(readStoredBaseUrl());

  readonly baseUrl = this.baseUrlSignal.asReadonly();

  setBaseUrl(url: string): void {
    const normalized = normalizeBaseUrl(url);
    this.baseUrlSignal.set(normalized);
    try {
      if (normalized) {
        localStorage.setItem(STORAGE_KEY, normalized);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* almacenamiento no disponible */
    }
  }

  /** Construye la URL absoluta de un endpoint de la API. */
  url(path: string): string {
    const base = this.baseUrlSignal();
    return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function readStoredBaseUrl(): string {
  try {
    return normalizeBaseUrl(localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return '';
  }
}
