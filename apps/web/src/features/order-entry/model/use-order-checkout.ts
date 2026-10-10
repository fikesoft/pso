import axios from 'axios';
import { checkoutAttempt } from './checkout-attempt';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckoutMode, PaymentMethod, Receipt } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { checkoutMessages, operationalMessages, cashShiftMessages } from '@pos/ui/locales';
import { checkoutDemo, checkoutManual, readOrder, readReceipt } from '../../../entities/order';
import type { CheckoutAttempt, OrderCheckoutInput } from './checkout.types';
export function useOrderCheckout({
  api,
  order,
  enabled,
  onUpdated,
  shift,
  recovery,
  isExternallyBlocked,
}: OrderCheckoutInput) {
  const [mode, setMode] = useState<CheckoutMode | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const attempt = useRef<CheckoutAttempt | null>(null);
  const unconfirmed = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const reconcile = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const current = ++revision.current;
    setLoading(true);
    setError('');
    try {
      const stored = await readReceipt(api, order.id);
      const updated = await readOrder(api, order.id);
      if (!mounted.current || current !== revision.current) return;
      onUpdated(updated);
      setStale(false);
      if (stored && !unconfirmed.current && !recovery.blocked) {
        setReceipt(stored);
        setMode(null);
        setShowReceipt(true);
        setUncertain(false);
        unconfirmed.current = false;
        attempt.current = null;
      } else if (!stored && updated.checkout) setError(checkoutMessages.receiptMissing);
    } catch (error) {
      if (mounted.current && current === revision.current) setError(errorMessage(error));
    } finally {
      if (mounted.current && current === revision.current) setLoading(false);
    }
  }, [api, order.id, enabled, onUpdated, recovery.blocked]);
  useEffect(() => {
    mounted.current = true;
    // Passive permission/context changes cannot resolve or invalidate a frozen mutation.
    if (!pending.current && !unconfirmed.current) void reconcile();
    return () => {
      mounted.current = false;
      if (!pending.current) revision.current++;
    };
  }, [reconcile]);
  useEffect(() => {
    if (attempt.current?.mode === 'MANUAL') attempt.current = null;
    unconfirmed.current = false;
    setUncertain(false);
    setStale(false);
    setError('');
    setMode(null);
  }, [recovery.generation]);
  function begin(next: CheckoutMode) {
    if (busy || loading || uncertain || recovery.blocked || isExternallyBlocked?.()) return;
    setMode(next);
    setConfirmed(false);
    setError('');
  }
  function back() {
    if (busy || loading || uncertain) return;
    setMode(null);
    setShowReceipt(false);
    setConfirmed(false);
    setError('');
  }
  async function submit() {
    if (
      !mode ||
      pending.current ||
      loading ||
      stale ||
      (!confirmed && !attempt.current) ||
      isExternallyBlocked?.()
    )
      return;
    if (!attempt.current) {
      if (recovery.blocked) return;
      if (mode === 'MANUAL' && (!shift.selected || shift.loading)) {
        setError(cashShiftMessages.required);
        return;
      }
      const base = { version: order.version, requestKey: crypto.randomUUID() };
      attempt.current = checkoutAttempt(
        mode === 'DEMO'
          ? { ...base, mode }
          : {
              ...base,
              mode,
              method,
              receivedAmount,
              cashShiftId: shift.selected!.id,
            },
      );
    }
    const request = attempt.current;
    const current = ++revision.current;
    pending.current = true;
    setBusy(true);
    setError('');
    const command = {
      kind: 'CHECKOUT_MANUAL' as const,
      orderId: order.id,
      locationId: order.locationId,
      requestKey: request.input.requestKey,
    };
    try {
      if (request.mode === 'MANUAL') recovery.reserve(command);
      const result =
        request.mode === 'DEMO'
          ? await checkoutDemo(api, order.id, request.input)
          : await checkoutManual(api, order.id, request.input);
      if (request.mode === 'MANUAL') recovery.clear(command);
      if (!mounted.current || current !== revision.current) return;
      attempt.current = null;
      unconfirmed.current = false;
      setUncertain(false);
      setMode(null);
      setReceipt(result.receipt);
      setShowReceipt(true);
      try {
        onUpdated(result.order);
        if (request.mode === 'MANUAL') void shift.refresh();
      } catch (failure) {
        setError(errorMessage(failure));
      }
    } catch (error) {
      if (!mounted.current || current !== revision.current) return;
      // A refused retry cannot rule out a committed original checkout.
      const unknown =
        unconfirmed.current ||
        !axios.isAxiosError(error) ||
        !error.response ||
        error.response.status >= 500;
      unconfirmed.current = unknown;
      setUncertain(unknown);
      setStale(!unknown && axios.isAxiosError(error) && error.response?.status === 409);
      setError(errorMessage(error));
      if (!unknown) {
        try {
          if (request.mode === 'MANUAL') recovery.clear(command, '', false);
          attempt.current = null;
        } catch {
          unconfirmed.current = true;
          setUncertain(true);
        }
      }
      if (request.mode === 'MANUAL' && unconfirmed.current) recovery.unknown();
    } finally {
      pending.current = false;
      if (request.mode === 'MANUAL') recovery.finish();
      if (mounted.current && current === revision.current) setBusy(false);
    }
  }
  return {
    isPending: () => pending.current || unconfirmed.current,
    mode,
    shift,
    recovery,
    method,
    setMethod,
    receivedAmount,
    setReceivedAmount,
    confirmed,
    setConfirmed,
    receipt,
    showReceipt,
    setShowReceipt,
    loading,
    busy,
    uncertain,
    stale,
    error,
    locked: busy || loading || uncertain || recovery.blocked,
    eligible:
      order.status === 'READY' &&
      order.kitchenStatus === 'READY' &&
      order.paymentSummary.collectedAmount === '0.00',
    statusMessage: uncertain
      ? operationalMessages.retryUnknown
      : stale
        ? operationalMessages.stale
        : '',
    begin,
    back,
    submit,
    reconcile,
  };
}
