import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RecordResponseDto } from '../../../../core/models/api.models';
import { KmhPipe, PacePipe } from '../../../../shared/pipes/format.pipes';

interface RecordCard {
  category: string;
  record: RecordResponseDto | null;
}

const CATEGORIES = ['1k', '5k', '10k', '15k', '21k', '42k'];

/** Marcas personales (PB) por distancia (`/stats/records`). */
@Component({
  selector: 'app-records-grid',
  imports: [DatePipe, DecimalPipe, PacePipe, KmhPipe],
  templateUrl: './records-grid.html',
  styleUrl: './records-grid.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordsGrid {
  readonly records = input<RecordResponseDto[]>([]);

  protected readonly cards = computed<RecordCard[]>(() => {
    const list = this.records();
    return CATEGORIES.map((category) => ({
      category,
      record:
        list.find((r) => r.distanceCategory?.toLowerCase() === category.toLowerCase()) ?? null,
    }));
  });
}
