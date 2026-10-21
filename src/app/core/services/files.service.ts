import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BulkUploadStatusDto,
  FileUploadResponseDto,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';

/**
 * Importación y exportación de archivos (`/api/v1/files/*`).
 *
 * La carga masiva es asíncrona: devuelve un `uploadId` que se puede seguir
 * mediante polling (`GET /upload-status/{id}`) o por SSE
 * (`GET /upload-status/{id}/stream`).
 */
@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly auth = inject(AuthService);

  /** POST /api/v1/files/upload — importa un TCX, GPX o FIT individual. */
  upload(file: File): Observable<FileUploadResponseDto> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<FileUploadResponseDto>(this.api.url('/api/v1/files/upload'), body);
  }

  /** POST /api/v1/files/upload-bulk — importa un ZIP en segundo plano. */
  uploadBulk(zipFile: File): Observable<BulkUploadStatusDto> {
    const body = new FormData();
    body.append('zipFile', zipFile);
    return this.http.post<BulkUploadStatusDto>(this.api.url('/api/v1/files/upload-bulk'), body);
  }

  /** GET /api/v1/files/upload-status/{uploadId} — estado puntual de la carga. */
  uploadStatus(uploadId: string): Observable<BulkUploadStatusDto> {
    return this.http.get<BulkUploadStatusDto>(
      this.api.url(`/api/v1/files/upload-status/${encodeURIComponent(uploadId)}`),
    );
  }

  /**
   * GET /api/v1/files/upload-status/{uploadId}/stream — progreso por SSE.
   *
   * Se usa `fetch` en lugar de `EventSource` porque la API exige el JWT en la
   * cabecera `Authorization`, que `EventSource` no permite configurar.
   */
  streamUploadStatus(uploadId: string): Observable<BulkUploadStatusDto> {
    return new Observable<BulkUploadStatusDto>((subscriber) => {
      const controller = new AbortController();
      const token = this.auth.token();
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      void fetch(
        this.api.url(`/api/v1/files/upload-status/${encodeURIComponent(uploadId)}/stream`),
        { headers, signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`SSE ${response.status}`);
          }
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('El navegador no soporta streaming');
          }

          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
            let boundary = buffer.indexOf('\n\n');
            while (boundary >= 0) {
              const block = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const payload = parseSseData(block);
              if (payload) {
                try {
                  subscriber.next(JSON.parse(payload) as BulkUploadStatusDto);
                } catch {
                  /* evento no JSON: se ignora */
                }
              }
              boundary = buffer.indexOf('\n\n');
            }
          }
          subscriber.complete();
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            subscriber.error(error);
          }
        });

      return () => controller.abort();
    });
  }

  /** GET /api/v1/files/export-bulk — ZIP con las actividades en JSON. */
  exportJsonZip(ids: string[] = []): Observable<Blob> {
    return this.http.get(this.api.url('/api/v1/files/export-bulk'), {
      params: idsParams(ids),
      responseType: 'blob',
    });
  }

  /** GET /api/v1/files/export-backup-zip — ZIP con los archivos originales. */
  exportBackupZip(ids: string[] = []): Observable<Blob> {
    return this.http.get(this.api.url('/api/v1/files/export-backup-zip'), {
      params: idsParams(ids),
      responseType: 'blob',
    });
  }
}

function idsParams(ids: string[]): HttpParams {
  let params = new HttpParams();
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed) {
      params = params.append('ids', trimmed);
    }
  }
  return params;
}

/** Extrae las líneas `data:` de un bloque SSE y las une. */
function parseSseData(block: string): string | null {
  const lines = block.split(/\r?\n/);
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();
  return data && data !== '[DONE]' ? data : null;
}
