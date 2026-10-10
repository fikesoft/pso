import { useState } from 'react';
import { Button, Field } from '@pos/ui';
import { billSplitMessages as text } from '@pos/ui/locales';
import type { BillVoidFormProps } from '../model/bill-service.types';
export function BillVoidForm({ split, operation, disabled }: BillVoidFormProps) {
  const [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const locked = disabled || operation.locked;
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmed || locked) return;
        void operation.send({
          family: 'PLAN',
          kind: 'VOID',
          splitId: split.id,
          body: {
            locationId: split.locationId,
            requestKey: crypto.randomUUID(),
            reason: reason.trim(),
            confirmed: true,
          },
        });
      }}
    >
      <p className="scope-hint">{text.voidHint}</p>
      <Field
        label={text.reason}
        required
        minLength={3}
        maxLength={500}
        disabled={locked}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setConfirmed(false);
        }}
      />
      <label className="check-option">
        <input
          type="checkbox"
          disabled={locked}
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>{text.confirmVoid}</span>
      </label>
      <Button
        type="submit"
        variant="secondary"
        disabled={locked || !confirmed || reason.trim().length < 3}
      >
        {text.void}
      </Button>
    </form>
  );
}
