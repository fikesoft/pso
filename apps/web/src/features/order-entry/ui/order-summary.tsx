import { OrderAddress } from './order-address';
import { OrderCustomer } from './order-customer';
import { Badge } from '@pos/ui';
import { packingMessages, deliveryZoneMessages } from '@pos/ui/locales';
import { operationalMessages as text, kitchenCourseMessages as courses } from '@pos/ui/locales';
import {
  SERVICE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
} from '../../../shared/config/operations.constants';
import type { OrderSummaryProps } from '../model/order-entry.types';
import { CheckoutStatus } from './checkout-status';
import { ModifierSnapshot } from '../../../entities/modifier';
import { TaxSnapshot } from '../../../entities/order';
export function OrderSummary({ order }: OrderSummaryProps) {
  return (
    <>
      <div className="inline">
        <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
        {order.packingStatus !== 'NOT_REQUIRED' && (
          <Badge>
            {packingMessages.title}: {packingMessages.statuses[order.packingStatus]}
          </Badge>
        )}
        {order.checkout && <CheckoutStatus mode={order.checkout.mode} />}
        <span>
          {SERVICE_LABELS[order.serviceType]} {order.tableLabel}
        </span>
      </div>
      <OrderCustomer order={order} />
      <OrderAddress order={order} />
      {order.notes && <p>{order.notes}</p>}
      <p>
        {text.orderSource}: {order.source ? ORDER_SOURCE_LABELS[order.source] : text.sourceUnknown}
      </p>
      <div className="order-draft-items">
        {order.items.map((item) => (
          <article className="order-draft-item" key={item.id}>
            <div className="operation-card-heading">
              <strong>
                {item.quantity} × {item.productName}
              </strong>
              <span>{item.lineTotal} MDL</span>
            </div>
            <ModifierSnapshot groups={item.modifierGroups} />
            <TaxSnapshot rate={item.taxRateSnapshot} />
            {item.courseNumber > 0 && <p>{courses.labels[item.courseNumber]}</p>}
            {item.note && <p>{item.note}</p>}
          </article>
        ))}
      </div>
      {order.serviceType === 'DELIVERY' && (
        <p>
          {deliveryZoneMessages.fee}: {order.deliveryFee} {order.currency}
        </p>
      )}
      <p className="operation-total">
        <span>{text.serverTotal}</span>
        <strong>
          {order.total} {order.currency}
        </strong>
      </p>
    </>
  );
}
