import { Badge, Button } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { CourierWorkCardProps } from '../model/courier-work.types';
export function CourierWorkCard({ order, onOpen }: CourierWorkCardProps) {
  return (
    <article className="panel panel-body form-stack">
      <div className="operation-card-heading">
        <h3>
          {text.order} #{order.number}
        </h3>
        <Badge>{text.statuses[order.deliveryStatus]}</Badge>
      </div>
      <p>{order.deliveryAddress?.address ?? text.noAddress}</p>
      {order.acceptedAt && <Badge>{text.accepted}</Badge>}
      <strong>
        {text.outstanding}: {order.outstandingAmount} {order.currency}
      </strong>
      <p>
        {text.total}: {order.total} {order.currency}
      </p>
      <Button variant="secondary" onClick={onOpen}>
        {text.details}
      </Button>
    </article>
  );
}
