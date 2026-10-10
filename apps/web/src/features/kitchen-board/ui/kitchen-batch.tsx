import { stationMessages, kitchenCourseMessages as courses } from '@pos/ui/locales';
import { KITCHEN_STATUS_LABELS } from '../../../shared/config/operations.constants';
import type { KitchenBatchProps } from '../model/kitchen-board.types';
import { kitchenBatchElapsed } from '../lib/kitchen-severity';
import { KitchenTimer } from './kitchen-timer';
import { KitchenItems } from './kitchen-items';
import { KitchenActions } from './kitchen-actions';

export function KitchenBatch({
  batch,
  ticket,
  api,
  now,
  canUpdate,
  busy,
  onUpdate,
}: KitchenBatchProps) {
  const name = batch.station
    ? `${batch.station.code} · ${batch.station.name}`
    : stationMessages.unassigned;
  return (
    <section
      aria-label={
        batch.courseNumber === 0
          ? (batch.station?.name ?? stationMessages.unassigned)
          : `${name} · ${courses.labels[batch.courseNumber]}`
      }
    >
      <h4>{name}</h4>
      {batch.courseNumber > 0 && <p>{courses.labels[batch.courseNumber]}</p>}
      <p>
        {batch.firedAt === null && batch.status !== 'CANCELLED'
          ? courses.waiting
          : KITCHEN_STATUS_LABELS[batch.status]}
      </p>
      {batch.firedAt !== null && (
        <KitchenTimer
          createdAt={batch.firedAt}
          fromRelease={batch.courseNumber > 0}
          now={now}
          completedAt={batch.status === 'READY' ? batch.updatedAt : undefined}
        />
      )}
      <KitchenItems
        api={api}
        ticketId={ticket.id}
        items={ticket.items.filter((item) => batch.ticketItemIds.includes(item.id))}
        elapsedSeconds={kitchenBatchElapsed(batch, now)}
      />
      {canUpdate && batch.firedAt !== null && (
        <KitchenActions
          status={batch.status}
          busy={busy}
          onUpdate={(status) => onUpdate(ticket, status, batch.id)}
        />
      )}
    </section>
  );
}
