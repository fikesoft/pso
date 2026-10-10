import { Badge, Notice } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import { ModifierSnapshot } from '../../../entities/modifier';
import { TaxSnapshot } from '../../../entities/order';
import { WEBSITE_STATUS_LABELS } from '../config/website-delivery.constants';
import type { WebsiteOrderInfoProps } from '../model/website-delivery.types';
export function WebsiteOrderInfo({ order }: WebsiteOrderInfoProps) {
  return (
    <div className="website-order-details">
      <div className="operation-card-heading">
        <strong>{order.externalOrderId}</strong>
        <Badge>{WEBSITE_STATUS_LABELS[order.status]}</Badge>
      </div>
      <Notice tone="info">{text.privateHint}</Notice>
      <dl className="website-contact">
        <div>
          <dt>{text.customer}</dt>
          <dd>{order.customer.name}</dd>
        </div>
        <div>
          <dt>{text.phone}</dt>
          <dd>{order.customer.phone}</dd>
        </div>
        <div>
          <dt>{text.address}</dt>
          <dd>{order.delivery.address}</dd>
        </div>
        {order.delivery.instructions && (
          <div>
            <dt>{text.instructions}</dt>
            <dd>{order.delivery.instructions}</dd>
          </div>
        )}
      </dl>
      <p>{text.payment}</p>
      <div className="order-draft-items">
        {order.items.map((item) => (
          <article key={item.id} className="order-draft-item">
            <div className="operation-card-heading">
              <strong>
                {item.quantity} × {item.productName}
              </strong>
              <span>
                {item.lineTotal} {order.currency}
              </span>
            </div>
            <p>
              {item.productSku} · {item.unitPrice} {order.currency}
            </p>
            <ModifierSnapshot groups={item.modifierGroups} />
            <TaxSnapshot rate={item.taxRateSnapshot} />
            {item.note && <p>{item.note}</p>}
          </article>
        ))}
      </div>
      <p className="operation-total">
        <span>{text.total}</span>
        <strong>
          {order.total} {order.currency}
        </strong>
      </p>
      {order.rejectionReason && (
        <p>
          {text.rejectionReason}: {order.rejectionReason}
        </p>
      )}
      {order.orderId && (
        <p className="website-reference">
          {text.posOrder}: {order.orderId}
        </p>
      )}
    </div>
  );
}
