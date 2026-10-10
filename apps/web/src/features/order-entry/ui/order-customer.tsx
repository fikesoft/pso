import { orderSearchMessages as text } from '@pos/ui/locales';
import type { OrderSummaryProps } from '../model/order-entry.types';
export function OrderCustomer({ order }: OrderSummaryProps) {
  if (order.customer === undefined) return null;
  return (
    <section aria-label={text.customer} className="order-draft-item">
      {order.customer === null || (!order.customer.name && !order.customer.phone) ? (
        <p>{text.noCustomer}</p>
      ) : (
        <>
          {order.customer.name && (
            <p>
              {text.customerName}: {order.customer.name}
            </p>
          )}
          {order.customer.phone && (
            <p>
              {text.customerPhone}: {order.customer.phone}
            </p>
          )}
        </>
      )}
    </section>
  );
}
