import { Button, Field, Notice } from '@pos/ui';
import { operationalMessages as text, repeatMessages } from '@pos/ui/locales';
import type { OrderLifecycleActionsProps } from '../model/order-entry.types';

export function OrderLifecycleActions({
  model,
  canEdit,
  checkoutLocked,
  editing,
}: OrderLifecycleActionsProps) {
  const order = model.selected!;
  const draft = order.status === 'DRAFT';
  const cancellable = draft
    ? canEdit
    : model.canCancel && order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const canSend =
    canEdit && (draft || order.status === 'CONFIRMED') && order.kitchenStatus === 'NOT_SENT';
  const locked = model.busy || checkoutLocked || model.staleAction;
  const unknown = model.uncertainAction;
  return (
    <>
      {model.staleAction && <Notice tone="info">{text.stale}</Notice>}
      {order.status === 'CONFIRMED' && order.kitchenStatus === 'NOT_SENT' && (
        <p className="scope-hint">{text.confirmedUnsent}</p>
      )}
      {model.canComplete && order.status === 'READY' && (
        <p className="scope-hint">{text.completeHint}</p>
      )}
      {model.confirmCancel && (
        <>
          <Notice tone="info">{draft ? text.cancelHint : text.cancelConfirmedHint}</Notice>
          {!draft && (
            <Field
              label={text.cancelReason}
              value={model.cancelReason}
              maxLength={500}
              disabled={locked || !!unknown}
              onChange={(event) => model.setCancelReason(event.target.value)}
            />
          )}
        </>
      )}
      <div className="form-footer">
        {canEdit && editing && model.canRead && !draft && (
          <Button
            variant="secondary"
            disabled={locked || !!unknown || editing.repeatBlocked}
            onClick={() => {
              if (!locked && !unknown && !editing.repeatBlocked) editing.repeat(order);
            }}
          >
            {repeatMessages.repeat}
          </Button>
        )}
        <Button
          variant="secondary"
          busy={model.busy}
          disabled={checkoutLocked || !!unknown}
          onClick={() => void model.reloadSelected()}
        >
          {text.refresh}
        </Button>
        {canEdit && editing && draft && (
          <Button
            variant="ghost"
            disabled={locked || !!unknown}
            onClick={() => {
              model.setSelected(null);
              editing.edit(order);
            }}
          >
            {text.editOrder}
          </Button>
        )}
        {cancellable && (
          <Button
            variant="danger"
            disabled={
              locked ||
              !!unknown ||
              (model.confirmCancel && !draft && model.cancelReason.trim().length < 3)
            }
            onClick={() =>
              model.confirmCancel ? void model.act('cancel') : model.setConfirmCancel(true)
            }
          >
            {model.confirmCancel
              ? draft
                ? text.confirmCancel
                : text.confirmCancelOrder
              : draft
                ? text.cancelOrder
                : text.cancelConfirmedOrder}
          </Button>
        )}
        {canEdit && draft && (
          <Button
            variant="secondary"
            busy={model.busy}
            disabled={checkoutLocked || !!unknown || model.staleAction}
            onClick={() => void model.act('confirm')}
          >
            {text.confirmOrder}
          </Button>
        )}
        {canSend && (
          <Button
            busy={model.busy}
            disabled={checkoutLocked || !!unknown || model.staleAction}
            onClick={() => void model.act('send')}
          >
            {text.sendKitchen}
          </Button>
        )}
        {model.canComplete && order.status === 'READY' && (
          <Button
            variant="secondary"
            busy={model.busy}
            disabled={checkoutLocked || !!unknown || model.staleAction}
            onClick={() => void model.act('complete')}
          >
            {text.completeOrder}
          </Button>
        )}
        {unknown && (
          <Button
            busy={model.busy}
            disabled={checkoutLocked}
            onClick={() => void model.act(unknown)}
          >
            {text.retry}
          </Button>
        )}
      </div>
    </>
  );
}
