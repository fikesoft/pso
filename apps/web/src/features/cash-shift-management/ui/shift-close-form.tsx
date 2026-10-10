import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { cashShiftCloseSchema } from '@pos/contracts/cash-shifts';
import { cashShiftMessages as text } from '@pos/ui/locales';
import { cashAmountsDiffer } from '../lib/cash-difference';
import type { ShiftCloseFormProps } from '../model/shift-management.types';
export function ShiftCloseForm({ detail, actorUserId, command }: ShiftCloseFormProps) {
  const [counted, setCounted] = useState(''),
    [reason, setReason] = useState(''),
    [managerReason, setManagerReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const other = actorUserId !== detail.shift.ownerUserId;
  const difference = cashAmountsDiffer(counted, detail.summary.expectedCash);
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (command.locked || !confirmed) return;
        const parsed = cashShiftCloseSchema.safeParse({
          locationId: detail.shift.locationId,
          version: detail.shift.version,
          requestKey: crypto.randomUUID(),
          countedCash: counted,
          ...(reason.trim() ? { discrepancyReason: reason } : {}),
          ...(managerReason.trim() ? { managerReason } : {}),
        });
        if (!parsed.success || (difference && !reason.trim()) || (other && !managerReason.trim())) {
          setError(text.invalid);
          return;
        }
        setError('');
        void command.send({ kind: 'CLOSE', shiftId: detail.shift.id, body: parsed.data });
      }}
    >
      <p>{text.closeHint}</p>
      {error && <Notice>{error}</Notice>}
      <p>
        {text.expectedCash}: <strong>{detail.summary.expectedCash} MDL</strong>
      </p>
      <fieldset className="operation-fields" disabled={command.locked}>
        <Field
          label={text.counted}
          value={counted}
          required
          inputMode="decimal"
          pattern="[0-9]+([.][0-9]{1,2})?"
          onChange={(event) => setCounted(event.target.value.replace(',', '.'))}
        />
        <Field
          label={text.differenceReason}
          value={reason}
          required={difference}
          minLength={3}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
        {other && (
          <Field
            label={text.managerReason}
            value={managerReason}
            required
            minLength={3}
            maxLength={500}
            onChange={(event) => setManagerReason(event.target.value)}
          />
        )}
        <label className="check-option">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>{text.confirmClose}</span>
        </label>
      </fieldset>
      <div className="form-footer">
        <Button type="submit" busy={command.busy} disabled={command.locked || !confirmed}>
          {text.close}
        </Button>
      </div>
    </form>
  );
}
