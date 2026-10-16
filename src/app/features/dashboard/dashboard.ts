import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, interval, of } from 'rxjs';
import {
  AcwrStatusDto,
  Activity,
  EddingtonStatsDto,
  PageActivity,
  PmcPointDto,
  RecordResponseDto,
  SummaryStatsDto,
} from '../../core/models/api.models';
import { ActivitiesService } from '../../core/services/activities.service';
import { ApiConfigService } from '../../core/services/api-config.service';
import { AuthService } from '../../core/services/auth.service';
import { StatsService } from '../../core/services/stats.service';
import { ToastService } from '../../core/services/toast.service';
import { DurationPipe, KmPipe, PacePipe } from '../../shared/pipes/format.pipes';
import { TerminalConsole } from '../../shared/terminal-console/terminal-console';
import { ActivitiesTable } from './widgets/activities-table/activities-table';
import { ActivityDetail } from './widgets/activity-detail/activity-detail';
import { AcwrCard } from './widgets/acwr-card/acwr-card';
import { EddingtonCard } from './widgets/eddington-card/eddington-card';
import { PmcChart } from './widgets/pmc-chart/pmc-chart';
import { ProfileCard } from './widgets/profile-card/profile-card';
import { RecordsGrid } from './widgets/records-grid/records-grid';
import { SummaryStats } from './widgets/summary-stats/summary-stats';

type Tab = 'overview' | 'analytics' | 'records' | 'activities' | 'account';

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
    FormsModule,
    TerminalConsole,
    ProfileCard,
    SummaryStats,
    PmcChart,
    AcwrCard,
    EddingtonCard,
    RecordsGrid,
    ActivitiesTable,
    ActivityDetail,
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
  private readonly stats = inject(StatsService);
  private readonly activities = inject(ActivitiesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly apiVersion = 'v1.3.0';

  protected readonly tabs: TabDef[] = [
    { id: 'overview', label: 'Resumen' },
    { id: 'analytics', label: 'Analítica' },
    { id: 'records', label: 'Récords PB' },
    { id: 'activities', label: 'Actividades' },
    { id: 'account', label: 'Cuenta & API' },
  ];

  protected readonly activeTab = signal<Tab>('overview');
  protected readonly loading = signal(true);
  protected readonly activitiesLoading = signal(false);
  protected readonly recalibrating = signal(false);

  protected readonly summary = signal<SummaryStatsDto | null>(null);
  protected readonly records = signal<RecordResponseDto[]>([]);
  protected readonly pmcPoints = signal<PmcPointDto[]>([]);
  protected readonly eddington = signal<EddingtonStatsDto | null>(null);
  protected readonly acwr = signal<AcwrStatusDto | null>(null);
  protected readonly activitiesPage = signal<PageActivity | null>(null);
  protected readonly selectedActivity = signal<Activity | null>(null);

  protected readonly recentActivity = computed(() => {
    const page = this.activitiesPage();
    return page && page.content.length > 0 ? page.content[0] : null;
  });

  private readonly clock = signal(Date.now());

  /** Segundos restantes del access token, actualizado cada 15 s. */
  protected readonly secondsLeft = computed(() => {
    const expiresAt = this.auth.accessExpiresAt();
    return expiresAt === null ? 0 : Math.max(0, Math.round((expiresAt - this.clock()) / 1000));
  });

  protected serverUrl = this.api.baseUrl();

  constructor() {
    interval(15_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.clock.set(Date.now()));
  }

  ngOnInit(): void {
    this.loadAll();
  }

  /** Refresca en paralelo todos los recursos del usuario autenticado. */
  protected loadAll(): void {
    this.loading.set(true);
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

  protected loadActivities(page: number): void {
    this.activitiesLoading.set(true);
    this.activities.list(page, 10).subscribe({
      next: (pageData) => {
        this.activitiesPage.set(pageData);
        this.activitiesLoading.set(false);
      },
      error: () => this.activitiesLoading.set(false),
    });
  }

  protected setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  protected openActivity(activity: Activity): void {
    this.selectedActivity.set(activity);
  }

  protected closeActivity(): void {
    this.selectedActivity.set(null);
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
