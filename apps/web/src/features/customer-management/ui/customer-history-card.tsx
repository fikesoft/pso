import {
  customerHistoryMessages as text,
  operationalMessages,
  deliveryZoneMessages,
} from '@pos/ui/locales';
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  SERVICE_LABELS,
} from '../../../shared/config/operations.constants';
import { tenantLocale, defaultTimezone } from '../../../shared/config';
import type { CustomerHistoryCardProps } from '../model/customer-history.types';
import styles from './address-card.module.css';

export function CustomerHistoryCard({ order }: CustomerHistoryCardProps) {
  return (
    <article
      className={`panel panel-body form-stack ${styles.card}`}
      aria-label={`${text.order} #${order.number}`}
    >
      <strong>
        {text.order} #{order.number} · {ORDER_STATUS_LABELS[order.status]}
      </strong>
      <time dateTime={order.createdAt}>
        {new Date(order.createdAt).toLocaleString(tenantLocale, { timeZone: defaultTimezone })}
      </time>
      <p>
        {SERVICE_LABELS[order.serviceType]} ·{' '}
        {order.source ? ORDER_SOURCE_LABELS[order.source] : operationalMessages.sourceUnknown}
      </p>
      <p>
        {text.total}: {order.total} {order.currency}
      </p>
      {order.serviceType === 'DELIVERY' && (
        <p>
          {deliveryZoneMessages.fee}: {order.deliveryFee} {order.currency}
        </p>
      )}
      <p>
        {text.netPaid}: {order.paymentSummary.netPaidAmount} {order.currency} · {text.refunded}:{' '}
        {order.paymentSummary.refundedAmount} {order.currency}
      </p>
      <p>
        {text.outstanding}: {order.paymentSummary.outstandingAmount} {order.currency}
      </p>
      <details>
        <summary>{text.details}</summary>
        <div className="form-stack">
          {order.customer && (
            <p>
              {order.customer.name} · {order.customer.phone}
            </p>
          )}
          {order.deliveryAddress && (
            <p>
              {order.deliveryAddress.address} {order.deliveryAddress.instructions}
            </p>
          )}
          {order.notes && <p>{order.notes}</p>}
          {order.items.map((item) => (
            <div key={item.id}>
              <p>
                {item.quantity} × {item.productName} · {item.lineTotal} {order.currency}
              </p>
              {item.note && <p>{item.note}</p>}
              {item.modifierGroups.map((group) => (
                <p key={group.groupId}>
                  {group.groupName}: {group.options.map((option) => option.optionName).join(', ')}
                </p>
              ))}
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}
