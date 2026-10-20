import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Activity } from '../../../../core/models/api.models';
import { KmPipe } from '../../../../shared/pipes/format.pipes';

interface CalendarDay {
  day: number;
  isToday: boolean;
  activities: Activity[];
}

interface CalendarMonth {
  id: string;
  label: string;
  count: number;
  totalMeters: number;
  weeks: (CalendarDay | null)[][];
}

const MONTH_NAMES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Tope de seguridad: meses máximos renderizados de una vez. */
const MAX_MONTHS = 60;

/**
 * Calendario de actividades: muestra los meses desde el actual hacia atrás
 * y avisa (`loadMore`) cuando el usuario se acerca al final para seguir
 * cargando páginas del API con scroll infinito.
 */
@Component({
  selector: 'app-activity-calendar',
  imports: [DatePipe, KmPipe],
  templateUrl: './activity-calendar.html',
  styleUrl: './activity-calendar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityCalendar {
  readonly activities = input<Activity[]>([]);
  readonly loading = input(false);
  readonly hasMore = input(true);
  readonly error = input(false);
  readonly loadMore = output<void>();
  readonly retry = output<void>();
  readonly selectActivity = output<Activity>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly months = computed(() => buildCalendar(this.activities()));

  private readonly sentinelRef = viewChild<ElementRef<HTMLElement>>('sentinel');
  private readonly sentinelVisible = signal(false);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const el = this.sentinelRef()?.nativeElement;
      if (!el || typeof IntersectionObserver === 'undefined') {
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => this.sentinelVisible.set(entries.some((entry) => entry.isIntersecting)),
        { rootMargin: '480px 0px' },
      );
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());

      // Chequeo inicial (antes del primer callback del observer): si ya está a la vista, carga.
      const rect = el.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 480 && rect.bottom >= -480) {
        this.sentinelVisible.set(true);
      }
    });

    // Mientras el centinela esté a la vista pide más páginas (rellena la vista al entrar).
    effect(() => {
      if (this.sentinelVisible() && !this.loading() && !this.error() && this.hasMore()) {
        this.loadMore.emit();
      }
    });
  }
}

function buildCalendar(activities: Activity[]): CalendarMonth[] {
  const byMonth = new Map<string, Map<number, Activity[]>>();
  for (const activity of activities) {
    const date = new Date(activity.startTime);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const key = monthId(date.getFullYear(), date.getMonth());
    const days = byMonth.get(key) ?? new Map<number, Activity[]>();
    const list = days.get(date.getDate()) ?? [];
    list.push(activity);
    days.set(date.getDate(), list);
    byMonth.set(key, days);
  }

  const now = new Date();
  const currentKey = monthId(now.getFullYear(), now.getMonth());
  const loadedKeys = [...byMonth.keys()].sort().reverse();
  const oldestKey = loadedKeys.length > 0 ? loadedKeys[loadedKeys.length - 1] : currentKey;

  const months: CalendarMonth[] = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (monthId(cursor.getFullYear(), cursor.getMonth()) >= oldestKey && months.length < MAX_MONTHS) {
    months.push(buildMonth(cursor.getFullYear(), cursor.getMonth(), byMonth, now));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }
  return months;
}

function buildMonth(
  year: number,
  monthIndex: number,
  byMonth: Map<string, Map<number, Activity[]>>,
  now: Date,
): CalendarMonth {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // lunes = 0
  const dayMap = byMonth.get(monthId(year, monthIndex)) ?? new Map<number, Activity[]>();

  const cells: (CalendarDay | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(null);
  }

  let count = 0;
  let totalMeters = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const list = (dayMap.get(day) ?? []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
    count += list.length;
    totalMeters += list.reduce((sum, activity) => sum + (activity.distanceMeters ?? 0), 0);
    cells.push({
      day,
      isToday: year === now.getFullYear() && monthIndex === now.getMonth() && day === now.getDate(),
      activities: list,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return {
    id: monthId(year, monthIndex),
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    count,
    totalMeters,
    weeks,
  };
}

function monthId(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}
