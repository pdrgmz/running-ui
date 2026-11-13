import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, NgZone, signal, viewChild, effect } from '@angular/core';
import * as L from 'leaflet';
import { catchError, of } from 'rxjs';
import { ActivityTrackpoint } from '../../../../core/models/api.models';
import { ActivitiesService } from '../../../../core/services/activities.service';

interface RoutePoint {
  lat: number;
  lon: number;
}

/**
 * Minimapa con el recorrido (track GPS) de una actividad concreta.
 * Se usa dentro de cada card del records-grid para mostrar el trazado
 * de la marca personal (PB) sin salir de la pantalla de récords.
 *
 * Carga los trackpoints a baja resolución para que sea rápido y
 * dibuja la polilínea, el punto de inicio (verde) y el de fin (negro).
 */
@Component({
  selector: 'app-record-route-map',
  imports: [],
  templateUrl: './record-route-map.html',
  styleUrl: './record-route-map.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordRouteMap {
  readonly activityId = input.required<string>();

  private readonly activities = inject(ActivitiesService);
  private readonly zone = inject(NgZone);
  private readonly mapRef = viewChild<ElementRef<HTMLElement>>('routeMap');

  private map: L.Map | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private windowListener: (() => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly trackpoints = signal<ActivityTrackpoint[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  constructor() {
    // Carga los trackpoints de la actividad en cuanto se indica el id.
    effect(() => {
      const id = this.activityId();
      if (!id) {
        return;
      }
      this.loading.set(true);
      this.error.set(false);
      this.trackpoints.set(null);
      this.activities
        .trackpoints(id, 'low')
        .pipe(catchError(() => of([] as ActivityTrackpoint[])))
        .subscribe({
          next: (pts) => {
            this.trackpoints.set(pts.length > 0 ? pts : null);
            this.loading.set(false);
          },
          error: () => {
            this.trackpoints.set(null);
            this.loading.set(false);
            this.error.set(true);
          },
        });
    });

    // Renderiza el mapa cuando existen el contenedor y al menos 2 puntos válidos.
    effect(() => {
      const el = this.mapRef()?.nativeElement;
      const pts = this.validRoutePoints();
      if (!el || !pts) {
        return;
      }
      this.zone.runOutsideAngular(() => this.renderMap(el, pts));
    });

    inject(DestroyRef).onDestroy(() => {
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
      this.map?.remove();
      this.map = null;
    });
  }

  /** Puntos con coordenadas válidas para dibujar el mapa GPS. */
  protected readonly validRoutePoints = (): RoutePoint[] | null => {
    const pts = (this.trackpoints() ?? [])
      .filter((p) => p.latitude !== null && p.longitude !== null)
      .map((p) => ({ lat: p.latitude as number, lon: p.longitude as number }));
    return pts.length < 2 ? null : pts;
  };

  /** Dibuja la ruta sobre OpenStreetMap: traza, inicio (verde) y fin (oscuro). */
  private renderMap(el: HTMLElement, pts: RoutePoint[]): void {
    this.map?.remove();
    const map = L.map(el, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const latlngs = pts.map((p) => [p.lat, p.lon] as L.LatLngTuple);
    const route = L.polyline(latlngs, { color: '#1a1a1a', weight: 3, opacity: 0.9 }).addTo(map);
    L.circleMarker(latlngs[0], {
      radius: 6,
      color: '#1a1a1a',
      weight: 2,
      fillColor: '#00e676',
      fillOpacity: 1,
    }).addTo(map);
    L.circleMarker(latlngs[latlngs.length - 1], {
      radius: 6,
      color: '#00e676',
      weight: 2,
      fillColor: '#1a1a1a',
      fillOpacity: 1,
    }).addTo(map);
    map.fitBounds(route.getBounds(), { padding: [10, 10] });

    this.map = map;

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
    this.windowListener = refresh;
    window.addEventListener('resize', refresh);
    refresh();
  }
}
