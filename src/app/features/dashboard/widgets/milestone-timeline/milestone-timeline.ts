import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  MILESTONE_CATEGORY_LABELS,
  MilestoneCategoryId,
  MilestoneProgress,
  formatMilestoneValue,
} from '../../../../core/models/milestone.models';

/** Grupo de logros desbloqueados en la misma fecha. */
export interface MilestoneTimelineGroup {
  key: string;
  date: string;
  items: MilestoneProgress[];
}

/**
 * Timeline vertical de logros conseguidos, del más reciente al más antiguo.
 *
 * Solo incluye logros con fecha exacta de desbloqueo, agrupados por día.
 */
@Component({
  selector: 'app-milestone-timeline',
  imports: [DatePipe],
  templateUrl: './milestone-timeline.html',
  styleUrl: './milestone-timeline.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MilestoneTimeline {
  readonly milestones = input.required<MilestoneProgress[]>();

  /** Id de la actividad a abrir en el detalle (logros ligados a una carrera). */
  readonly openActivity = output<string>();

  protected readonly groups = computed<MilestoneTimelineGroup[]>(() => {
    const byDate = new Map<string, MilestoneTimelineGroup>();
    for (const milestone of this.milestones()) {
      if (!milestone.unlockedAt) {
        continue;
      }
      const date = milestone.unlockedAt;
      const key = localDateKey(new Date(date));
      const group = byDate.get(key);
      if (group) {
        group.items.push(milestone);
      } else {
        byDate.set(key, { key, date, items: [milestone] });
      }
    }
    return [...byDate.values()].sort((a, b) => b.key.localeCompare(a.key));
  });

  protected categoryLabel(category: MilestoneCategoryId): string {
    return MILESTONE_CATEGORY_LABELS[category];
  }

  protected targetLabel(milestone: MilestoneProgress): string {
    return formatMilestoneValue(milestone, milestone.target);
  }
}

/** Clave local `yyyy-MM-dd` para agrupar por el día que ve el usuario. */
function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
