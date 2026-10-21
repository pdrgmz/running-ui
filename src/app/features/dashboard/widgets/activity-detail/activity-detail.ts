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
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { catchError, forkJoin, of } from 'rxjs';
import {
  Activity,
  ActivityTrackpoint,
  CardiacDriftResponseDto,
  HrZonesResponseDto,
  SplitDto,
  TrainingLoadResponseDto,
  Vo2MaxVamResponseDto,
} from '../../../../core/models/api.models';
import { ActivitiesService } from '../../../../core/services/activities.service';
import { GeoService } from '../../../../core/services/geo.service';
import { ToastService } from '../../../../core/services/toast.service';
import { downloadBlob, safeFileStem } from '../../../../core/utils/download';
import {
  DurationPipe,
  formatDuration,
  KmPipe,
  PacePipe,
  parseTimeToSeconds,
} from '../../../../shared/pipes/format.pipes';
import { ActivityProfiles } from '../activity-profiles/activity-profiles';

interface DetailSection {
  id: string;
  label: string;
}

interface ZoneRow {
  cls: string;
  label: string;
  seconds: number;
  percentage: number;
}

interface RoutePoint {
  lat: number;
  lon: number;
}

interface SplitBar {
  km: number;
  pace: string;
  seconds: number;
  heartRate: number | null;
  widthPct: number;
  fastest: boolean;
}

const ZONE_DEFS: { key: keyof HrZonesResponseDto['zones']; label: string; cls: string }[] = [
  { key: 'Z1_Recovery', label: 'Z1 · Recuperación', cls: 'z1' },
  { key: 'Z2_Endurance', label: 'Z2 · Resistencia', cls: 'z2' },
  { key: 'Z3_Tempo', label: 'Z3 · Tempo', cls: 'z3' },
  { key: 'Z4_Threshold', label: 'Z4 · Umbral', cls: 'z4' },
  { key: 'Z5_Anaerobic', label: 'Z5 · Anaeróbico', cls: 'z5' },
];

/**
 * Detalle completo de una carrera: mapa con perfiles sincronizados (ritmo,
 * cadencia, FC y altitud), splits horizontales por km y tiempo en zonas de FC,
 * resumen consolidado, estimación fisiológica y carga/desacople.
 */
@Component({
  selector: 'app-activity-detail',
  imports: [DatePipe, DecimalPipe, DurationPipe, KmPipe, PacePipe, ActivityProfiles],
  templateUrl: './activity-detail.html',
  styleUrl: './activity-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close.emit()' },
})
export class ActivityDetail implements OnInit {
  readonly activity = input.required<Activity>();
  readonly close = output<void>();
  readonly changed = output<void>();
  readonly deleted = output<string>();

  private readonly activities = inject(ActivitiesService);
  private readonly geo = inject(GeoService);
  private readonly toast = inject(ToastService);

  protected readonly completing = signal<'trackpoints' | 'metrics' | null>(null);
  protected readonly downloading = signal<'gpx' | 'geojson' | null>(null);
  protected readonly deleting = signal(false);
  protected readonly confirmingDelete = signal(false);

  protected readonly sections: DetailSection[] = [
    { id: 'det-route', label: 'Mapa y perfiles' },
    { id: 'det-splits', label: 'Splits y zonas' },
    { id: 'det-summary', label: 'Resumen y análisis' },
  ];
  protected readonly activeSection = signal('det-route');

  private readonly detailBodyRef = viewChild<ElementRef<HTMLElement>>('detailBody');
  private readonly gpsMapRef = viewChild<ElementRef<HTMLElement>>('gpsMap');
  private readonly zone = inject(NgZone);
  private gpsMap: L.Map | null = null;
  private hoverMarker: L.CircleMarker | null = null;
  private gpsResizeObserver: ResizeObserver | null = null;
  private gpsWindowListener: (() => void) | null = null;
  private gpsRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly splits = signal<SplitDto[] | null>(null);
  protected readonly hrZones = signal<HrZonesResponseDto | null>(null);
  protected readonly trainingLoad = signal<TrainingLoadResponseDto | null>(null);
  protected readonly vo2 = signal<Vo2MaxVamResponseDto | null>(null);
  protected readonly drift = signal<CardiacDriftResponseDto | null>(null);
  protected readonly trackpoints = signal<ActivityTrackpoint[] | null>(null);
  /** Trackpoint activo compartido entre el mapa y los perfiles. */
  protected readonly hoverIndex = signal<number | null>(null);

  protected readonly zoneRows = computed<ZoneRow[]>(() => {
    const zones = this.hrZones()?.zones;
    if (!zones) {
      return [];
    }
    return ZONE_DEFS.map((def) => {
      const detail = zones[def.key];
      return {
        cls: def.cls,
        label: def.label,
        seconds: detail?.seconds ?? 0,
        percentage: detail?.percentage ?? 0,
      };
    });
  });

  /** Barras del gráfico de splits por km: más corta = kilómetro más rápido. */
  protected readonly splitBars = computed<SplitBar[]>(() => {
    const list = this.splits() ?? [];
    if (list.length === 0) {
      return [];
    }
    const entries = list
      .map((split) => ({ split, minutes: Number.parseFloat(split.paceMinPerKm) }))
      .filter((entry) => Number.isFinite(entry.minutes) && entry.minutes > 0);
    if (entries.length === 0) {
      return [];
    }
    const fastest = Math.min(...entries.map((entry) => entry.minutes));
    const slowest = Math.max(...entries.map((entry) => entry.minutes));
    const span = slowest - fastest;
    return entries.map(({ split, minutes }) => ({
      km: split.km,
      pace: split.paceMinPerKm,
      seconds: split.timeSeconds,
      heartRate: split.avgHeartRate ?? null,
      widthPct: span > 0 ? 12 + ((minutes - fastest) / span) * 88 : 100,
      fastest: minutes === fastest,
    }));
  });

  /** Puntos con coordenadas válidas y su índice original (para el hover). */
  protected readonly routeIndexed = computed<{ src: number; lat: number; lon: number }[]>(() => {
    const points: { src: number; lat: number; lon: number }[] = [];
    (this.trackpoints() ?? []).forEach((point, src) => {
      if (point.latitude !== null && point.longitude !== null) {
        points.push({ src, lat: point.latitude, lon: point.longitude });
      }
    });
    return points;
  });

  /** Puntos con coordenadas válidas para dibujar el mapa GPS. */
  protected readonly routePoints = computed<RoutePoint[] | null>(() => {
    const points = this.routeIndexed().map((point) => ({ lat: point.lat, lon: point.lon }));
    return points.length < 2 ? null : points;
  });

  constructor() {
    // Crea el mapa Leaflet en cuanto llegan los trackpoints y el contenedor existe.
    effect(() => {
      const el = this.gpsMapRef()?.nativeElement;
      const pts = this.routePoints();
      if (!el || !pts) {
        return;
      }
      this.zone.runOutsideAngular(() => this.renderMap(el, pts));
    });
    inject(DestroyRef).onDestroy(() => {
      this.gpsResizeObserver?.disconnect();
      this.gpsResizeObserver = null;
      if (this.gpsWindowListener) {
        window.removeEventListener('resize', this.gpsWindowListener);
        this.gpsWindowListener = null;
      }
      if (this.gpsRefreshTimer !== null) {
        clearTimeout(this.gpsRefreshTimer);
        this.gpsRefreshTimer = null;
      }
      this.gpsMap?.remove();
      this.gpsMap = null;
    });
  }

  protected readonly racePredictions = computed(() => {
    const predictions = this.vo2()?.predictedRaceTimes;
    if (!predictions) {
      return [];
    }
    return [
      { label: '5K', value: formatDuration(parseTimeToSeconds(predictions['5k'])) },
      { label: '10K', value: formatDuration(parseTimeToSeconds(predictions['10k'])) },
      { label: '21K', value: formatDuration(parseTimeToSeconds(predictions['21k'])) },
      { label: '42K', value: formatDuration(parseTimeToSeconds(predictions['42k'])) },
    ];
  });

  protected readonly prettyExtraData = computed(() => {
    const raw = this.activity().extraData;
    if (!raw) {
      return null;
    }
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  });

  ngOnInit(): void {
    this.loadDetail();
  }

  /** Carga (o recarga) toda la analítica de la actividad. */
  private loadDetail(): void {
    const id = this.activity().id;
    this.splits.set(null);
    this.hrZones.set(null);
    this.trainingLoad.set(null);
    this.vo2.set(null);
    this.drift.set(null);
    this.trackpoints.set(null);
    forkJoin({
      splits: this.activities.splits(id).pipe(catchError(() => of(null))),
      zones: this.activities.hrZones(id).pipe(catchError(() => of(null))),
      load: this.activities.trainingLoad(id).pipe(catchError(() => of(null))),
      vo2: this.activities.vo2MaxVam(id).pipe(catchError(() => of(null))),
      drift: this.activities.cardiacDrift(id).pipe(catchError(() => of(null))),
      track: this.activities.trackpoints(id, 'medium').pipe(catchError(() => of([] as ActivityTrackpoint[]))),
    }).subscribe((res) => {
      this.splits.set(res.splits);
      this.hrZones.set(res.zones);
      this.trainingLoad.set(res.load);
      this.vo2.set(res.vo2);
      this.drift.set(res.drift);
      this.trackpoints.set(res.track);
    });
  }

  /** POST /api/v1/activities/{id}/complete-trackpoints */
  protected completeTrackpoints(): void {
    if (this.completing()) {
      return;
    }
    this.completing.set('trackpoints');
    this.activities.completeTrackpoints(this.activity().id).subscribe({
      next: (result) => {
        this.completing.set(null);
        this.toast.show(result.message || 'TRACKPOINTS COMPLETADOS');
        this.changed.emit();
        this.loadDetail();
      },
      error: () => this.completing.set(null),
    });
  }

  /** POST /api/v1/activities/{id}/complete-metrics */
  protected completeMetrics(): void {
    if (this.completing()) {
      return;
    }
    this.completing.set('metrics');
    this.activities.completeMetrics(this.activity().id).subscribe({
      next: (result) => {
        this.completing.set(null);
        this.toast.show(result.message || 'MÉTRICAS COMPLETADAS');
        this.changed.emit();
        this.loadDetail();
      },
      error: () => this.completing.set(null),
    });
  }

  /** GET /api/v1/geo/{id}/gpx */
  protected downloadGpx(): void {
    if (this.downloading()) {
      return;
    }
    this.downloading.set('gpx');
    this.geo.exportGpx(this.activity().id).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        downloadBlob(blob, `${safeFileStem(this.activity().id)}.gpx`);
        this.toast.show('GPX DESCARGADO');
      },
      error: () => this.downloading.set(null),
    });
  }

  /** GET /api/v1/geo/{id}/geojson */
  protected downloadGeoJson(): void {
    if (this.downloading()) {
      return;
    }
    this.downloading.set('geojson');
    this.geo.exportGeoJson(this.activity().id).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        downloadBlob(blob, `${safeFileStem(this.activity().id)}.geojson`);
        this.toast.show('GEOJSON DESCARGADO');
      },
      error: () => this.downloading.set(null),
    });
  }

  protected requestDelete(): void {
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  /** DELETE /api/v1/activities/{id} */
  protected deleteActivity(): void {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.activities.deleteById(this.activity().id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleted.emit(this.activity().id);
        this.close.emit();
      },
      error: () => this.deleting.set(false),
    });
  }

  /** Dibuja la ruta sobre OpenStreetMap: traza, inicio (verde) y fin (oscuro). */
  private renderMap(el: HTMLElement, pts: RoutePoint[]): void {
    this.gpsMap?.remove();
    this.hoverMarker = null;
    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const latlngs = pts.map((p) => [p.lat, p.lon] as L.LatLngTuple);
    const route = L.polyline(latlngs, { color: '#1a1a1a', weight: 3.5, opacity: 0.9 }).addTo(map);
    L.circleMarker(latlngs[0], {
      radius: 7,
      color: '#1a1a1a',
      weight: 2.5,
      fillColor: '#00e676',
      fillOpacity: 1,
    }).addTo(map);
    L.circleMarker(latlngs[latlngs.length - 1], {
      radius: 7,
      color: '#00e676',
      weight: 2.5,
      fillColor: '#1a1a1a',
      fillOpacity: 1,
    }).addTo(map);
    map.fitBounds(route.getBounds(), { padding: [20, 20] });

    this.gpsMap = map;

    // Sincronía inversa: el punto de la ruta bajo el ratón activa el mismo
    // instante en los cuatro perfiles.
    map.on('mousemove', (event: L.LeafletMouseEvent) => {
      const nearest = this.nearestPointIndex(event.latlng.lat, event.latlng.lng);
      if (nearest !== this.hoverIndex()) {
        this.zone.run(() => this.setHoverIndex(nearest));
      }
    });
    map.on('mouseout', () => {
      this.zone.run(() => this.setHoverIndex(null));
    });

    // Reajusta el lienzo cuando el contenedor cambia de tamaño (redimensionar
    // la ventana, aparición del scrollbar, reflujo del bento): sin esto Leaflet
    // sigue dibujando con el tamaño anterior y los tiles/la ruta quedan
    // descolgados o fuera del marco visible.
    const refresh = () => {
      if (this.gpsRefreshTimer !== null) {
        clearTimeout(this.gpsRefreshTimer);
      }
      this.gpsRefreshTimer = setTimeout(() => {
        this.gpsRefreshTimer = null;
        map.invalidateSize();
      }, 60);
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.gpsResizeObserver?.disconnect();
      this.gpsResizeObserver = new ResizeObserver(refresh);
      this.gpsResizeObserver.observe(el);
    }
    if (this.gpsWindowListener) {
      window.removeEventListener('resize', this.gpsWindowListener);
    }
    this.gpsWindowListener = refresh;
    window.addEventListener('resize', refresh);
    if (this.gpsRefreshTimer !== null) {
      clearTimeout(this.gpsRefreshTimer);
    }
    this.gpsRefreshTimer = setTimeout(refresh, 350);
    refresh();
  }

  /** Actualiza el punto activo compartido por perfiles y mapa. */
  protected setHoverIndex(index: number | null): void {
    this.hoverIndex.set(index);
    this.updateMapHover(index);
  }

  /** Mueve (o retira) el marcador de inspección sobre la ruta. */
  private updateMapHover(index: number | null): void {
    const map = this.gpsMap;
    if (!map) {
      return;
    }
    const point = index === null ? null : ((this.trackpoints() ?? [])[index] ?? null);
    if (!point || point.latitude === null || point.longitude === null) {
      this.hoverMarker?.remove();
      this.hoverMarker = null;
      return;
    }
    if (!this.hoverMarker) {
      this.hoverMarker = L.circleMarker([point.latitude, point.longitude], {
        radius: 8,
        color: '#00e676',
        weight: 3,
        fillColor: '#00e676',
        fillOpacity: 0.18,
        className: 'map-hover-point',
      }).addTo(map);
    } else {
      this.hoverMarker.setLatLng([point.latitude, point.longitude]);
    }
    this.hoverMarker.bringToFront();
  }

  /** Índice del trackpoint más cercano a un punto del mapa. */
  private nearestPointIndex(lat: number, lon: number): number | null {
    let best: { src: number; distance: number } | null = null;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (const point of this.routeIndexed()) {
      const dLat = point.lat - lat;
      const dLon = (point.lon - lon) * cosLat;
      const distance = dLat * dLat + dLon * dLon;
      if (!best || distance < best.distance) {
        best = { src: point.src, distance };
      }
    }
    return best?.src ?? null;
  }

  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  /** Salta a una sección dentro del área con scroll del modal. */
  protected jumpTo(id: string): void {
    const container = this.detailBodyRef()?.nativeElement;
    const target = container?.querySelector<HTMLElement>(`#${id}`);
    if (!container || !target) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    container.scrollTop += target.getBoundingClientRect().top - containerRect.top;
    this.activeSection.set(id);
  }

  /** Mantiene resaltada la sección visible mientras el usuario desplaza. */
  protected onBodyScroll(event: Event): void {
    const container = event.target as HTMLElement;
    const containerTop = container.getBoundingClientRect().top;
    let current = this.sections[0].id;
    for (const section of this.sections) {
      const el = container.querySelector<HTMLElement>(`#${section.id}`);
      if (el && el.getBoundingClientRect().top - containerTop <= 110) {
        current = section.id;
      }
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 8) {
      current = this.sections[this.sections.length - 1].id;
    }
    this.activeSection.set(current);
  }
}
