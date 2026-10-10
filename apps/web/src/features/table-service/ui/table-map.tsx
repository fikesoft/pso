import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Field, Loading, Notice, Empty } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import { readTableMap, useTableOperation } from '../../../entities/table';
import { useRemoteData, useInvalidation, useCoalescedInvalidation } from '../../../shared/lib';
import type { TableMapProps } from '../model/table-service.types';
import { TableRecovery } from './table-recovery';
export function TableMap(props: TableMapProps) {
  const [cursor, setCursor] = useState<string>();
  const [opening, setOpening] = useState<string>();
  const [guests, setGuests] = useState('2');
  const list = useRemoteData(
    useCallback(
      () => readTableMap(props.api, { locationId: props.locationId, limit: 50, cursor }),
      [props.api, props.locationId, cursor],
    ),
  );
  const operation = useTableOperation({
    ...props,
    family: 'VISIT',
    isExternallyBlocked: () => props.blocked,
    onSaved: async (result) => {
      setOpening(undefined);
      await list.refresh();
      if (result?.family === 'VISIT') props.onSelect(result.result.event.visitId);
    },
  });
  const signal = useInvalidation(`orders:${props.locationId}`);
  useCoalescedInvalidation(signal, async () => {
    if (!operation.busy) await list.refresh();
  });
  useEffect(() => {
    void list.refresh();
  }, [props.refreshToken, list.refresh]);
  async function refresh() {
    if (await list.refresh()) operation.refreshed();
  }
  const blocked = props.blocked || operation.locked || list.loading || !!list.error;
  return (
    <div className="form-stack">
      <TableRecovery operation={operation} onRefresh={() => void refresh()} />
      <Button
        variant="secondary"
        busy={list.loading}
        disabled={props.blocked || operation.busy || operation.recovering}
        onClick={() => void refresh()}
      >
        {text.refresh}
      </Button>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && !list.data && <Loading />}
      {!list.error && !list.loading && !list.data?.tables.length && (
        <Empty title={text.empty} description={text.description} />
      )}
      {!list.error && (
        <div className="operation-order-list">
          {list.data?.tables.map((row) => (
            <article key={row.table.id} className="operation-order-card">
              <div className="operation-card-heading">
                <h3>
                  {row.table.code} · {row.table.name}
                </h3>
                <Badge>{text.states[row.state]}</Badge>
              </div>
              {row.visit && (
                <p>
                  {text.guests}: {row.visit.guestCount} · {text.waiter}:{' '}
                  {row.visit.waiter.displayName}
                </p>
              )}
              {row.hasReadyFood && <p>{text.states.READY}</p>}
              {row.hasWaitingFood && <p>{text.states.WAITING_FOOD}</p>}
              {row.actions.view && (
                <Button disabled={blocked} onClick={() => props.onSelect(row.visit!.id)}>
                  {text.details}
                </Button>
              )}
              {row.actions.open && opening !== row.table.id && (
                <Button disabled={blocked} onClick={() => setOpening(row.table.id)}>
                  {text.open}
                </Button>
              )}
              {row.actions.open && opening === row.table.id && (
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void operation.send({
                      family: 'VISIT',
                      kind: 'OPEN',
                      tableId: row.table.id,
                      body: {
                        locationId: props.locationId,
                        requestKey: crypto.randomUUID(),
                        guestCount: Number(guests),
                      },
                    });
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
                  <Button type="submit" disabled={blocked}>
                    {text.open}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={operation.busy || operation.recovering}
                    onClick={() => setOpening(undefined)}
                  >
                    {text.cancel}
                  </Button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="inline">
        {cursor && (
          <Button disabled={blocked} variant="secondary" onClick={() => setCursor(undefined)}>
            {text.back}
          </Button>
        )}
        {list.data?.nextCursor && (
          <Button disabled={blocked} onClick={() => setCursor(list.data!.nextCursor!)}>
            {text.more}
          </Button>
        )}
      </div>
    </div>
  );
}
