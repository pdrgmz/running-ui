import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import {
  McpInitializeResult,
  McpToolCallResult,
  McpToolListResult,
} from '../models/api.models';
import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';

interface McpRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

interface McpRpcResponse<T> {
  jsonrpc?: string;
  id?: number | string | null;
  result?: T;
  error?: McpRpcErrorPayload;
}

/** Error JSON-RPC devuelto por el servidor MCP (HTTP 200). */
export class McpRpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = 'McpRpcError';
  }
}

const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

/**
 * Cliente MCP sobre JSON-RPC 2.0 (`/mcp`).
 *
 * Tras `initialize` la API devuelve la cabecera `Mcp-Session-Id`; el servicio
 * la conserva y la envía en las peticiones siguientes. `stream()` abre el
 * transporte SSE con `fetch` para poder autenticarlo con el JWT.
 */
@Injectable({ providedIn: 'root' })
export class McpService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly auth = inject(AuthService);

  private readonly sessionIdSignal = signal<string | null>(null);
  private readonly protocolVersionSignal = signal<string | null>(null);
  private nextRequestId = 1;

  readonly sessionId = this.sessionIdSignal.asReadonly();
  readonly protocolVersion = this.protocolVersionSignal.asReadonly();

  /** `initialize` + `notifications/initialized` (handshake completo). */
  initialize(): Observable<McpInitializeResult> {
    // El handshake crea una sesión nueva: no debe reutilizar la anterior.
    this.sessionIdSignal.set(null);
    this.protocolVersionSignal.set(null);
    return this.post<McpInitializeResult>(
      'initialize',
      {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'running-ui', version: '1.0.0' },
      },
      this.nextRequestId++,
    ).pipe(
      map((response) => {
        if (!response.result) {
          throw new Error('El servidor MCP no devolvió el resultado de initialize');
        }
        if (response.result.protocolVersion) {
          this.protocolVersionSignal.set(response.result.protocolVersion);
        }
        return response.result;
      }),
    );
  }

  /** Notificación JSON-RPC posterior al initialize (sin id ni respuesta). */
  notifyInitialized(): Observable<void> {
    return this.post<never>('notifications/initialized', undefined, undefined).pipe(
      map(() => undefined),
    );
  }

  /** `tools/list`: catálogo de herramientas expuestas por el servidor MCP. */
  listTools(): Observable<McpToolListResult> {
    return this.post<McpToolListResult>('tools/list', {}, this.nextRequestId++).pipe(
      map((response) => response.result ?? { tools: [] }),
    );
  }

  /** `tools/call`: ejecuta una herramienta con argumentos JSON. */
  callTool(name: string, args: Record<string, unknown>): Observable<McpToolCallResult> {
    return this.post<McpToolCallResult>(
      'tools/call',
      { name, arguments: args },
      this.nextRequestId++,
    ).pipe(map((response) => response.result ?? {}));
  }

  /** `ping` para comprobar que la sesión MCP sigue viva. */
  ping(): Observable<unknown> {
    return this.post<unknown>('ping', {}, this.nextRequestId++).pipe(
      map((response) => response.result),
    );
  }

  /**
   * GET /mcp — stream SSE de la sesión MCP.
   *
   * Emite cada bloque recibido como texto para poder mostrarlo en el panel.
   * No se usa EventSource porque no admite la cabecera Authorization.
   */
  stream(): Observable<string> {
    return new Observable<string>((subscriber) => {
      const session = this.sessionIdSignal();
      if (!session) {
        subscriber.error(new Error('Primero inicializa una sesión MCP'));
        return;
      }

      const controller = new AbortController();
      const token = this.auth.token();
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Mcp-Session-Id': session,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const protocol = this.protocolVersionSignal();
      if (protocol) {
        headers['MCP-Protocol-Version'] = protocol;
      }

      void fetch(this.api.url('/mcp'), { headers, signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`SSE MCP ${response.status}`);
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
              const block = buffer.slice(0, boundary).trim();
              buffer = buffer.slice(boundary + 2);
              if (block) {
                subscriber.next(block);
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

  /** Cierra la sesión local (el servidor no expone un método de cierre). */
  reset(): void {
    this.sessionIdSignal.set(null);
    this.protocolVersionSignal.set(null);
    this.nextRequestId = 1;
  }

  private post<T>(
    method: string,
    params: unknown,
    id: number | undefined,
  ): Observable<McpRpcResponse<T>> {
    const body: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (id !== undefined) {
      body['id'] = id;
    }
    if (params !== undefined) {
      body['params'] = params;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    const session = this.sessionIdSignal();
    if (session) {
      headers['Mcp-Session-Id'] = session;
    }
    const protocol = this.protocolVersionSignal();
    if (protocol) {
      headers['MCP-Protocol-Version'] = protocol;
    }

    return this.http
      .post(this.api.url('/mcp'), body, { headers, observe: 'response', responseType: 'text' })
      .pipe(
        tap((response) => {
          const sessionId = response.headers.get('Mcp-Session-Id');
          if (sessionId) {
            this.sessionIdSignal.set(sessionId);
          }
        }),
        map((response) => {
          const rpc = parseMcpResponse<T>(response.body);
          if (rpc.error) {
            throw new McpRpcError(rpc.error.message, rpc.error.code);
          }
          return rpc;
        }),
      );
  }
}

/** Acepta JSON directo o mensajes SSE (`data: {...}`) en la respuesta. */
function parseMcpResponse<T>(body: string | null): McpRpcResponse<T> {
  if (!body?.trim()) {
    return {};
  }

  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return normalizeRpc<T>(JSON.parse(trimmed) as unknown);
  }

  const payloads = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (payloads.length === 0) {
    throw new Error('Respuesta MCP no válida');
  }
  return normalizeRpc<T>(JSON.parse(payloads[payloads.length - 1]) as unknown);
}

function normalizeRpc<T>(value: unknown): McpRpcResponse<T> {
  if (Array.isArray(value)) {
    const candidates = value
      .filter((item): item is McpRpcResponse<T> => !!item && typeof item === 'object')
      .filter((item) => item.result !== undefined || item.error !== undefined);
    return candidates[candidates.length - 1] ?? {};
  }
  if (value && typeof value === 'object') {
    return value as McpRpcResponse<T>;
  }
  throw new Error('Respuesta MCP no válida');
}
