import { OwnShiftSelector } from '../../../entities/cash-shift';
import { Button, Field, Notice, Select } from '@pos/ui';
import { checkoutMessages as text, operationalMessages } from '@pos/ui/locales';
import type { PaymentMethod } from '@pos/contracts';
import type { CheckoutFormProps } from '../model/checkout.types';
import { CHECKOUT_MONEY_PATTERN } from '../config/checkout.constants';
export function CheckoutForm({ model, total, currency }: CheckoutFormProps) {
  const demo = model.mode === 'DEMO';
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void model.submit();
      }}
    >
      <Notice tone="info">{demo ? text.demoHint : text.manualHint}</Notice>
      <p className="operation-total">
        <span>{text.total}</span>
        <strong>
          {total} {currency}
        </strong>
      </p>
      {!demo && <OwnShiftSelector model={model.shift} disabled={model.locked || model.stale} />}
      <fieldset className="operation-fields" disabled={model.locked || model.stale}>
        {!demo && (
          <>
            <Select
              label={text.method}
              value={model.method}
              onChange={(event) => model.setMethod(event.target.value as PaymentMethod)}
            >
              <option value="CASH">{text.cash}</option>
              <option value="CARD">{text.card}</option>
            </Select>
            {model.method === 'CASH' && (
              <Field
                label={text.received}
                inputMode="decimal"
                required
                pattern={CHECKOUT_MONEY_PATTERN}
                value={model.receivedAmount}
                onChange={(event) => model.setReceivedAmount(event.target.value.replace(',', '.'))}
                hint={text.receivedHint}
              />
            )}
          </>
        )}
        <label className="check-option">
          <input
            type="checkbox"
            checked={model.confirmed}
            onChange={(event) => model.setConfirmed(event.target.checked)}
          />
          <span>{demo ? text.confirmDemo : text.confirmManual}</span>
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
            disabled={model.busy || model.loading}
            onClick={() => void model.reconcile()}
          >
            {operationalMessages.refresh}
          </Button>
        )}
        <Button
          type="submit"
          busy={model.busy}
          disabled={
            model.loading ||
            model.stale ||
            !model.confirmed ||
            (!demo && !model.uncertain && (!model.shift.selected || model.shift.loading)) ||
            model.recovery.busy
          }
        >
          {model.uncertain ? operationalMessages.retry : demo ? text.submitDemo : text.submitManual}
        </Button>
      </div>
    </form>
  );
}
