import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Activity, PageActivity } from '../../../../core/models/api.models';
import { DurationPipe, KmPipe, KmhPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

/** Tabla paginada de carreras del usuario (`/activities`). */
@Component({
  selector: 'app-activities-table',
  imports: [DatePipe, DecimalPipe, UpperCasePipe, DurationPipe, KmPipe, PacePipe],
  templateUrl: './activities-table.html',
  styleUrl: './activities-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitiesTable {
  readonly page = input<PageActivity | null>(null);
  readonly loading = input<boolean>(false);

  readonly pageChange = output<number>();
  readonly selectActivity = output<Activity>();

  protected goToPage(target: number): void {
    const current = this.page();
    if (!current || target < 0 || target > current.totalPages - 1) {
      return;
    }
    this.pageChange.emit(target);
  }
}
