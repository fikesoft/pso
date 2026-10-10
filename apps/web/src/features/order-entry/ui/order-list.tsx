import { orderSearchMessages } from '@pos/ui/locales';
import { tenantLocale } from '../../../shared/config';
import { Badge, Button } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import {
  SERVICE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
} from '../../../shared/config/operations.constants';
import type { OrderListProps } from '../model/order-entry.types';
import { CheckoutStatus } from './checkout-status';
export function OrderList({ orders, timezone, canEdit, busy, onOpen, onEdit }: OrderListProps) {
  return (
    <div className="operation-order-list">
      {orders.map((order) => (
        <article className="operation-order-card" key={order.id}>
          <div className="operation-card-heading">
            <h3>
              {text.orderNumber} #{order.number}
            </h3>
            <Badge
              tone={
                order.status === 'DRAFT'
                  ? 'warning'
                  : order.status === 'READY'
                    ? 'success'
                    : 'neutral'
              }
            >
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
          </div>
          <p>
            {orderSearchMessages.createdAt}:{' '}
            <time dateTime={order.createdAt}>
              {timezone
                ? new Date(order.createdAt).toLocaleString(tenantLocale, { timeZone: timezone })
                : order.createdAt}
            </time>
          </p>
          {order.customer?.name && (
            <p>
              {orderSearchMessages.customerName}: {order.customer.name}
            </p>
          )}
          {order.customer?.phone && (
            <p>
              {orderSearchMessages.customerPhone}: {order.customer.phone}
            </p>
          )}
          {order.checkout && <CheckoutStatus mode={order.checkout.mode} />}
          <p>{order.source ? ORDER_SOURCE_LABELS[order.source] : text.sourceUnknown}</p>
          <p>
            {SERVICE_LABELS[order.serviceType]}
            {order.tableLabel ? ` · ${text.table} ${order.tableLabel}` : ''}
          </p>
          <div className="operation-card-footer">
            <strong>
              {order.total} {order.currency}
            </strong>
            <div className="inline">
              <Button variant="secondary" disabled={busy} onClick={() => onOpen(order)}>
                {text.selectOrder}
              </Button>
              {canEdit && order.status === 'DRAFT' && (
                <Button variant="ghost" disabled={busy} onClick={() => onEdit(order)}>
                  {text.edit}
                </Button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
