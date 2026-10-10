import { useLayoutEffect, useRef } from 'react';
import { OrderDetailsContent } from './order-details-content';
import { OrderBlocked } from './order-blocked';
import { useOrderDelivery } from '../model/use-order-delivery';
import { Modal } from '@pos/ui';
import { operationalMessages as text, checkoutMessages } from '@pos/ui/locales';
import type { OrderDetailsProps } from '../model/order-entry.types';
import { useOrderCheckout } from '../model/use-order-checkout';
import { useOrderPayments } from '../model/use-order-payments';
import { useOrderDeliveryFee } from '../model/use-order-delivery-fee';
export function OrderDetails({
  model,
  canEdit,
  editing,
  renderExtension,
  recoveryExtension,
}: OrderDetailsProps) {
  const order = model.selected!;
  const checkout = useOrderCheckout({
    api: model.api,
    order,
    enabled: model.canRead,
    shift: model.shift,
    recovery: model.financial,
    onUpdated: model.updated,
    isExternallyBlocked: model.externalBlocked,
  });
  const payments = useOrderPayments({
    api: model.api,
    order,
    enabled: model.canRead,
    shift: model.shift,
    recovery: model.financial,
    onUpdated: model.updated,
    isExternallyBlocked: model.externalBlocked,
  });
  const delivery = useOrderDelivery({
    api: model.api,
    order,
    enabled: model.canRead && order.serviceType === 'DELIVERY',
    onUpdated: model.updated,
    isExternallyBlocked: model.externalBlocked,
  });
  const fees = useOrderDeliveryFee({
    model,
    isBlocked: () =>
      model.externalBlocked() ||
      model.busy ||
      !!model.uncertainAction ||
      model.staleAction ||
      checkout.locked ||
      !!checkout.mode ||
      payments.locked ||
      !!payments.form ||
      delivery.locked,
  });
  const current = useRef({ checkout, payments, delivery, fees, model });
  current.current = { checkout, payments, delivery, fees, model };
  useLayoutEffect(() => {
    model.attachDetailGuard(() => {
      const value = current.current;
      return (
        value.checkout.isPending() ||
        value.payments.isPending() ||
        value.delivery.isPending() ||
        value.fees.isPending() ||
        value.fees.locked ||
        value.checkout.locked ||
        !!value.checkout.mode ||
        !!value.payments.form ||
        value.delivery.locked ||
        value.model.confirmCancel ||
        value.model.selection.blocked
      );
    });
    return () => model.attachDetailGuard(null);
  }, [model.attachDetailGuard]);
  if (model.selection.blocked)
    return (
      <OrderBlocked
        model={model}
        checkout={checkout}
        payments={payments}
        delivery={delivery}
        fees={fees}
        recoveryExtension={recoveryExtension}
      />
    );
  const receipt = checkout.showReceipt ? checkout.receipt : null;
  const title = receipt
    ? receipt.mode === 'DEMO'
      ? checkoutMessages.demoTitle
      : checkoutMessages.manualTitle
    : checkout.mode
      ? checkout.mode === 'DEMO'
        ? checkoutMessages.demo
        : checkoutMessages.manual
      : `${text.orderNumber} #${order.number}`;
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (
          !open &&
          !model.busy &&
          !checkout.busy &&
          !checkout.uncertain &&
          !payments.locked &&
          !delivery.locked &&
          !fees.locked &&
          !model.financial.blocked &&
          !model.externalBlocked()
        ) {
          model.setSelected(null);
          model.setConfirmCancel(false);
        }
      }}
      title={title}
      description={checkoutMessages.detailsHint}
    >
      <OrderDetailsContent
        model={model}
        checkout={checkout}
        payments={payments}
        delivery={delivery}
        fees={fees}
        canEdit={canEdit}
        editing={editing}
        renderExtension={renderExtension}
        recoveryExtension={recoveryExtension}
      />
    </Modal>
  );
}
