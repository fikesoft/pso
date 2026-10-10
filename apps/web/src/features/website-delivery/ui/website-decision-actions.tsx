import { Button, Field, Notice } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteDecisionActionsProps } from '../model/website-delivery.types';
export function WebsiteDecisionActions({
  model,
  canDecide,
  onOpenOrders,
}: WebsiteDecisionActionsProps) {
  const order = model.details.data;
  if (!order) return null;
  if (order.status === 'ACCEPTED')
    return (
      <>
        <Notice tone="success">{text.acceptedHint}</Notice>
        <div className="form-footer">
          <Button onClick={onOpenOrders}>{text.openOrders}</Button>
        </div>
      </>
    );
  if (order.status === 'REJECTED') return null;
  if (!canDecide) return <Notice tone="info">{text.noDecisionPermission}</Notice>;
  const disabled = model.busy || model.uncertain || model.stale || model.details.loading;
  return (
    <>
      {model.uncertain ? (
        <div className="form-footer">
          <Button busy={model.busy} disabled={model.details.loading} onClick={model.retry}>
            {text.retry}
          </Button>
        </div>
      ) : model.rejecting ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void model.submit('reject');
          }}
        >
          <Field
            label={text.rejectionReason}
            required
            minLength={3}
            maxLength={500}
            disabled={disabled}
            value={model.reason}
            onChange={(event) => model.setReason(event.target.value)}
          />
          <div className="form-footer">
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() => model.setRejecting(false)}
            >
              {text.back}
            </Button>
            <Button type="submit" variant="danger" busy={model.busy} disabled={disabled}>
              {text.confirmReject}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p>{text.acceptHint}</p>
          <div className="form-footer">
            <Button variant="danger" disabled={disabled} onClick={() => model.setRejecting(true)}>
              {text.reject}
            </Button>
            <Button
              busy={model.busy}
              disabled={disabled}
              onClick={() => void model.submit('accept')}
            >
              {text.accept}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
