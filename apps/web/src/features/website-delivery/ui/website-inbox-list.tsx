import { Badge, Button } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import { WEBSITE_STATUS_LABELS } from '../config/website-delivery.constants';
import { websiteDate } from '../lib/website-presentation';
import type { WebsiteInboxListProps } from '../model/website-delivery.types';
export function WebsiteInboxList({ orders, onOpen }: WebsiteInboxListProps) {
  return (
    <div className="website-delivery-grid">
      {orders.map((order) => (
        <article key={order.id} className="website-card">
          <div className="operation-card-heading">
            <h3>{order.externalOrderId}</h3>
            <Badge
              tone={
                order.status === 'ACCEPTED'
                  ? 'success'
                  : order.status === 'REJECTED'
                    ? 'danger'
                    : 'warning'
              }
            >
              {WEBSITE_STATUS_LABELS[order.status]}
            </Badge>
          </div>
          <p>{order.connectionName}</p>
          <p>
            {text.receivedAt}: {websiteDate(order.receivedAt)}
          </p>
          <p>
            <strong>
              {order.total} {order.currency}
            </strong>
          </p>
          <Button variant="secondary" onClick={() => onOpen(order.id)}>
            {text.details}
          </Button>
        </article>
      ))}
    </div>
  );
}
