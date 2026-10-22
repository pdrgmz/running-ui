import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly toast = inject(ToastService);
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** Indica si la app puede instalarse en el dispositivo mediante el evento nativo */
  readonly canInstall = signal<boolean>(false);

  /** Indica si la app ya se está ejecutando instalada en modo standalone (PWA) */
  readonly isStandalone = signal<boolean>(false);

  /** Indica si el usuario está en iOS (iPhone / iPad) para mostrar instrucciones específicas */
  readonly isIos = signal<boolean>(false);

  /** Controla la visibilidad del modal con los pasos de instalación en iPhone / Safari */
  readonly showIosInstructions = signal<boolean>(false);

  /** Indica si hay una nueva versión del Service Worker disponible */
  readonly hasUpdate = signal<boolean>(false);

  private waitingWorker: ServiceWorker | null = null;

  constructor() {
    this.checkStandalone();
    this.detectIos();
    this.initInstallListeners();
    this.registerServiceWorker();
  }

  private checkStandalone(): void {
    if (typeof window === 'undefined') return;

    const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    const standalone = isStandaloneDisplay || isIosStandalone;
    this.isStandalone.set(standalone);

    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      this.isStandalone.set(e.matches);
      if (e.matches) {
        this.canInstall.set(false);
      }
    });
  }

  private detectIos(): void {
    if (typeof window === 'undefined') return;

    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    this.isIos.set(isAppleDevice);
  }

  private initInstallListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (event: Event) => {
      // Prevenir el banner automático del navegador para controlarlo desde la UI
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isStandalone.set(true);
      this.toast.show('¡Running Tracker instalado correctamente en tu teléfono!');
    });
  }

  /**
   * Ejecuta el proceso de instalación en el dispositivo:
   * - En Android / Chrome: abre el diálogo nativo de instalación.
   * - En iOS Safari: despliega la guía paso a paso ("Compartir" -> "Añadir a pantalla de inicio").
   */
  async promptInstall(): Promise<void> {
    if (this.deferredPrompt) {
      try {
        await this.deferredPrompt.prompt();
        const choice = await this.deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          this.toast.show('Instalando Running Tracker…');
          this.canInstall.set(false);
        }
        this.deferredPrompt = null;
      } catch (err) {
        console.warn('[PWA] Error durante el prompt de instalación:', err);
      }
      return;
    }

    if (this.isIos() && !this.isStandalone()) {
      this.showIosInstructions.set(true);
      return;
    }

    // Si no está disponible el prompt directo ni es iOS
    this.toast.show('Para instalar: usa el menú de tu navegador y pulsa "Instalar aplicación"');
  }

  openIosInstructions(): void {
    this.showIosInstructions.set(true);
  }

  closeIosInstructions(): void {
    this.showIosInstructions.set(false);
  }

  private registerServiceWorker(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Registrar tras la carga completa de la página
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.waitingWorker = newWorker;
                this.hasUpdate.set(true);
                this.toast.show('Nueva actualización disponible. Pulsa para recargar.');
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] No se pudo registrar el Service Worker:', err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }

  updateApp(): void {
    if (this.waitingWorker) {
      this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }
}
