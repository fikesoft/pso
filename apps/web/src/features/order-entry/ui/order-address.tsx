import { addressMessages as text } from '@pos/ui/locales';
import type { OrderSummaryProps } from '../model/order-entry.types';
export function OrderAddress({ order }: OrderSummaryProps) {
  if (order.serviceType !== 'DELIVERY' || order.deliveryAddress === undefined) return null;
  return (
    <section className="order-draft-item" aria-label={text.title}>
      {order.deliveryAddress ? (
        <>
          <strong>{text.title}</strong>
          <p>{order.deliveryAddress.address}</p>
          {order.deliveryAddress.instructions && <p>{order.deliveryAddress.instructions}</p>}
        </>
      ) : (
        <p>{text.noSnapshot}</p>
      )}
    </section>
  );
}
