import { ORDER_STATUS_LABELS } from '../../../shared/config/operations.constants';
import { useCallback, useEffect, useState } from 'react';
import { Button, Loading, Notice, Select } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import { readVisitOrders } from '../../../entities/table';
import { useRemoteData, useInvalidation, useCoalescedInvalidation } from '../../../shared/lib';
import type { VisitPanelProps } from '../model/table-service.types';
export function VisitOrders(props: VisitPanelProps) {
  const [cursor, setCursor] = useState<string>();
  const [statusGroup, setStatusGroup] = useState<'ALL' | 'ACTIVE'>('ALL');
  const list = useRemoteData(
    useCallback(
      () =>
        readVisitOrders(props.api, props.id, {
          locationId: props.locationId,
          statusGroup,
          cursor,
          limit: 50,
        }),
      [props.api, props.id, props.locationId, statusGroup, cursor],
    ),
  );
  const signal = useInvalidation(`orders:${props.locationId}`);
  useCoalescedInvalidation(signal, async () => {
    await list.refresh();
  });
  useEffect(() => {
    void list.refresh();
  }, [props.refreshToken, list.refresh]);
  return (
    <section className="form-stack">
      <h3>{text.orders}</h3>
      <Select
        label={text.orderStatus}
        value={statusGroup}
        disabled={props.blocked}
        onChange={(e) => {
          setCursor(undefined);
          setStatusGroup(e.target.value as 'ALL' | 'ACTIVE');
        }}
      >
        <option value="ALL">{text.allOrders}</option>
        <option value="ACTIVE">{text.activeOrders}</option>
      </Select>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && <Loading />}
      {!list.error && !list.loading && !list.data?.orders.length && <p>{text.emptyOrders}</p>}
      {!list.error &&
        list.data?.orders.map((order) => (
          <article className="operation-order-card" key={order.id}>
            <h4>
              #{order.number} · {order.total} {order.currency}
            </h4>
            <p>{ORDER_STATUS_LABELS[order.status]}</p>
            <Button
              disabled={props.blocked || list.loading}
              onClick={() => props.onOrder(order.id)}
            >
              {text.orderDetails}
            </Button>
          </article>
        ))}
      <div className="inline">
        <Button
          variant="secondary"
          disabled={props.blocked || list.loading}
          onClick={() => void list.refresh()}
        >
          {text.refreshVisit}
        </Button>
        {list.data?.nextCursor && (
          <Button
            disabled={props.blocked || list.loading}
            onClick={() => setCursor(list.data!.nextCursor!)}
          >
            {text.moreOrders}
          </Button>
        )}
      </div>
    </section>
  );
}
