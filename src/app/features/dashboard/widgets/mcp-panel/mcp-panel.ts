import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  McpInitializeResult,
  McpServerInfo,
  McpTool,
  McpToolCallResult,
} from '../../../../core/models/api.models';
import { McpService } from '../../../../core/services/mcp.service';
import { ToastService } from '../../../../core/services/toast.service';

/**
 * Panel de integración MCP (`/mcp`): inicializa la sesión JSON-RPC, lista las
 * herramientas del servidor, ejecuta una tool y muestra el stream SSE.
 */
@Component({
  selector: 'app-mcp-panel',
  imports: [FormsModule],
  templateUrl: './mcp-panel.html',
  styleUrl: './mcp-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpPanel {
  private readonly mcp = inject(McpService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sessionId = this.mcp.sessionId;
  protected readonly protocolVersion = this.mcp.protocolVersion;
  protected readonly serverInfo = signal<McpServerInfo | null>(null);
  protected readonly capabilities = signal<unknown>(null);
  protected readonly tools = signal<McpTool[]>([]);
  protected readonly selectedToolName = signal('');
  protected readonly connecting = signal(false);
  protected readonly calling = signal(false);
  protected readonly streamActive = signal(false);
  protected readonly errorText = signal<string | null>(null);
  protected readonly resultText = signal<string | null>(null);
  protected readonly streamLines = signal<string[]>([]);

  protected argsText = '{}';

  private streamSub: Subscription | null = null;

  protected readonly connected = computed(() => this.sessionId() !== null);
  protected readonly selectedTool = computed(
    () => this.tools().find((tool) => tool.name === this.selectedToolName()) ?? null,
  );
  protected readonly schemaText = computed(() => {
    const schema = this.selectedTool()?.inputSchema;
    return schema ? JSON.stringify(schema, null, 2) : null;
  });
  protected readonly capabilitiesText = computed(() => {
    const value = this.capabilities();
    return value ? JSON.stringify(value, null, 2) : null;
  });
  protected readonly streamText = computed(() => this.streamLines().join('\n'));

  constructor() {
    this.destroyRef.onDestroy(() => this.stopStream());
  }

  /** initialize + notifications/initialized + tools/list. */
  protected connect(): void {
    if (this.connecting()) {
      return;
    }
    this.connecting.set(true);
    this.errorText.set(null);
    this.resultText.set(null);
    this.mcp.initialize().subscribe({
      next: (info: McpInitializeResult) => {
        this.serverInfo.set(info.serverInfo ?? null);
        this.capabilities.set(info.capabilities ?? null);
        this.toast.show('SESIÓN MCP INICIALIZADA');
        this.mcp.notifyInitialized().subscribe({
          next: () => this.afterInitialized(),
          error: () => this.afterInitialized(),
        });
      },
      error: (error: unknown) => {
        this.connecting.set(false);
        this.errorText.set(errorMessage(error));
      },
    });
  }

  /** tools/list */
  protected loadTools(): void {
    if (!this.connected()) {
      this.errorText.set('Primero inicializa la sesión MCP');
      return;
    }
    this.errorText.set(null);
    this.mcp.listTools().subscribe({
      next: (result) => {
        this.tools.set(result.tools ?? []);
        if (this.tools().length > 0) {
          this.selectTool(this.tools()[0].name);
        }
      },
      error: (error: unknown) => this.errorText.set(errorMessage(error)),
    });
  }

  protected selectTool(name: string): void {
    this.selectedToolName.set(name);
    this.resultText.set(null);
  }

  /** tools/call con los argumentos JSON del textarea. */
  protected runTool(): void {
    const tool = this.selectedTool();
    if (!tool || this.calling()) {
      return;
    }
    let args: Record<string, unknown>;
    try {
      const parsed = JSON.parse(this.argsText || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Los argumentos deben ser un objeto JSON');
      }
      args = parsed as Record<string, unknown>;
    } catch (error: unknown) {
      this.errorText.set(errorMessage(error));
      return;
    }

    this.calling.set(true);
    this.errorText.set(null);
    this.resultText.set(null);
    this.mcp.callTool(tool.name, args).subscribe({
      next: (result: McpToolCallResult) => {
        this.calling.set(false);
        this.resultText.set(JSON.stringify(result, null, 2));
        this.toast.show(`TOOL «${tool.name}» EJECUTADA`);
      },
      error: (error: unknown) => {
        this.calling.set(false);
        this.errorText.set(errorMessage(error));
      },
    });
  }

  /** GET /mcp (SSE) — abre o cierra el stream de la sesión. */
  protected toggleStream(): void {
    if (this.streamActive()) {
      this.stopStream();
      return;
    }
    if (!this.connected()) {
      this.errorText.set('Primero inicializa la sesión MCP');
      return;
    }
    this.errorText.set(null);
    this.streamLines.set([]);
    this.streamActive.set(true);
    this.streamSub = this.mcp.stream().subscribe({
      next: (block) => {
        this.streamLines.update((lines) => {
          const next = [...lines, block];
          return next.length > 100 ? next.slice(next.length - 100) : next;
        });
      },
      error: (error: unknown) => {
        this.streamActive.set(false);
        this.errorText.set(errorMessage(error));
      },
      complete: () => this.streamActive.set(false),
    });
  }

  protected resetSession(): void {
    this.stopStream();
    this.mcp.reset();
    this.serverInfo.set(null);
    this.capabilities.set(null);
    this.tools.set([]);
    this.selectedToolName.set('');
    this.resultText.set(null);
    this.errorText.set(null);
    this.streamLines.set([]);
    this.argsText = '{}';
    this.toast.show('SESIÓN MCP REINICIADA');
  }

  protected copyResult(): void {
    const value = this.resultText();
    if (!value) {
      return;
    }
    const copy = navigator.clipboard?.writeText(value);
    if (!copy) {
      this.toast.error('EL PORTAPAPELES NO ESTÁ DISPONIBLE');
      return;
    }
    void copy.then(
      () => this.toast.show('RESULTADO COPIADO'),
      () => this.toast.error('NO SE PUDO COPIAR EL RESULTADO'),
    );
  }

  private afterInitialized(): void {
    this.connecting.set(false);
    this.loadTools();
  }

  private stopStream(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = null;
    this.streamActive.set(false);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Error desconocido en la sesión MCP';
}
