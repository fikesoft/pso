import { useCallback, useState } from 'react';
import { Button, Loading, Notice } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import { readVisitHistory } from '../../../entities/table';
import { useRemoteData } from '../../../shared/lib';
import type { VisitPanelProps } from '../model/table-service.types';
export function VisitHistory(props: VisitPanelProps) {
  const [cursor, setCursor] = useState<string>();
  const list = useRemoteData(
    useCallback(
      () => readVisitHistory(props.api, props.id, props.locationId, cursor),
      [props.api, props.id, props.locationId, cursor],
    ),
  );
  return (
    <section className="form-stack">
      <h3>{text.history}</h3>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && <Loading />}
      {!list.error &&
        list.data?.events.map((event) => (
          <article className="operation-order-card" key={event.id}>
            <strong>{text.events[event.kind]}</strong>
            <p>
              {text.actor}: {event.actor.displayName}
            </p>
            <time dateTime={event.createdAt}>
              {new Intl.DateTimeFormat('ro-MD', {
                dateStyle: 'short',
                timeStyle: 'medium',
                timeZone: list.data!.timezone,
              }).format(new Date(event.createdAt))}
            </time>
            {event.previousTable && (
              <p>
                {event.previousTable.code} · {event.previousTable.name} → {event.result.tableCode} ·{' '}
                {event.result.tableName}
              </p>
            )}
            {event.reason && <p>{event.reason}</p>}
            {event.relatedVisitId && (
              <Button
                variant="secondary"
                disabled={props.blocked}
                onClick={() => props.onVisit(event.relatedVisitId!)}
              >
                {text.relatedVisit}
              </Button>
            )}
            {event.previousWaiter && (
              <p>
                {text.previousWaiter}: {event.previousWaiter.displayName}
              </p>
            )}
          </article>
        ))}
      {list.data?.nextCursor && (
        <Button
          disabled={props.blocked || list.loading}
          onClick={() => setCursor(list.data!.nextCursor!)}
        >
          {text.moreHistory}
        </Button>
      )}
    </section>
  );
}
