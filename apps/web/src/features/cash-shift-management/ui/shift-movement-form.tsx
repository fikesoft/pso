import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { cashMovementCreateSchema } from '@pos/contracts/cash-movements';
import { cashMovementMessages as text } from '@pos/ui/locales';
import type { ShiftMovementFormProps } from '../model/shift-management.types';
export function ShiftMovementForm({ detail, direction, command }: ShiftMovementFormProps) {
  const [amount, setAmount] = useState(''),
    [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const title = direction === 'IN' ? text.enter : text.withdraw;
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (command.locked || (direction === 'OUT' && !confirmed)) return;
        const parsed = cashMovementCreateSchema.safeParse({
          locationId: detail.shift.locationId,
          version: detail.shift.version,
          requestKey: crypto.randomUUID(),
          direction,
          amount,
          reason,
        });
        if (!parsed.success) {
          setError(text.invalid);
          return;
        }
        setError('');
        void command.send({
          kind: direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
          shiftId: detail.shift.id,
          body: parsed.data,
        });
      }}
    >
      <p>{text.hint}</p>
      {error && <Notice>{error}</Notice>}
      <fieldset className="operation-fields" disabled={command.locked}>
        <Field
          label={text.amount}
          required
          inputMode="decimal"
          pattern="[0-9]+([.][0-9]{1,2})?"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
        />
        <Field
          label={text.reason}
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {direction === 'OUT' && (
          <label className="check-option">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{text.confirm}</span>
          </label>
        )}
      </fieldset>
      <div className="form-footer">
        <Button
          type="submit"
          busy={command.busy}
          disabled={command.locked || (direction === 'OUT' && !confirmed)}
        >
          {title}
        </Button>
      </div>
    </form>
  );
}
