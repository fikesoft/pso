import { DeliveryForm } from './delivery-form';
import { Badge, Button, Loading, Notice } from '@pos/ui';
import { DELIVERY_TRANSITIONS } from '@pos/contracts/delivery';
import type { DeliveryCommand } from '@pos/contracts';
import type { OrderDeliveryProps } from '../model/delivery.types';
import { deliveryMessages as text } from '@pos/ui/locales';
export function OrderDelivery({ model, order, disabled }: OrderDeliveryProps) {
  if (order.serviceType !== 'DELIVERY') return null;
  const state = order.deliveryStatus ?? 'WAITING_COURIER';
  const rights = model.history.data;
  const eligible =
    order.status !== 'DRAFT' && order.status !== 'CANCELLED' && order.checkout?.mode !== 'DEMO';
  const ready =
    (order.status === 'READY' || order.status === 'COMPLETED') && order.kitchenStatus === 'READY';
  const options = (DELIVERY_TRANSITIONS[state] as readonly DeliveryCommand['status'][]).filter(
    (status) =>
      (rights?.canAssign ||
        (rights?.canUpdate && status !== 'ASSIGNED' && status !== 'WAITING_COURIER')) &&
      (ready || !['PICKED_UP', 'DELIVERING', 'DELIVERED'].includes(status)),
  );
  const status = options.includes(model.form.status) ? model.form.status : options[0];
  const blocked =
    disabled || model.locked || model.stale || model.history.loading || !!model.history.error;
  return (
    <section className="form-stack" aria-label={text.title}>
      <div className="operation-card-heading">
        <strong>{text.title}</strong>
        <Badge>
          {order.deliveryStatus ? text.statuses[order.deliveryStatus] : text.historical}
        </Badge>
      </div>
      <p>
        {text.courier}: {order.deliveryCourierName ?? text.unassigned}
      </p>
      {model.history.loading && <Loading />}
      {(model.error || model.history.error || model.couriers.error) && (
        <Notice>{model.error || model.history.error || model.couriers.error}</Notice>
      )}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {model.uncertain && <Notice tone="info">{text.unknown}</Notice>}
      {!eligible && <p className="scope-hint">{text.unavailable}</p>}
      {eligible && !ready && <p className="scope-hint">{text.preparation}</p>}
      {rights && !rights.canAssign && !rights.canUpdate && (
        <p className="scope-hint">{text.forbidden}</p>
      )}
      {eligible && status && !model.uncertain && (
        <DeliveryForm
          model={model}
          order={order}
          status={status}
          options={options}
          blocked={blocked}
        />
      )}
      <div className="form-footer">
        {model.uncertain && (
          <Button busy={model.busy} onClick={() => void model.submit(model.form.status)}>
            {text.retry}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={disabled || model.locked}
          onClick={() => void model.refresh()}
        >
          {text.refresh}
        </Button>
      </div>
      <strong>{text.history}</strong>
      {!model.history.loading && rights && !rights.operations.length && <p>{text.empty}</p>}
      {rights?.operations.map((operation) => (
        <div className="operation-card" key={operation.id}>
          <p>
            {operation.fromStatus ? text.statuses[operation.fromStatus] : text.historical} →{' '}
            {text.statuses[operation.toStatus]}
          </p>
          <p>
            {operation.courierName ?? text.unassigned} ·{' '}
            <time dateTime={operation.createdAt}>
              {new Date(operation.createdAt).toLocaleString('ro-MD')}
            </time>
          </p>
          {operation.reason && <p>{operation.reason}</p>}
        </div>
      ))}
      {rights?.nextCursor && (
        <Button
          variant="secondary"
          busy={model.history.loadingMore}
          onClick={() => void model.moreHistory()}
        >
          {text.moreHistory}
        </Button>
      )}
    </section>
  );
}
