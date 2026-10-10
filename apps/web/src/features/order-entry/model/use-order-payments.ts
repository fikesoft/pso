import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaymentRecord } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { cashShiftMessages, paymentMessages as text } from '@pos/ui/locales';
import {
  collectPayment,
  readOrder,
  readPayments,
  readPaymentOperations,
  refundPayment,
} from '../../../entities/order';
import { useRemoteData } from '../../../shared/lib';
import { paymentAttempt } from './payment-attempt';
import type { OrderPaymentsInput, PaymentAttempt, PaymentFormState } from './payments.types';

export function useOrderPayments({
  api,
  order,
  enabled,
  onUpdated,
  shift,
  recovery,
  isExternallyBlocked,
}: OrderPaymentsInput) {
  const load = useCallback(async () => {
    const [payments, operations] = enabled
      ? await Promise.all([readPayments(api, order.id), readPaymentOperations(api, order.id)])
      : [null, null];
    return { payments, operations, version: order.version };
  }, [api, order.id, order.version, enabled]);
  const history = useRemoteData(load);
  const [form, setForm] = useState<PaymentFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const attempt = useRef<PaymentAttempt | null>(null);
  const pending = useRef(false);
  const unknown = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    attempt.current = null;
    unknown.current = false;
    setUncertain(false);
    setStale(false);
    setError('');
    setForm(null);
  }, [recovery.generation]);
  function begin(payment: PaymentRecord | null = null) {
    if (pending.current || unknown.current || recovery.blocked || isExternallyBlocked?.()) return;
    setError('');
    setNotice('');
    setStale(false);
    setForm({
      kind: payment ? 'REFUND' : 'COLLECT',
      method: 'CASH',
      cashAmount: order.paymentSummary.outstandingAmount,
      cardAmount: order.paymentSummary.outstandingAmount,
      receivedAmount: '',
      refundAmount: payment?.refundableAmount ?? '',
      reason: '',
      payment,
      confirmed: false,
    });
  }
  function patchForm(patch: Partial<PaymentFormState>) {
    if (!pending.current && !unknown.current && !recovery.blocked)
      setForm((current) => (current ? { ...current, ...patch } : current));
  }
  async function submit() {
    if (!form || pending.current || stale || isExternallyBlocked?.()) return;
    setError('');
    setNotice('');
    if (!attempt.current) {
      if (recovery.blocked || !shift.selected || shift.loading) {
        setError(cashShiftMessages.required);
        return;
      }
      try {
        attempt.current = paymentAttempt(
          form,
          order.version,
          crypto.randomUUID(),
          shift.selected.id,
        );
      } catch (error) {
        setError(error instanceof Error ? error.message : text.invalid);
        return;
      }
    }
    const original = attempt.current;
    pending.current = true;
    setBusy(true);
    const command = {
      kind: original.kind,
      orderId: order.id,
      locationId: order.locationId,
      requestKey: original.body.requestKey,
    };
    try {
      recovery.reserve(command);
      const response =
        original.kind === 'COLLECT'
          ? await collectPayment(api, order.id, original.body)
          : await refundPayment(api, order.id, original.body);
      recovery.clear(command);
      if (!mounted.current) return;
      attempt.current = null;
      unknown.current = false;
      setUncertain(false);
      setStale(false);
      setForm(null);
      setNotice(text.saved);
      try {
        onUpdated(response.order);
        void shift.refresh();
      } catch (failure) {
        setError(errorMessage(failure));
      }
    } catch (error) {
      if (!mounted.current) return;
      unknown.current =
        unknown.current ||
        !axios.isAxiosError(error) ||
        !error.response ||
        error.response.status >= 500;
      setUncertain(unknown.current);
      setStale(!unknown.current && axios.isAxiosError(error) && error.response?.status === 409);
      if (!unknown.current) {
        try {
          recovery.clear(command, '', false);
          attempt.current = null;
        } catch {
          unknown.current = true;
          setUncertain(true);
        }
      }
      if (unknown.current) recovery.unknown();
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      recovery.finish();
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const current = await readOrder(api, order.id);
      if (!mounted.current) return;
      onUpdated(current);
      setStale(false);
      setError('');
      await history.refresh();
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function morePayments() {
    const cursor = history.data?.payments?.nextCursor;
    if (cursor)
      await history.append(
        () => readPayments(api, order.id, cursor),
        (current, page) => ({
          ...current,
          payments: {
            ...page,
            payments: [...(current.payments?.payments ?? []), ...page.payments],
          },
        }),
      );
  }
  async function moreOperations() {
    const cursor = history.data?.operations?.nextCursor;
    if (cursor)
      await history.append(
        () => readPaymentOperations(api, order.id, cursor),
        (current, page) => ({
          ...current,
          operations: {
            ...page,
            operations: [...(current.operations?.operations ?? []), ...page.operations],
          },
        }),
      );
  }
  function back() {
    if (!pending.current && !unknown.current) {
      setForm(null);
      setError('');
      setStale(false);
    }
  }
  return {
    isPending: () => pending.current || unknown.current,
    history,
    shift,
    recovery,
    form,
    patchForm,
    begin,
    back,
    submit,
    refresh,
    morePayments,
    moreOperations,
    busy,
    uncertain,
    stale,
    error,
    notice,
    locked: busy || uncertain || recovery.blocked,
  };
}
