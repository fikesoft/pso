import { Button } from '@pos/ui';
import { packingMessages as text } from '@pos/ui/locales';
import { SERVICE_LABELS } from '../../../shared/config/operations.constants';
import { PACKING_LABELS } from '../config/packing.constants';
import type { PackingCardProps } from '../model/packing-board.types';
export function PackingCard({ session, locked, canUpdate, canComplete, send }: PackingCardProps) {
  const checked = session.items.filter((item) => item.checked).length;
  const kitchenReady = session.kitchenStatus === 'READY';
  const base = () => ({
    sessionId: session.id,
    version: session.version,
    requestKey: crypto.randomUUID(),
  });
  return (
    <article className="packing-card" aria-label={`${text.order} #${session.orderNumber}`}>
      <header>
        <h2>
          {text.order} #{session.orderNumber}
        </h2>
        <span>{PACKING_LABELS[session.status]}</span>
      </header>
      <p>
        {SERVICE_LABELS[session.serviceType]}
        {session.tableLabel ? ` · ${text.table} ${session.tableLabel}` : ''}
      </p>
      <p>
        {checked}/{session.items.length} {text.checked}
      </p>
      <ul className="packing-checklist">
        {session.items.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.checked}
                disabled={locked || !canUpdate || session.status !== 'PACKING' || !kitchenReady}
                onChange={(event) =>
                  void send({
                    ...base(),
                    action: 'CHECK_ITEM',
                    itemId: item.id,
                    checked: event.target.checked,
                  })
                }
              />
              <span>
                <strong>
                  {item.quantity} × {item.productName}
                </strong>
                {item.modifierGroups.map((group, index) => (
                  <span className="packing-item-detail" key={index}>
                    {group.groupName}: {group.options.join(', ')}
                  </span>
                ))}
                {item.note && <span className="packing-item-detail">{item.note}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!kitchenReady && session.status === 'WAITING' && (
        <p className="section-note">{text.kitchenPending}</p>
      )}
      {session.status === 'WAITING' && canUpdate && (
        <Button
          disabled={locked || !kitchenReady}
          onClick={() => void send({ ...base(), action: 'START' })}
        >
          {text.start}
        </Button>
      )}
      {session.status === 'PACKING' && (
        <>
          {checked !== session.items.length && <p className="section-note">{text.allRequired}</p>}
          {canComplete && (
            <Button
              disabled={
                locked || !kitchenReady || !session.items.length || checked !== session.items.length
              }
              onClick={() => void send({ ...base(), action: 'COMPLETE' })}
            >
              {text.complete}
            </Button>
          )}
        </>
      )}
    </article>
  );
}
