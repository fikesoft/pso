import { Button } from '@pos/ui';
import { orderResponsibilityMessages as text } from '@pos/ui/locales';
import { tenantLocale } from '../../../shared/config';
import type { ResponsibilityWorkspaceModel } from '../model/responsibility-management.types';
export function ResponsibilityHistory({ model }: { model: ResponsibilityWorkspaceModel }) {
  const { detail } = model;
  if (!detail.history) return null;
  return (
    <details className="form-stack">
      <summary>{text.history}</summary>
      {detail.history.events.map((event) => (
        <article className="operation-order-card form-stack cash-record" key={event.eventId}>
          <h4>{text.events[event.kind]}</h4>
          <p>
            {new Intl.DateTimeFormat(tenantLocale, {
              timeZone: detail.history!.timezone,
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(event.createdAt))}
          </p>
          <p>
            {text.actor}: {event.actorDisplayName}
          </p>
          {event.fromOwner && (
            <p>
              {text.previousOwner}: {event.fromOwner.displayName}
            </p>
          )}
          {event.toOwner && (
            <p>
              {text.nextOwner}: {event.toOwner.displayName}
            </p>
          )}
          {event.sourceShift && (
            <p>
              {event.sourceShift.registerCode} · {event.sourceShift.registerName}
            </p>
          )}
          {event.targetShift && (
            <p>
              {event.targetShift.registerCode} · {event.targetShift.registerName}
            </p>
          )}
          {event.reason && (
            <p>
              {text.reason}: {event.reason}
            </p>
          )}
          {event.managerReason && (
            <p>
              {text.managerReason}: {event.managerReason}
            </p>
          )}
          <details>
            <summary>{text.source}</summary>
            <p>{event.eventId}</p>
            {event.source && (
              <p>
                {event.source.orderEventId} {event.source.paymentOperationId}{' '}
                {event.source.checkoutId}
              </p>
            )}
          </details>
        </article>
      ))}
      {detail.history.nextCursor && (
        <Button
          variant="secondary"
          disabled={detail.loading || model.command.busy}
          onClick={() => void detail.more()}
        >
          {text.moreHistory}
        </Button>
      )}
    </details>
  );
}
