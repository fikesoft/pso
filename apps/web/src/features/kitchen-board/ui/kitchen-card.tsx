import { operationalMessages as text, stationMessages } from '@pos/ui/locales';
import { SERVICE_LABELS, KITCHEN_STATUS_LABELS } from '../../../shared/config/operations.constants';
import type { KitchenCardProps } from '../model/kitchen-board.types';
import { KitchenActions } from './kitchen-actions';
import { KitchenItems } from './kitchen-items';
import { KitchenTimer } from './kitchen-timer';
import { KitchenSeverity } from './kitchen-severity';
import { KitchenBatch } from './kitchen-batch';
import { KitchenCourseActions } from './kitchen-course-actions';
import { kitchenBatchStatus } from '../lib/kitchen-batch-status';
import { kitchenTicketSeverity } from '../lib/kitchen-severity';
import { kitchenElapsed } from '../lib/kitchen-time';
export function KitchenCard({
  api,
  ticket,
  canUpdate,
  canFire,
  onFire,
  busy,
  onUpdate,
  stationId,
  now,
}: KitchenCardProps) {
  const batches = stationId
    ? ticket.batches.filter((batch) =>
        stationId === 'UNASSIGNED' ? batch.station === null : batch.station?.id === stationId,
      )
    : ticket.batches;
  const displayStatus = stationId ? kitchenBatchStatus(batches) : ticket.status;
  const routed = ticket.batches.some((batch) => batch.station !== null || batch.courseNumber > 0);
  const severity = kitchenTicketSeverity(ticket, batches, now);
  return (
    <article
      className={`operation-ticket operation-ticket-${displayStatus.toLowerCase()}`}
      data-kitchen-alert={severity}
    >
      <h3>
        {text.orderNumber} #{ticket.orderNumber}
      </h3>
      <KitchenSeverity severity={severity} />
      <p>
        {SERVICE_LABELS[ticket.serviceType]} {ticket.tableLabel} · {text.revision} {ticket.revision}
      </p>
      {canFire && <KitchenCourseActions ticket={ticket} disabled={busy} onFire={onFire} />}
      {!stationId && !ticket.batches.some((batch) => batch.courseNumber > 0) && (
        <KitchenTimer
          createdAt={ticket.createdAt}
          now={now}
          completedAt={ticket.status === 'READY' ? ticket.updatedAt : undefined}
        />
      )}
      {stationId && (
        <p>
          {stationMessages.overallProgress}: {KITCHEN_STATUS_LABELS[ticket.status]}
        </p>
      )}
      {routed || stationId ? (
        batches.map((batch) => (
          <KitchenBatch
            key={batch.id}
            batch={batch}
            ticket={ticket}
            api={api}
            now={now}
            canUpdate={canUpdate}
            busy={busy}
            onUpdate={onUpdate}
          />
        ))
      ) : (
        <>
          <KitchenItems
            api={api}
            ticketId={ticket.id}
            items={ticket.items}
            elapsedSeconds={
              ticket.status === 'READY' || ticket.status === 'CANCELLED'
                ? undefined
                : kitchenElapsed(ticket.createdAt, undefined, now)
            }
          />
          {canUpdate && (
            <KitchenActions
              status={ticket.status}
              busy={busy}
              onUpdate={(status) => onUpdate(ticket, status)}
            />
          )}
        </>
      )}
    </article>
  );
}
