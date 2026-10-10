import { useState } from 'react';
import type { BillSplitPreviewDto, BillSplitPreviewRequest } from '@pos/contracts/bill-splits';
import { billSplitPreviewSchema } from '@pos/contracts/bill-splits';
import { errorMessage } from '@pos/ui/api';
import { billSplitMessages as text } from '@pos/ui/locales';
import { previewBillSplit } from '../../../entities/bill-split';
import type { BillFormProps } from './bill-service.types';

export function useBillItemsForm(props: BillFormProps) {
  const [source, setSource] = useState<BillSplitPreviewDto>();
  const [preview, setPreview] = useState<BillSplitPreviewDto>();
  const [request, setRequest] = useState<BillSplitPreviewRequest>();
  const [count, setCount] = useState('2');
  const [quantities, setQuantities] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const locked = props.disabled || props.operation.locked || busy;
  function invalidate() {
    setPreview(undefined);
    setConfirmed(false);
  }
  function changeCount(value: string) {
    setCount(value);
    setQuantities({});
    invalidate();
  }
  function changeQuantity(id: string, position: number, value: string) {
    setQuantities((current) => {
      const values = [...(current[id] ?? [])];
      values[position] = value;
      return { ...current, [id]: values };
    });
    invalidate();
  }
  async function load() {
    setBusy(true);
    setError('');
    invalidate();
    setSource(undefined);
    setQuantities({});
    try {
      setSource(
        await previewBillSplit(props.api, {
          locationId: props.locationId,
          context: props.context,
          selection: 'UNPLANNED',
          division: { mode: 'EQUAL', count: 2 },
        }),
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const partCount = Number(count);
  const validCount = Number.isInteger(partCount) && partCount >= 2 && partCount <= 50;
  async function calculate() {
    invalidate();
    setError('');
    if (!source || !validCount) {
      setError(text.invalid);
      return;
    }
    const parsed = billSplitPreviewSchema.safeParse({
      locationId: props.locationId,
      context: props.context,
      selection: 'UNPLANNED',
      division: {
        mode: 'ITEMS',
        parts: Array.from({ length: partCount }, (_, position) => ({
          items: source
            .sourceItems!.map((item) => ({
              orderItemId: item.orderItemId,
              quantity: (quantities[item.orderItemId]?.[position] ?? '').trim().replace(',', '.'),
            }))
            .filter((item) => item.quantity !== '' && !/^0(?:\.0+)?$/.test(item.quantity)),
        })),
      },
    });
    if (!parsed.success) {
      setError(text.invalidItems);
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
  function save() {
    if (locked || !confirmed || !preview || !request) return;
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
  }
  return {
    source,
    preview,
    count,
    quantities,
    busy,
    error,
    confirmed,
    locked,
    partCount,
    validCount,
    changeCount,
    changeQuantity,
    load,
    calculate,
    save,
    setConfirmed,
  };
}
