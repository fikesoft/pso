import { Notice } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { CashRecovery } from '../../../entities/cash-command';
import type { OrderDetailsContentProps } from '../model/order-details.types';
import { Receipt } from './receipt';
import { OrderSummary } from './order-summary';
import { OrderTimeline } from './order-timeline';
import { OrderDelivery } from './order-delivery';
import { OrderPayments } from './order-payments';
import { CheckoutActions } from './checkout-actions';
import { CheckoutForm } from './checkout-form';
import { OrderLifecycleActions } from './order-lifecycle-actions';
import { OrderDeliveryFee } from './order-delivery-fee';
export function OrderDetailsContent({
  model,
  checkout,
  payments,
  delivery,
  fees,
  canEdit,
  editing,
  renderExtension,
  recoveryExtension,
}: OrderDetailsContentProps) {
  const order = model.selected!;
  const receipt = checkout.showReceipt ? checkout.receipt : null;
  return (
    <>
      <CashRecovery model={model.financial} />
      {recoveryExtension}
      {receipt ? (
        <Receipt receipt={receipt} onBack={checkout.back} />
      ) : (
        <>
          {model.error && <Notice>{model.error}</Notice>}
          {checkout.error && <Notice>{checkout.error}</Notice>}
          {checkout.statusMessage && <Notice tone="info">{checkout.statusMessage}</Notice>}
          {checkout.mode ? (
            <CheckoutForm model={checkout} total={order.total} currency={order.currency} />
          ) : (
            <>
              {model.uncertainAction && <Notice tone="info">{text.retryUnknown}</Notice>}
              <OrderSummary order={order} />
              <OrderDeliveryFee
                model={fees}
                disabled={
                  model.externalBlocked() ||
                  model.busy ||
                  !!model.uncertainAction ||
                  model.staleAction ||
                  checkout.locked ||
                  payments.locked ||
                  !!payments.form ||
                  delivery.locked
                }
              />
              <OrderTimeline
                api={model.api}
                orderId={order.id}
                locationId={order.locationId}
                version={order.version}
              />
              {renderExtension?.({
                order,
                blocked: model.isLocked(),
                refresh: model.selection.refresh,
              })}
              <OrderDelivery
                model={delivery}
                order={order}
                disabled={
                  model.externalBlocked() ||
                  model.busy ||
                  model.staleAction ||
                  !!model.uncertainAction ||
                  checkout.locked ||
                  !!payments.form ||
                  payments.locked ||
                  delivery.locked ||
                  fees.locked
                }
              />
              <OrderPayments
                model={payments}
                order={order}
                canCollect={model.canCollect}
                canRefund={model.canRefund}
                disabled={
                  model.externalBlocked() ||
                  model.busy ||
                  model.staleAction ||
                  !!model.uncertainAction ||
                  checkout.locked ||
                  delivery.locked ||
                  fees.locked
                }
              />
              <CheckoutActions
                model={checkout}
                order={order}
                canDemo={model.canCreate && model.canRead}
                canCollect={model.canCollect && model.canRead}
                disabled={
                  model.externalBlocked() ||
                  model.busy ||
                  model.staleAction ||
                  !!model.uncertainAction ||
                  !!payments.form ||
                  payments.locked ||
                  delivery.locked ||
                  fees.locked
                }
              />
              <OrderLifecycleActions
                model={model}
                canEdit={canEdit}
                editing={editing}
                checkoutLocked={
                  model.externalBlocked() ||
                  checkout.locked ||
                  !!payments.form ||
                  payments.locked ||
                  delivery.locked ||
                  fees.locked
                }
              />
            </>
          )}
        </>
      )}
    </>
  );
}
