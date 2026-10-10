import { useCallback, useState } from 'react';
import { Button, Field, Loading, Notice, Select } from '@pos/ui';
import { billSplitMessages as text } from '@pos/ui/locales';
import { billCollectionSchema } from '@pos/contracts/bill-splits';
import { previewBillPayment } from '../../../entities/bill-split';
import { OwnShiftSelector, useOwnShiftSelection } from '../../../entities/cash-shift';
import { useRemoteData } from '../../../shared/lib';
import type { BillPaymentFormProps } from '../model/bill-service.types';
export function BillPaymentForm(props: BillPaymentFormProps) {
  const preview = useRemoteData(
    useCallback(
      () => previewBillPayment(props.api, props.locationId, props.partId),
      [props.api, props.locationId, props.partId],
    ),
  );
  const shift = useOwnShiftSelection({ ...props, enabled: props.can('cash.shifts.read') });
  const [method, setMethod] = useState('CASH'),
    [received, setReceived] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const locked = props.disabled || props.operation.locked || preview.loading || !!preview.error;
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        if (!preview.data || !confirmed || !shift.selected) return;
        const parsed = billCollectionSchema.safeParse({
          locationId: props.locationId,
          requestKey: crypto.randomUUID(),
          cashShiftId: shift.selected.id,
          confirmed: true,
          amount: preview.data.outstandingAmount,
          payment:
            method === 'CASH' ? { method, receivedAmount: received.replace(',', '.') } : { method },
          sources: preview.data.sources.map(({ orderId, version }) => ({ orderId, version })),
        });
        if (!parsed.success) {
          setError(text.invalid);
          return;
        }
        void props.operation.send({
          family: 'COLLECTION',
          partId: props.partId,
          body: parsed.data,
        });
      }}
    >
      {preview.loading && <Loading />}
      {(preview.error || error) && <Notice>{preview.error || error}</Notice>}
      {preview.data && !preview.error && (
        <p>
          {text.due}: <strong>{preview.data.outstandingAmount} MDL</strong>
        </p>
      )}
      <OwnShiftSelector model={shift} disabled={locked} />
      <fieldset className="operation-fields" disabled={locked}>
        <Select
          label={text.method}
          value={method}
          onChange={(event) => {
            setMethod(event.target.value);
            setConfirmed(false);
          }}
        >
          <option value="CASH">{text.cash}</option>
          <option value="CARD">{text.card}</option>
        </Select>
        {method === 'CASH' && (
          <Field
            required
            label={text.received}
            inputMode="decimal"
            value={received}
            onChange={(event) => {
              setReceived(event.target.value);
              setConfirmed(false);
            }}
          />
        )}
        <label className="check-option">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>{text.confirmPayment}</span>
        </label>
      </fieldset>
      <Button
        type="submit"
        disabled={
          locked ||
          !confirmed ||
          !shift.selected ||
          shift.loading ||
          preview.data?.outstandingAmount === '0.00'
        }
      >
        {text.savePayment}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={props.operation.busy || props.operation.recovering}
        onClick={props.onClose}
      >
        {text.cancel}
      </Button>
    </form>
  );
}
