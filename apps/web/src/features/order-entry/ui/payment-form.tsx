import { OwnShiftSelector } from '../../../entities/cash-shift';
import { Button, Field, Notice } from '@pos/ui';
import { paymentMessages as text, operationalMessages } from '@pos/ui/locales';
import type { PaymentFormProps } from '../model/payments.types';
import { CHECKOUT_MONEY_PATTERN } from '../config/checkout.constants';
import { PaymentCollectionFields } from './payment-collection-fields';

export function PaymentForm({ model }: PaymentFormProps) {
  const form = model.form!;
  const refund = form.kind === 'REFUND';
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void model.submit();
      }}
    >
      <Notice tone="info">{refund ? text.refundHint : text.collectHint}</Notice>
      {model.uncertain && <Notice tone="info">{operationalMessages.retryUnknown}</Notice>}
      <OwnShiftSelector model={model.shift} disabled={model.locked || model.stale} />
      <fieldset className="operation-fields" disabled={model.locked || model.stale}>
        {refund ? (
          <>
            <p>
              {form.payment!.method === 'CASH' ? text.cash : text.card} · {text.refundable}:{' '}
              {form.payment!.refundableAmount} MDL
            </p>
            <Field
              label={text.refundAmount}
              required
              inputMode="decimal"
              pattern={CHECKOUT_MONEY_PATTERN}
              value={form.refundAmount}
              onChange={(event) =>
                model.patchForm({ refundAmount: event.target.value.replace(',', '.') })
              }
            />
            <Field
              label={text.reason}
              required
              minLength={3}
              maxLength={500}
              value={form.reason}
              onChange={(event) => model.patchForm({ reason: event.target.value })}
            />
          </>
        ) : (
          <PaymentCollectionFields model={model} />
        )}
        <label className="check-option">
          <input
            type="checkbox"
            checked={form.confirmed}
            onChange={(event) => model.patchForm({ confirmed: event.target.checked })}
          />
          <span>{refund ? text.confirmRefund : text.confirmCollect}</span>
        </label>
      </fieldset>
      <div className="form-footer">
        <Button type="button" variant="secondary" disabled={model.locked} onClick={model.back}>
          {operationalMessages.cancel}
        </Button>
        {(model.stale || model.uncertain) && (
          <Button
            type="button"
            variant="secondary"
            busy={model.busy}
            onClick={() => void model.refresh()}
          >
            {text.refresh}
          </Button>
        )}
        <Button
          type="submit"
          busy={model.busy}
          disabled={
            model.stale ||
            !form.confirmed ||
            (!model.uncertain && (!model.shift.selected || model.shift.loading)) ||
            model.recovery.busy
          }
        >
          {model.uncertain
            ? operationalMessages.retry
            : refund
              ? text.saveRefund
              : text.saveCollect}
        </Button>
      </div>
    </form>
  );
}
