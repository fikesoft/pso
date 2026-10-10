import { Field, Select } from '@pos/ui';
import { paymentMessages as text } from '@pos/ui/locales';
import type { CollectionMethod, PaymentFormProps } from '../model/payments.types';
import { CHECKOUT_MONEY_PATTERN } from '../config/checkout.constants';

export function PaymentCollectionFields({ model }: PaymentFormProps) {
  const form = model.form!;
  return (
    <>
      <Select
        label={text.method}
        value={form.method}
        onChange={(event) => {
          const method = event.target.value as CollectionMethod;
          model.patchForm({
            method,
            ...(method === 'MIXED' ? { cashAmount: '', cardAmount: '' } : {}),
          });
        }}
      >
        <option value="CASH">{text.cash}</option>
        <option value="CARD">{text.card}</option>
        <option value="MIXED">{text.mixed}</option>
      </Select>
      {form.method !== 'CARD' && (
        <>
          <Field
            label={text.cashAmount}
            required
            inputMode="decimal"
            pattern={CHECKOUT_MONEY_PATTERN}
            value={form.cashAmount}
            onChange={(event) =>
              model.patchForm({ cashAmount: event.target.value.replace(',', '.') })
            }
          />
          <Field
            label={text.received}
            required
            inputMode="decimal"
            pattern={CHECKOUT_MONEY_PATTERN}
            value={form.receivedAmount}
            onChange={(event) =>
              model.patchForm({ receivedAmount: event.target.value.replace(',', '.') })
            }
          />
        </>
      )}
      {form.method !== 'CASH' && (
        <Field
          label={text.cardAmount}
          required
          inputMode="decimal"
          pattern={CHECKOUT_MONEY_PATTERN}
          value={form.cardAmount}
          onChange={(event) =>
            model.patchForm({ cardAmount: event.target.value.replace(',', '.') })
          }
        />
      )}
    </>
  );
}
