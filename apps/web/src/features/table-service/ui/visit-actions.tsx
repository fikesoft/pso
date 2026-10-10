import { useCallback, useState } from 'react';
import { Button, Field, Select, Notice } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import type { TableVisitCommandRequest } from '@pos/contracts/tables';
import { readTableWaiters } from '../../../entities/table';
import { useRemoteData } from '../../../shared/lib';
import type { VisitActionsProps } from '../model/table-service.types';
export function VisitActions(props: VisitActionsProps) {
  const { detail, operation } = props;
  const [guests, setGuests] = useState(String(detail.visit.guestCount));
  const [reason, setReason] = useState('');
  const [waiter, setWaiter] = useState('');
  const [cursor, setCursor] = useState<string>();
  const waiters = useRemoteData(
    useCallback(
      () =>
        props.can('tables.visits.assign')
          ? readTableWaiters(props.api, props.locationId, cursor)
          : Promise.resolve({ waiters: [], nextCursor: null }),
      [props.api, props.locationId, cursor, props.can],
    ),
  );
  const blocked = props.blocked || operation.locked;
  function send(fields: TableVisitCommandRequest) {
    void operation.send({
      family: 'VISIT',
      kind: 'COMMAND',
      visitId: detail.visit.id,
      body: fields,
    });
  }
  const base = () => ({
    locationId: props.locationId,
    version: detail.visit.version,
    requestKey: crypto.randomUUID(),
  });
  return (
    <div className="form-stack">
      <p>
        {text.waiter}: {detail.visit.waiter.displayName} · {text.guests}: {detail.visit.guestCount}
      </p>
      {detail.actions.changeGuests && (
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            send({ ...base(), kind: 'GUEST_COUNT_CHANGED', guestCount: Number(guests) });
          }}
        >
          <Field
            label={text.guests}
            type="number"
            min={1}
            max={999}
            required
            value={guests}
            disabled={blocked}
            onChange={(e) => setGuests(e.target.value)}
          />
          <Button disabled={blocked || Number(guests) === detail.visit.guestCount} type="submit">
            {text.changeGuests}
          </Button>
        </form>
      )}
      <p>{text.billHint}</p>
      <div className="inline">
        {detail.actions.requestBill && (
          <Button disabled={blocked} onClick={() => send({ ...base(), kind: 'BILL_REQUESTED' })}>
            {text.requestBill}
          </Button>
        )}
        {detail.actions.cancelBill && (
          <Button disabled={blocked} onClick={() => send({ ...base(), kind: 'BILL_CANCELLED' })}>
            {text.cancelBill}
          </Button>
        )}
      </div>
      {(detail.actions.changeWaiter || detail.actions.close) && (
        <Field
          label={text.reason}
          value={reason}
          minLength={3}
          maxLength={500}
          disabled={blocked}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {detail.actions.changeWaiter && (
        <div className="form-stack">
          {waiters.error && <Notice>{waiters.error}</Notice>}
          <Select
            label={text.chooseWaiter}
            value={waiter}
            disabled={blocked || waiters.loading || !!waiters.error}
            onChange={(e) => setWaiter(e.target.value)}
          >
            <option value="">—</option>
            {!waiters.error &&
              waiters.data?.waiters.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.displayName}
                </option>
              ))}
          </Select>
          {waiters.data?.nextCursor && (
            <Button
              variant="secondary"
              disabled={blocked}
              onClick={() => setCursor(waiters.data!.nextCursor!)}
            >
              {text.moreWaiters}
            </Button>
          )}
          <Button
            disabled={
              blocked || !waiter || waiter === detail.visit.waiter.id || reason.trim().length < 3
            }
            onClick={() =>
              send({ ...base(), kind: 'WAITER_CHANGED', targetWaiterUserId: waiter, reason })
            }
          >
            {text.changeWaiter}
          </Button>
        </div>
      )}
      {detail.closeBlocked && <Notice>{text.closeBlocked}</Notice>}
      {detail.actions.close && (
        <>
          <p>{text.closeHint}</p>
          <Button
            disabled={blocked || reason.trim().length < 3}
            onClick={() => send({ ...base(), kind: 'CLOSE', reason })}
          >
            {text.close}
          </Button>
        </>
      )}
    </div>
  );
}
