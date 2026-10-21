import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';

/**
 * Exportación geoespacial de una actividad (`/api/v1/geo/{id}`).
 *
 * Ambos endpoints devuelven el documento como descarga; se piden como Blob
 * para conservar exactamente el contenido generado por el servidor.
 */
@Injectable({ providedIn: 'root' })
export class GeoService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  /** GET /api/v1/geo/{id}/gpx — documento GPX 1.1. */
  exportGpx(id: string): Observable<Blob> {
    return this.http.get(this.api.url(`/api/v1/geo/${encodeURIComponent(id)}/gpx`), {
      responseType: 'blob',
    });
  }

  /** GET /api/v1/geo/{id}/geojson — FeatureCollection GeoJSON. */
  exportGeoJson(id: string): Observable<Blob> {
    return this.http.get(this.api.url(`/api/v1/geo/${encodeURIComponent(id)}/geojson`), {
      responseType: 'blob',
    });
  }
}
