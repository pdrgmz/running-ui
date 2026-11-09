import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, catchError, forkJoin, of, switchMap, takeWhile, timer } from 'rxjs';
import {
  AcwrStatusDto,
  Activity,
  ActivityDeletionStatusDto,
  EddingtonStatsDto,
  ElevationCoverageDto,
  PageActivity,
  PmcPointDto,
  RecordResponseDto,
  SummaryStatsDto,
} from '../../core/models/api.models';
import { ActivitiesService } from '../../core/services/activities.service';
import { ApiConfigService } from '../../core/services/api-config.service';
import { AuthService } from '../../core/services/auth.service';
import { MilestonesService } from '../../core/services/milestones.service';
import { PwaService } from '../../core/services/pwa.service';
import { StatsService } from '../../core/services/stats.service';
import { ToastService } from '../../core/services/toast.service';
import { DurationPipe, KmPipe, PacePipe } from '../../shared/pipes/format.pipes';
import { TerminalConsole } from '../../shared/terminal-console/terminal-console';
import { ActivityCalendar } from './widgets/activity-calendar/activity-calendar';
import { ActivityDetail } from './widgets/activity-detail/activity-detail';
import { ActivityHeatmap } from './widgets/activity-heatmap/activity-heatmap';
import { AcwrCard } from './widgets/acwr-card/acwr-card';
import { ApiKeysPanel } from './widgets/api-keys-panel/api-keys-panel';
import { EddingtonCard } from './widgets/eddington-card/eddington-card';
import { FilesPanel } from './widgets/files-panel/files-panel';
import { McpPanel } from './widgets/mcp-panel/mcp-panel';
import { MilestonesPanel } from './widgets/milestones-panel/milestones-panel';
import { PmcChart } from './widgets/pmc-chart/pmc-chart';
import { PmcReading } from './widgets/pmc-reading/pmc-reading';
import { RecordsGrid } from './widgets/records-grid/records-grid';
import { SummaryStats } from './widgets/summary-stats/summary-stats';

type Tab = 'overview' | 'records' | 'activities' | 'files' | 'heatmap' | 'mcp' | 'account';

/** Actividades por página en el calendario (cada página cubre ~3 semanas). */
const CALENDAR_PAGE_SIZE = 15;

interface TabDef {
  id: Tab;
  label: string;
}

/**
 * Panel principal del corredor autenticado: concentra toda la información que
 * la API expone para la cuenta (perfil, estadísticas, récords, analítica,
 * actividades y sesión JWT).
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    TerminalConsole,
    SummaryStats,
    PmcChart,
    PmcReading,
    AcwrCard,
    EddingtonCard,
    RecordsGrid,
    MilestonesPanel,
    ActivityCalendar,
    ActivityHeatmap,
    ActivityDetail,
    FilesPanel,
    McpPanel,
    ApiKeysPanel,
    DurationPipe,
    KmPipe,
    PacePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly api = inject(ApiConfigService);
  protected readonly pwa = inject(PwaService);
  private readonly stats = inject(StatsService);
  private readonly activities = inject(ActivitiesService);
  private readonly milestones = inject(MilestonesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabs: TabDef[] = [
    { id: 'overview', label: 'Resumen' },
    { id: 'records', label: 'Récords & Logros' },
    { id: 'activities', label: 'Actividades' },
    { id: 'files', label: 'Archivos' },
    { id: 'heatmap', label: 'Mapa de calor' },
    { id: 'mcp', label: 'MCP' },
    { id: 'account', label: 'Cuenta & API' },
  ];

  protected readonly activeTab = signal<Tab>('overview');
  protected readonly loading = signal(true);
  protected readonly recalibrating = signal(false);
  protected readonly elevationCoverage = signal<ElevationCoverageDto | null>(null);
  protected readonly coverageLoading = signal(false);
  protected readonly coverageError = signal(false);
  protected readonly deletingAll = signal(false);
  protected readonly confirmingDeleteAll = signal(false);
  protected readonly deletionStatus = signal<ActivityDeletionStatusDto | null>(null);
  protected readonly deletionError = signal<string | null>(null);

  protected readonly summary = signal<SummaryStatsDto | null>(null);
  protected readonly records = signal<RecordResponseDto[]>([]);
  protected readonly pmcPoints = signal<PmcPointDto[]>([]);
  protected readonly eddington = signal<EddingtonStatsDto | null>(null);
  protected readonly acwr = signal<AcwrStatusDto | null>(null);
  protected readonly activitiesPage = signal<PageActivity | null>(null);
  protected readonly selectedActivity = signal<Activity | null>(null);

  /* Calendario de actividades: carga incremental por scroll desde el mes actual. */
  protected readonly calendarActivities = signal<Activity[]>([]);
  protected readonly calendarLoading = signal(false);
  protected readonly calendarHasMore = signal(true);
  protected readonly calendarError = signal(false);
  private calendarPage = 0;

  protected readonly recentActivities = computed(() => {
    const page = this.activitiesPage();
    return page ? page.content.slice(0, 5) : [];
  });

  protected readonly deletionProgress = computed(() => {
    const value = this.deletionStatus()?.progressPercent ?? 0;
    return Math.max(0, Math.min(100, value));
  });

  protected readonly deletionStateLabel = computed(() => {
    const status = this.deletionStatus()?.status ?? 'PENDING';
    const labels: Record<string, string> = {
      PENDING: 'EN COLA',
      PROCESSING: 'ELIMINANDO',
      COMPLETED: 'COMPLETADO',
      FAILED: 'FALLIDO',
    };
    return labels[status] ?? status;
  });

  protected readonly deletionCanRetry = computed(() => {
    const status = this.deletionStatus();
    return Boolean(this.deletionError() && status && !isDeletionTerminal(status.status));
  });

  protected serverUrl = this.api.baseUrl();

  private deletionSub: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopDeletionPolling());
  }

  ngOnInit(): void {
    this.loadAll();
  }

  /** Refresca en paralelo todos los recursos del usuario autenticado. */
  protected loadAll(): void {
    this.loading.set(true);
    this.milestones.refreshIfLoaded();
    forkJoin({
      me: this.auth.loadMe().pipe(catchError(() => of(null))),
      summary: this.stats.summary().pipe(catchError(() => of(null))),
      records: this.stats.records().pipe(catchError(() => of([] as RecordResponseDto[]))),
      pmc: this.stats.pmc().pipe(catchError(() => of([] as PmcPointDto[]))),
      eddington: this.stats.eddington().pipe(catchError(() => of(null))),
      acwr: this.stats.acwrCurrent().pipe(catchError(() => of(null))),
      activities: this.activities.list(0, 10).pipe(catchError(() => of(null))),
    }).subscribe((res) => {
      this.summary.set(res.summary);
      this.records.set(res.records);
      this.pmcPoints.set(res.pmc);
      this.eddington.set(res.eddington);
      this.acwr.set(res.acwr);
      this.activitiesPage.set(res.activities);
      this.loading.set(false);
    });
  }

  /** Refresca todo el dashboard tras una importación, borrado o mantenimiento. */
  protected refreshAfterChange(): void {
    this.calendarActivities.set([]);
    this.calendarPage = 0;
    this.calendarHasMore.set(true);
    this.calendarError.set(false);
    this.loadAll();
    if (this.activeTab() === 'activities') {
      this.loadCalendarPage();
    }
  }

  /** Carga la siguiente página de actividades para el calendario (scroll infinito). */
  protected loadCalendarPage(): void {
    if (this.calendarLoading() || !this.calendarHasMore() || this.calendarError()) {
      return;
    }
    this.calendarLoading.set(true);
    this.activities.list(this.calendarPage, CALENDAR_PAGE_SIZE).subscribe({
      next: (page) => {
        this.calendarActivities.update((list) => [...list, ...page.content]);
        this.calendarPage += 1;
        this.calendarHasMore.set(!page.last && page.number + 1 < page.totalPages);
        this.calendarError.set(false);
        this.calendarLoading.set(false);
      },
      error: () => {
        this.calendarError.set(true);
        this.calendarLoading.set(false);
      },
    });
  }

  /** Reintenta la carga del calendario tras un error (botón REINTENTAR). */
  protected retryCalendar(): void {
    this.calendarError.set(false);
    this.loadCalendarPage();
  }

  protected setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'activities' && this.calendarActivities().length === 0 && !this.calendarError()) {
      this.loadCalendarPage();
    }
  }

  protected scrollMobileTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected openActivity(activity: Activity): void {
    this.selectedActivity.set(activity);
  }

  /** Abre el detalle de una actividad concreta por su id (récords y logros). */
  protected openActivityById(id: string): void {
    this.activities.byId(id).subscribe({
      next: (activity) => this.selectedActivity.set(activity),
      error: () => this.toast.show('NO SE PUDO ABRIR EL DETALLE DE LA ACTIVIDAD'),
    });
  }

  protected closeActivity(): void {
    this.selectedActivity.set(null);
  }

  protected onActivityDeleted(id: string): void {
    this.selectedActivity.set(null);
    this.toast.show(`ACTIVIDAD ELIMINADA: ${id}`);
    this.refreshAfterChange();
  }

  protected applyServerUrl(): void {
    this.api.setBaseUrl(this.serverUrl);
    this.serverUrl = this.api.baseUrl();
    this.toast.show(`SERVIDOR API: ${this.api.baseUrl() || '(mismo origen)'}`);
  }

  /** Fuerza el recálculo de estadísticas y récords en el backend. */
  protected recalculate(): void {
    if (this.recalibrating()) {
      return;
    }
    this.recalibrating.set(true);
    this.stats.recalculate().subscribe({
      next: () => {
        this.recalibrating.set(false);
        this.toast.show('ESTADÍSTICAS Y RÉCORDS RECALCULADOS');
        forkJoin({
          summary: this.stats.summary().pipe(catchError(() => of(null))),
          records: this.stats.records().pipe(catchError(() => of([] as RecordResponseDto[]))),
        }).subscribe((res) => {
          this.summary.set(res.summary);
          this.records.set(res.records);
        });
      },
      error: () => this.recalibrating.set(false),
    });
  }

  /** GET /api/v1/activities/elevation-coverage */
  protected loadElevationCoverage(): void {
    if (this.coverageLoading()) {
      return;
    }
    this.coverageLoading.set(true);
    this.coverageError.set(false);
    this.activities.elevationCoverage().subscribe({
      next: (coverage) => {
        this.coverageLoading.set(false);
        this.elevationCoverage.set(coverage);
      },
      error: () => {
        this.coverageLoading.set(false);
        this.coverageError.set(true);
      },
    });
  }

  /** DELETE /api/v1/activities — primer paso: pide confirmación. */
  protected requestDeleteAll(): void {
    this.deletionError.set(null);
    this.confirmingDeleteAll.set(true);
  }

  protected cancelDeleteAll(): void {
    this.confirmingDeleteAll.set(false);
  }

  /**
   * DELETE /api/v1/activities — inicia el vaciado asíncrono (202 Accepted) y
   * sigue su progreso con GET /api/v1/activities/delete-status/{deleteId}.
   */
  protected deleteAllActivities(): void {
    if (this.deletingAll()) {
      return;
    }
    this.deletingAll.set(true);
    this.confirmingDeleteAll.set(false);
    this.deletionStatus.set(null);
    this.deletionError.set(null);
    this.activities.deleteAll().subscribe({
      next: (status) => {
        this.applyDeletionStatus(status);
        if (!isDeletionTerminal(status.status)) {
          this.pollDeletionStatus(status.deleteId);
        }
      },
      error: () => {
        this.deletingAll.set(false);
        this.deletionError.set('NO SE PUDO INICIAR EL VACIADO DE ACTIVIDADES');
      },
    });
  }

  /** Reanuda la consulta del estado si el polling falló temporalmente. */
  protected retryDeletionStatus(): void {
    const status = this.deletionStatus();
    if (!status || this.deletingAll()) {
      return;
    }
    this.deletingAll.set(true);
    this.deletionError.set(null);
    this.pollDeletionStatus(status.deleteId);
  }

  private pollDeletionStatus(deleteId: string): void {
    this.stopDeletionPolling();
    this.deletionSub = timer(0, 1200)
      .pipe(
        switchMap(() => this.activities.deletionStatus(deleteId)),
        takeWhile((status) => !isDeletionTerminal(status.status), true),
      )
      .subscribe({
        next: (status) => this.applyDeletionStatus(status),
        error: () => {
          this.stopDeletionPolling();
          this.deletingAll.set(false);
          this.deletionError.set('NO SE PUDO CONSULTAR EL ESTADO DEL VACIADO');
        },
      });
  }

  private applyDeletionStatus(status: ActivityDeletionStatusDto): void {
    this.deletionStatus.set(status);
    if (!isDeletionTerminal(status.status)) {
      return;
    }
    this.stopDeletionPolling();
    this.deletingAll.set(false);
    if (status.status === 'COMPLETED') {
      this.selectedActivity.set(null);
      this.elevationCoverage.set(null);
      this.toast.show(
        `HISTORIAL VACIADO: ${status.deletedActivities} ACTIVIDADES ELIMINADAS`,
      );
      this.refreshAfterChange();
      return;
    }
    this.deletionError.set(status.error ?? 'EL VACIADO DE ACTIVIDADES HA FALLADO');
    this.toast.error('EL VACIADO DE ACTIVIDADES HA FALLADO');
  }

  private stopDeletionPolling(): void {
    this.deletionSub?.unsubscribe();
    this.deletionSub = null;
  }

  protected refreshToken(): void {
    this.auth.refresh().subscribe({
      next: () => this.toast.show('TOKEN RENOVADO CORRECTAMENTE'),
      error: () => {
        /* el interceptor ya notifica y gestiona el cierre de sesión */
      },
    });
  }

  protected validateSession(): void {
    this.auth.loadMe().subscribe({
      next: (user) => this.toast.show(`SESIÓN VÁLIDA — ${user.email.toUpperCase()} (#${user.id})`),
      error: () => {
        /* el interceptor ya notifica */
      },
    });
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  protected previewToken(token: string | null | undefined): string {
    if (!token) {
      return '—';
    }
    return token.length <= 34 ? token : `${token.slice(0, 22)}…${token.slice(-8)}`;
  }
}

function isDeletionTerminal(status: string | undefined): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}
