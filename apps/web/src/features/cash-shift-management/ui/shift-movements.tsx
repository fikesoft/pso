import { Button, Loading, Notice } from '@pos/ui';
import { cashMovementMessages as text } from '@pos/ui/locales';
import { tenantLocale } from '../../../shared/config';
import { useShiftMovements } from '../model/use-shift-movements';
import type { ShiftMovementsProps } from '../model/shift-management.types';
export function ShiftMovements(input: ShiftMovementsProps) {
  const model = useShiftMovements(input);
  return (
    <section className="form-stack">
      <Button
        variant="secondary"
        aria-expanded={model.expanded}
        onClick={() => model.setExpanded(!model.expanded)}
      >
        {text.history}
      </Button>
      {model.expanded && (
        <>
          {model.loading && <Loading />}
          {model.error && <Notice>{model.error}</Notice>}
          {model.data?.movements.length === 0 && <p>{text.empty}</p>}
          {model.data?.movements.map((row) => (
            <article className="operation-order-card form-stack cash-record" key={row.id}>
              <h4>
                {text.kinds[row.kind]} · {row.direction === 'IN' ? text.incoming : text.outgoing} ·{' '}
                {row.amount} MDL
              </h4>
              <p>
                {new Intl.DateTimeFormat(tenantLocale, {
                  timeZone: model.data!.timezone,
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(row.createdAt))}
              </p>
              <p>
                {text.actor}:{' '}
                {row.actorUserId === input.detail.shift.ownerUserId
                  ? input.detail.shift.ownerDisplayName
                  : text.otherActor}
              </p>
              {row.reason && <p className="cash-reason">{row.reason}</p>}
              <details>
                <summary>{text.source}</summary>
                <p className="cash-reason">
                  {row.source.kind} · {row.source.id}
                </p>
                <p className="cash-reason">
                  {text.actorId}: {row.actorUserId}
                </p>
              </details>
            </article>
          ))}
          <div className="form-footer">
            <Button
              variant="secondary"
              disabled={model.loading}
              onClick={() => void model.refresh()}
            >
              {text.refresh}
            </Button>
            {model.data?.nextCursor && (
              <Button
                variant="secondary"
                disabled={model.loading}
                onClick={() => void model.more()}
              >
                {text.more}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
