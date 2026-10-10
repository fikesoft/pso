import { Button } from '@pos/ui';
import { checkoutMessages as text } from '@pos/ui/locales';
import type { CheckoutActionsProps } from '../model/checkout.types';
export function CheckoutActions({
  model,
  order,
  canDemo,
  canCollect,
  disabled,
}: CheckoutActionsProps) {
  const locked = model.locked || disabled;
  return (
    <>
      {(order.status === 'CONFIRMED' || order.status === 'IN_PROGRESS') && !model.eligible && (
        <p className="scope-hint">{text.eligibleHint}</p>
      )}
      {order.status === 'COMPLETED' &&
        !order.checkout &&
        order.paymentSummary.collectedAmount === '0.00' && (
          <p className="scope-hint">{text.completedWithoutCheckout}</p>
        )}
      {order.status === 'COMPLETED' && order.checkout && (
        <Button
          variant="secondary"
          disabled={locked}
          onClick={() => (model.receipt ? model.setShowReceipt(true) : void model.reconcile())}
        >
          {text.receipt}
        </Button>
      )}
      {model.eligible && (
        <div className="form-footer">
          {canDemo && (
            <Button variant="secondary" disabled={locked} onClick={() => model.begin('DEMO')}>
              {text.demo}
            </Button>
          )}
          <Button disabled={locked || !canCollect} onClick={() => model.begin('MANUAL')}>
            {text.manual}
          </Button>
        </div>
      )}
      {model.eligible && !canCollect && <p className="scope-hint">{text.permissionHint}</p>}
    </>
  );
}
