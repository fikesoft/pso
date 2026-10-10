import axios from 'axios';
import { WEBSITE_PRODUCT_UNAVAILABLE } from '@pos/contracts/website-delivery';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { useRemoteData } from '../../../shared/lib';
import { decideWebsiteOrder, readWebsiteOrder } from '../api/website.api';
import { isUnknownWebsiteResult } from '../lib/website-presentation';
import type { WebsiteDecisionAttempt, WebsiteOrderDialogProps } from './website-delivery.types';
export function useWebsiteDecision({ api, id, onUpdated }: WebsiteOrderDialogProps) {
  const load = useCallback(() => readWebsiteOrder(api, id), [api, id]);
  const details = useRemoteData(load);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const attempt = useRef<WebsiteDecisionAttempt | null>(null);
  const unconfirmed = useRef(false);
  const unavailableConflict = useRef(false);
  const lifetime = useRef(0);
  useEffect(
    () => () => {
      lifetime.current++;
    },
    [],
  );
  async function submit(kind: WebsiteDecisionAttempt['kind']) {
    if (pending.current || !details.data || stale) return;
    attempt.current ??= {
      kind,
      version: details.data.version,
      ...(kind === 'reject' ? { reason: reason.trim() } : {}),
    };
    pending.current = true;
    const current = lifetime.current;
    setBusy(true);
    setError('');
    try {
      const order = await decideWebsiteOrder(api, id, attempt.current);
      if (current !== lifetime.current) return;
      details.setData(order);
      attempt.current = null;
      unconfirmed.current = false;
      unavailableConflict.current = false;
      setUncertain(false);
      setRejecting(false);
      onUpdated();
    } catch (error) {
      if (current !== lifetime.current) return;
      const unavailable =
        axios.isAxiosError(error) &&
        error.response?.status === 409 &&
        error.response.data?.code === WEBSITE_PRODUCT_UNAVAILABLE;
      // Only this code proves the acceptance did not commit after the server's replay check.
      unavailableConflict.current = unavailable;
      const unknown = !unavailable && (unconfirmed.current || isUnknownWebsiteResult(error));
      unconfirmed.current = unknown;
      setUncertain(unknown);
      setStale(!unknown && axios.isAxiosError(error) && error.response?.status === 409);
      setError(errorMessage(error));
      if (!unknown && !unavailable) attempt.current = null;
    } finally {
      pending.current = false;
      if (current === lifetime.current) setBusy(false);
    }
  }
  async function reload() {
    if (pending.current) return;
    const order = await details.refresh();
    if (!order) return;
    setError('');
    setStale(false);
    // A pending read alone cannot resolve an unknown result; the typed conflict can.
    if (order.status !== 'AWAITING_ACCEPTANCE' || unavailableConflict.current) {
      attempt.current = null;
      unconfirmed.current = false;
      unavailableConflict.current = false;
      setUncertain(false);
      setRejecting(false);
      onUpdated();
    }
  }
  function retry() {
    if (attempt.current) void submit(attempt.current.kind);
  }
  return {
    details,
    rejecting,
    setRejecting,
    reason,
    setReason,
    busy,
    uncertain,
    stale,
    error,
    submit,
    reload,
    retry,
  };
}
