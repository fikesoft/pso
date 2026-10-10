import { BillItemsForm } from './bill-items-form';
import { useState } from 'react';
import { Button, Field, Notice, Select } from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import { billSplitMessages as text } from '@pos/ui/locales';
import { billSplitPreviewSchema } from '@pos/contracts/bill-splits';
import type { BillSplitPreviewDto, BillSplitPreviewRequest } from '@pos/contracts/bill-splits';
import { previewBillSplit } from '../../../entities/bill-split';
import type { BillFormProps } from '../model/bill-service.types';
export function BillPlanForm(props: BillFormProps) {
  const [mode, setMode] = useState('EQUAL'),
    [count, setCount] = useState('2'),
    [amounts, setAmounts] = useState('');
  const [preview, setPreview] = useState<BillSplitPreviewDto>();
  const [request, setRequest] = useState<BillSplitPreviewRequest>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const locked = props.disabled || props.operation.locked || busy;
  async function load() {
    setError('');
    setPreview(undefined);
    setConfirmed(false);
    const parsed = billSplitPreviewSchema.safeParse({
      locationId: props.locationId,
      context: props.context,
      selection: 'UNPLANNED',
      division:
        mode === 'EQUAL'
          ? { mode, count: Number(count) }
          : { mode, amounts: amounts.split(';').map((value) => value.trim().replace(',', '.')) },
    });
    if (!parsed.success) {
      setError(text.invalid);
      return;
    }
    setBusy(true);
    try {
      setPreview(await previewBillSplit(props.api, parsed.data));
      setRequest(parsed.data);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  if (mode === 'ITEMS') return <BillItemsForm {...props} onAmounts={() => setMode('EQUAL')} />;
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (preview && request && confirmed)
          void props.operation.send({
            family: 'PLAN',
            kind: 'CREATE',
            body: {
              ...request,
              requestKey: crypto.randomUUID(),
              confirmed: true,
              ...(preview.visitVersion !== undefined ? { visitVersion: preview.visitVersion } : {}),
              sources: preview.sources.map(({ orderId, version }) => ({ orderId, version })),
            },
          });
      }}
    >
      {error && <Notice>{error}</Notice>}
      <fieldset
        className="operation-fields"
        disabled={locked}
        onChange={() => {
          setPreview(undefined);
          setConfirmed(false);
        }}
      >
        <Select label={text.mode} value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="EQUAL">{text.equal}</option>
          <option value="CUSTOM">{text.custom}</option>
          <option value="ITEMS">{text.items}</option>
        </Select>
        {mode === 'EQUAL' ? (
          <Field
            label={text.count}
            type="number"
            min={2}
            max={50}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        ) : (
          <Field
            label={text.amounts}
            value={amounts}
            onChange={(event) => setAmounts(event.target.value)}
          />
        )}
      </fieldset>
      <Button type="button" disabled={locked} busy={busy} onClick={() => void load()}>
        {text.preview}
      </Button>
      {preview && (
        <>
          <p>
            {text.total}: <strong>{preview.total} MDL</strong>
          </p>
          {preview.sources.map((source) => (
            <p key={source.orderId}>
              {text.source} #{source.number}: {source.amount} MDL
            </p>
          ))}
          {preview.parts.map((part) => (
            <p key={part.position}>
              {text.part} {part.position}: <strong>{part.amount} MDL</strong>
            </p>
          ))}
          <label className="check-option">
            <input
              type="checkbox"
              disabled={locked}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{text.confirm}</span>
          </label>
          <Button type="submit" disabled={locked || !confirmed}>
            {text.save}
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={props.operation.busy || props.operation.recovering || busy}
        onClick={props.onClose}
      >
        {text.cancel}
      </Button>
    </form>
  );
}
