import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { HeatmapService } from '../../../../core/services/heatmap.service';
import { KmPipe } from '../../../../shared/pipes/format.pipes';

/**
 * Pestaña "Mapa de calor": agrega las trazas GPS de todas las actividades del
 * usuario sobre un único mapa OpenStreetMap. Las calles repetidas acumulan
 * más color al superponerse las líneas semitransparentes.
 */
@Component({
  selector: 'app-activity-heatmap',
  imports: [DatePipe, DecimalPipe, KmPipe],
  templateUrl: './activity-heatmap.html',
  styleUrl: './activity-heatmap.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityHeatmap implements OnInit {
  protected readonly heatmap = inject(HeatmapService);
  private readonly zone = inject(NgZone);
  private readonly mapRef = viewChild<ElementRef<HTMLElement>>('heatMap');

  /** Opacidad (%) de cada traza: más alto = más intensidad acumulada. */
  protected readonly opacity = signal(30);

  protected readonly percent = computed(() => {
    const { done, total } = this.heatmap.progress();
    return total === 0 ? 0 : Math.round((done / total) * 100);
  });

  private heatMap: L.Map | null = null;
  private routeLayers: L.Polyline[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private windowListener: (() => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const el = this.mapRef()?.nativeElement ?? null;
      if (!el || this.heatmap.status() !== 'ready' || this.heatMap !== null) {
        return;
      }
      this.zone.runOutsideAngular(() => this.renderMap(el));
    });
    inject(DestroyRef).onDestroy(() => this.destroyMap());
  }

  ngOnInit(): void {
    void this.heatmap.load();
  }

  /** Ajusta la opacidad de todas las trazas en vivo (control deslizante). */
  protected setOpacity(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.opacity.set(value);
    const opacity = value / 100;
    for (const layer of this.routeLayers) {
      layer.setStyle({ opacity });
    }
  }

  protected retry(): void {
    this.heatmap.retry();
  }

  /** Dibuja todas las trazas superpuestas y encuadra el conjunto completo. */
  private renderMap(el: HTMLElement): void {
    const map = L.map(el, { scrollWheelZoom: false, preferCanvas: true });
    this.heatMap = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const opacity = untracked(() => this.opacity()) / 100;
    const bounds = L.latLngBounds([]);
    this.routeLayers = untracked(() => this.heatmap.routes()).map((route) => {
      const line = L.polyline(route.points, {
        color: '#00e676',
        weight: 3,
        opacity,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);
      bounds.extend(line.getBounds());
      return line;
    });
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.05));
    }

    // Reajusta el lienzo cuando el contenedor cambia de tamaño: sin esto
    // Leaflet conserva el tamaño anterior y las trazas quedan descolgadas.
    const refresh = () => {
      if (this.refreshTimer !== null) {
        clearTimeout(this.refreshTimer);
      }
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        map.invalidateSize();
      }, 60);
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(refresh);
      this.resizeObserver.observe(el);
    }
    if (this.windowListener) {
      window.removeEventListener('resize', this.windowListener);
    }
    this.windowListener = refresh;
    window.addEventListener('resize', refresh);
    refresh();
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      refresh();
    }, 400);
  }

  private destroyMap(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.windowListener) {
      window.removeEventListener('resize', this.windowListener);
      this.windowListener = null;
    }
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    this.heatMap?.remove();
    this.heatMap = null;
    this.routeLayers = [];
  }
}
