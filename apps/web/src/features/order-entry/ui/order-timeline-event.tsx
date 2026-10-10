import { tenantLocale, defaultTimezone } from '../../../shared/config';
import { Badge } from '@pos/ui';
import { orderTimelineMessages as text } from '@pos/ui/locales';
import type { OrderTimelineEventProps } from '../model/order-timeline.types';
import { timelineAction, timelineStatus } from '../lib/timeline-presentation';
export function OrderTimelineEvent({ event }: OrderTimelineEventProps) {
  const meta = event.metadata;
  const actorSource =
    event.actorNameSource === 'SNAPSHOT'
      ? text.snapshotActor
      : event.actorNameSource === 'CURRENT'
        ? text.currentActor
        : text.unknownActorSource;
  return (
    <li className="order-draft-item" data-testid="order-timeline-event">
      <div className="operation-card-heading">
        <strong>{timelineAction(event.action)}</strong>
        <Badge>{text.kinds[event.kind]}</Badge>
      </div>
      <time dateTime={event.createdAt}>
        {new Date(event.createdAt).toLocaleString(tenantLocale, { timeZone: defaultTimezone })}
      </time>
      <p>
        {text.actor}: {event.actorDisplayName ?? text.unknownActor}{' '}
        <span className="scope-hint">({actorSource})</span>
      </p>
      {(event.fromStatus || event.toStatus) && (
        <p>
          {timelineStatus(event.fromStatus)} → {timelineStatus(event.toStatus)}
        </p>
      )}
      {event.reason && (
        <p>
          {text.reason}: {event.reason}
        </p>
      )}
      {meta.amount && (
        <p>
          {text.amount}: {meta.amount}
          {meta.currency ? ` ${meta.currency}` : ''}
        </p>
      )}
      {meta.method && (
        <p>
          {text.method}: {text.methods[meta.method as keyof typeof text.methods] ?? meta.method}
        </p>
      )}
      {meta.courierName && (
        <p>
          {text.courier}: {meta.courierName}
        </p>
      )}
      {meta.checkoutMode && (
        <p>
          {text.mode}:{' '}
          {text.modes[meta.checkoutMode as keyof typeof text.modes] ?? meta.checkoutMode}
        </p>
      )}
      {event.orderVersion !== null && (
        <p className="scope-hint">
          {text.version}: {event.orderVersion}
        </p>
      )}
      {event.terminalId && (
        <p className="scope-hint">
          {text.terminal}: {event.terminalId}
        </p>
      )}
    </li>
  );
}
