import { CashRecovery } from '../../../entities/cash-command';
import { Button, Modal, Notice } from '@pos/ui';
import { orderLiveMessages as text } from '@pos/ui/locales';
import type { OrderBlockedProps } from '../model/order-blocked.types';
import { DeliveryFeeRecovery } from './delivery-fee-recovery';
export function OrderBlocked({
  model,
  checkout,
  payments,
  delivery,
  fees,
  recoveryExtension,
}: OrderBlockedProps) {
  const busy =
    model.busy ||
    checkout.busy ||
    payments.busy ||
    delivery.busy ||
    fees.busy ||
    fees.command.busy ||
    model.selection.busy;
  const unknown =
    model.financial.blocked ||
    !!model.uncertainAction ||
    checkout.uncertain ||
    payments.uncertain ||
    delivery.uncertain ||
    fees.command.recovering;
  return (
    <Modal
      open
      title={text.blockedTitle}
      description={text.blocked}
      onOpenChange={(open) => {
        if (!open && !busy && !unknown && !model.externalBlocked()) model.setSelected(null);
      }}
    >
      <CashRecovery model={model.financial} />
      {recoveryExtension}
      <DeliveryFeeRecovery model={fees} disabled={busy || model.externalBlocked()} />
      {model.selection.error && <Notice>{model.selection.error}</Notice>}
      <div className="form-footer">
        <Button
          busy={model.selection.busy}
          disabled={busy}
          onClick={() => void model.selection.refresh()}
        >
          {text.restore}
        </Button>
        {model.uncertainAction && (
          <Button disabled={busy} onClick={() => void model.act(model.uncertainAction!)}>
            {text.retryOrder}
          </Button>
        )}
        {checkout.uncertain && (
          <Button disabled={busy} onClick={() => void checkout.submit()}>
            {text.retryCheckout}
          </Button>
        )}
        {payments.uncertain && (
          <Button disabled={busy} onClick={() => void payments.submit()}>
            {text.retryPayment}
          </Button>
        )}
        {delivery.uncertain && (
          <Button disabled={busy} onClick={() => void delivery.submit(delivery.form.status)}>
            {text.retryDelivery}
          </Button>
        )}
      </div>
    </Modal>
  );
}
