import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
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
import { DurationPipe, KmPipe, KmhPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

type DetailTab = 'summary' | 'splits' | 'zones' | 'load' | 'gps';

interface ZoneRow {
  cls: string;
  label: string;
  seconds: number;
  percentage: number;
}

interface GpsGeometry {
  polyline: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  count: number;
}

const GPS_W = 640;
const GPS_H = 340;
const GPS_PAD = 18;

const ZONE_DEFS: { key: keyof HrZonesResponseDto['zones']; label: string; cls: string }[] = [
  { key: 'Z1_Recovery', label: 'Z1 · Recuperación', cls: 'z1' },
  { key: 'Z2_Endurance', label: 'Z2 · Resistencia', cls: 'z2' },
  { key: 'Z3_Tempo', label: 'Z3 · Tempo', cls: 'z3' },
  { key: 'Z4_Threshold', label: 'Z4 · Umbral', cls: 'z4' },
  { key: 'Z5_Anaerobic', label: 'Z5 · Anaeróbico', cls: 'z5' },
];

/**
 * Detalle completo de una carrera: métricas consolidadas, splits por km,
 * zonas de FC, carga de entrenamiento, desacople aeróbico y traza GPS.
 */
@Component({
  selector: 'app-activity-detail',
  imports: [DatePipe, DecimalPipe, DurationPipe, KmPipe, PacePipe, KmhPipe],
  templateUrl: './activity-detail.html',
  styleUrl: './activity-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close.emit()' },
})
export class ActivityDetail implements OnInit {
  readonly activity = input.required<Activity>();
  readonly close = output<void>();

  private readonly activities = inject(ActivitiesService);

  protected readonly activeTab = signal<DetailTab>('summary');
  protected readonly splits = signal<SplitDto[] | null>(null);
  protected readonly hrZones = signal<HrZonesResponseDto | null>(null);
  protected readonly trainingLoad = signal<TrainingLoadResponseDto | null>(null);
  protected readonly vo2 = signal<Vo2MaxVamResponseDto | null>(null);
  protected readonly drift = signal<CardiacDriftResponseDto | null>(null);
  protected readonly trackpoints = signal<ActivityTrackpoint[] | null>(null);

  protected readonly gpsViewBox = `0 0 ${GPS_W} ${GPS_H}`;

  protected readonly endTime = computed(() => {
    const a = this.activity();
    const start = new Date(a.startTime).getTime();
    return Number.isFinite(start) ? new Date(start + a.totalTimeSeconds * 1000) : null;
  });

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

  protected readonly gpsGeometry = computed<GpsGeometry | null>(() => {
    const list = this.trackpoints() ?? [];
    const pts = list.filter(
      (p): p is ActivityTrackpoint & { latitude: number; longitude: number } =>
        p.latitude !== null && p.longitude !== null,
    );
    if (pts.length < 2) {
      return null;
    }

    const lats = pts.map((p) => p.latitude);
    const lons = pts.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const spanLat = Math.max(maxLat - minLat, 1e-6);
    const spanLon = Math.max(maxLon - minLon, 1e-6);
    const scale = Math.min((GPS_W - GPS_PAD * 2) / spanLon, (GPS_H - GPS_PAD * 2) / spanLat);
    const offX = (GPS_W - spanLon * scale) / 2;
    const offY = (GPS_H - spanLat * scale) / 2;

    const project = (p: ActivityTrackpoint & { latitude: number; longitude: number }) => ({
      x: offX + (p.longitude - minLon) * scale,
      y: GPS_H - offY - (p.latitude - minLat) * scale,
    });

    const projected = pts.map(project);
    return {
      polyline: projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      start: projected[0],
      end: projected[projected.length - 1],
      count: pts.length,
    };
  });

  protected readonly trackStats = computed(() => {
    const list = this.trackpoints() ?? [];
    if (list.length === 0) {
      return null;
    }
    const heartRates = list.map((p) => p.heartRate).filter((h): h is number => h !== null);
    const altitudes = list.map((p) => p.altitudeMeters).filter((a): a is number => a !== null);
    const distances = list.map((p) => p.distanceMeters).filter((d): d is number => d !== null);
    const speeds = list.map((p) => p.speed).filter((s): s is number => s !== null);

    return {
      count: list.length,
      distanceMeters: distances.length > 0 ? Math.max(...distances) - Math.min(...distances) : null,
      hrAvg: heartRates.length > 0 ? heartRates.reduce((a, b) => a + b, 0) / heartRates.length : null,
      hrMin: heartRates.length > 0 ? Math.min(...heartRates) : null,
      hrMax: heartRates.length > 0 ? Math.max(...heartRates) : null,
      altMin: altitudes.length > 0 ? Math.min(...altitudes) : null,
      altMax: altitudes.length > 0 ? Math.max(...altitudes) : null,
      speedMax: speeds.length > 0 ? Math.max(...speeds) : null,
    };
  });

  protected readonly racePredictions = computed(() => {
    const predictions = this.vo2()?.predictedRaceTimes;
    if (!predictions) {
      return [];
    }
    return [
      { label: '5K', value: predictions['5k'] },
      { label: '10K', value: predictions['10k'] },
      { label: '21K', value: predictions['21k'] },
      { label: '42K', value: predictions['42k'] },
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
    const id = this.activity().id;
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

  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
