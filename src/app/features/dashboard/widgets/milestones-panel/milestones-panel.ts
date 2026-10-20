import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { EddingtonStatsDto, RecordResponseDto } from '../../../../core/models/api.models';
import {
  MILESTONE_CATEGORY_LABELS,
  MILESTONE_DEFINITIONS,
  MilestoneCategoryId,
  MilestoneProgress,
  buildMilestoneProgress,
  formatMilestoneValue,
  milestoneRemainingLabel,
} from '../../../../core/models/milestone.models';
import { MilestonesService } from '../../../../core/services/milestones.service';
import { MilestoneTimeline } from '../milestone-timeline/milestone-timeline';

type CategoryFilter = 'all' | MilestoneCategoryId;

interface CategoryOption {
  id: CategoryFilter;
  label: string;
}

/**
 * Panel de logros automáticos del corredor.
 *
 * Combina los hitos calculados sobre el historial de actividades (volumen,
 * sesiones, desnivel, tiempo, distancias largas y constancia) con los que se
 * derivan de los récords personales y del número de Eddington, que ya llegan
 * al dashboard desde sus endpoints.
 */
@Component({
  selector: 'app-milestones-panel',
  imports: [MilestoneTimeline],
  templateUrl: './milestones-panel.html',
  styleUrl: './milestones-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MilestonesPanel implements OnInit {
  readonly records = input<RecordResponseDto[]>([]);
  readonly eddington = input<EddingtonStatsDto | null>(null);

  /** Actividad a abrir en el detalle (clic en un logro del historial). */
  readonly openActivity = output<string>();

  protected readonly service = inject(MilestonesService);

  protected readonly categoryFilter = signal<CategoryFilter>('all');
  protected readonly onlyUnlocked = signal(false);

  /** Logros del historial + Eddington + récords personales. */
  protected readonly achievements = computed<MilestoneProgress[]>(() => [
    ...this.service.milestones(),
    ...buildAuxMilestones(this.records(), this.eddington()),
  ]);

  protected readonly totalCount = computed(() => this.achievements().length);
  protected readonly unlockedCount = computed(
    () => this.achievements().filter((milestone) => milestone.unlocked).length,
  );

  protected readonly completionPercent = computed(() => {
    const total = this.totalCount();
    return total === 0 ? 0 : Math.round((this.unlockedCount() / total) * 100);
  });

  /** Logro bloqueado con mayor progreso: el objetivo más cercano. */
  protected readonly nextMilestone = computed<MilestoneProgress | null>(() => {
    const locked = this.achievements().filter(
      (milestone) => !milestone.unlocked && milestone.current !== null,
    );
    if (locked.length === 0) {
      return null;
    }
    return locked.reduce((best, item) => (item.progress > best.progress ? item : best));
  });

  protected readonly categories = computed<CategoryOption[]>(() => {
    const present = new Set(this.achievements().map((milestone) => milestone.category));
    return [
      { id: 'all', label: 'Todos' },
      ...(Object.keys(MILESTONE_CATEGORY_LABELS) as MilestoneCategoryId[])
        .filter((id) => present.has(id))
        .map((id) => ({ id, label: MILESTONE_CATEGORY_LABELS[id] })),
    ];
  });

  protected readonly filtered = computed<MilestoneProgress[]>(() => {
    const filter = this.categoryFilter();
    return this.achievements().filter(
      (milestone) => filter === 'all' || milestone.category === filter,
    );
  });

  protected readonly unlockedVisible = computed(() =>
    this.filtered().filter((milestone) => milestone.unlocked),
  );

  /** Logros del timeline: los conseguidos con fecha exacta de desbloqueo. */
  protected readonly timelineMilestones = computed(() =>
    this.unlockedVisible().filter((milestone) => milestone.unlockedAt),
  );

  /** Objetivos pendientes, del más cercano al más lejano. */
  protected readonly upcoming = computed<MilestoneProgress[]>(() => {
    if (this.onlyUnlocked()) {
      return [];
    }
    return this.filtered()
      .filter((milestone) => !milestone.unlocked)
      .sort((a, b) => b.progress - a.progress);
  });

  protected readonly hasVisible = computed(
    () => this.timelineMilestones().length > 0 || this.upcoming().length > 0,
  );

  protected readonly emptyMessage = computed(() => {
    if (!this.onlyUnlocked()) {
      return 'NO HAY LOGROS CON ESTE FILTRO.';
    }
    return this.unlockedVisible().length > 0
      ? 'TIENES LOGROS EN ESTA CATEGORÍA, PERO SIN FECHA EXACTA.'
      : 'TODAVÍA NO HAS CONSEGUIDO LOGROS EN ESTA CATEGORÍA.';
  });

  ngOnInit(): void {
    void this.service.load();
  }

  protected retry(): void {
    this.service.retry();
  }

  protected setCategory(category: CategoryFilter): void {
    this.categoryFilter.set(category);
  }

  protected toggleOnlyUnlocked(): void {
    this.onlyUnlocked.update((value) => !value);
  }

  protected categoryLabel(category: MilestoneCategoryId): string {
    return MILESTONE_CATEGORY_LABELS[category];
  }

  protected valueLabel(milestone: MilestoneProgress): string {
    return formatMilestoneValue(milestone, milestone.current);
  }

  protected targetLabel(milestone: MilestoneProgress): string {
    return formatMilestoneValue(milestone, milestone.target);
  }

  protected remainingLabel(milestone: MilestoneProgress): string {
    return milestoneRemainingLabel(milestone, milestone.current);
  }

  protected progressLabel(milestone: MilestoneProgress): string {
    return `${Math.floor(milestone.progress * 100)}%`;
  }
}

/** Logros auxiliares: Eddington y récords (sin fecha exacta de desbloqueo). */
function buildAuxMilestones(
  records: RecordResponseDto[],
  eddington: EddingtonStatsDto | null,
): MilestoneProgress[] {
  return MILESTONE_DEFINITIONS.filter(
    (def) => def.metric === 'eddington' || def.metric === 'recordTime',
  ).map((def) => {
    if (def.metric === 'eddington') {
      return buildMilestoneProgress(def, eddington?.eddingtonNumber ?? null, null);
    }
    const record = records.find(
      (item) => item.distanceCategory?.toLowerCase() === def.recordCategory?.toLowerCase(),
    );
    return buildMilestoneProgress(def, record?.bestTimeSeconds ?? null, null, record?.activityId ?? null);
  });
}
