import { Badge, Button } from '@pos/ui';
import {
  activeOrderMessages as text,
  deliveryMessages,
  operationalMessages,
  paymentMessages,
  cashierMessages,
  packingMessages,
} from '@pos/ui/locales';
import {
  KITCHEN_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  SERVICE_LABELS,
} from '../../../shared/config/operations.constants';
import { tenantLocale } from '../../../shared/config';
import type { ActiveOrderCardProps } from '../model/active-orders.types';
import { CheckoutStatus } from './checkout-status';
import { ActiveOrderFinancial } from './active-order-financial';
export function ActiveOrderCard({
  order,
  timezone,
  disabled,
  onOpen,
  mode = 'operator',
}: ActiveOrderCardProps) {
  return (
    <article className="operation-order-card" data-testid="active-order-card">
      <div className="operation-card-heading">
        <h3>
          {operationalMessages.orderNumber} #{order.number}
        </h3>
        <strong>
          {order.total} {order.currency}
        </strong>
      </div>
      <div className="inline">
        {order.activeReasons.map((reason) => (
          <Badge key={reason}>{text.reasons[reason]}</Badge>
        ))}
      </div>
      {mode === 'cashier' && <ActiveOrderFinancial order={order} showStatus />}
      <p>
        {SERVICE_LABELS[order.serviceType]} ·{' '}
        {order.source ? ORDER_SOURCE_LABELS[order.source] : operationalMessages.sourceUnknown}
      </p>
      <time dateTime={order.createdAt}>
        {new Date(order.createdAt).toLocaleString(tenantLocale, { timeZone: timezone })}
      </time>
      <dl className="active-order-states">
        <div>
          <dt>{text.operation}</dt>
          <dd>{ORDER_STATUS_LABELS[order.status]}</dd>
        </div>
        <div>
          <dt>{text.kitchen}</dt>
          <dd>
            {order.kitchenStatus === 'NOT_SENT'
              ? text.notSent
              : KITCHEN_STATUS_LABELS[order.kitchenStatus]}
          </dd>
        </div>
        {mode === 'operator' && (
          <div>
            <dt>{text.payment}</dt>
            <dd>{paymentMessages.statuses[order.paymentStatus]}</dd>
          </div>
        )}
        <div>
          <dt>{packingMessages.title}</dt>
          <dd>{packingMessages.statuses[order.packingStatus]}</dd>
        </div>
        <div>
          <dt>{text.delivery}</dt>
          <dd>
            {order.deliveryStatus === null
              ? deliveryMessages.historical
              : deliveryMessages.statuses[order.deliveryStatus]}
          </dd>
        </div>
      </dl>
      {order.checkout && <CheckoutStatus mode={order.checkout.mode} />}
      {mode === 'operator' && <ActiveOrderFinancial order={order} />}
      <Button variant="secondary" disabled={disabled} onClick={onOpen}>
        {mode === 'cashier' ? cashierMessages.details : operationalMessages.selectOrder}
      </Button>
    </article>
  );
}
