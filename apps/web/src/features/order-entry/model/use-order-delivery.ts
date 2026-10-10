import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeliveryCommand } from '@pos/contracts';
import { deliveryCommandSchema } from '@pos/contracts/delivery';
import { errorMessage } from '@pos/ui/api';
import {
  readDelivery,
  readDeliveryCouriers,
  readOrder,
  updateDelivery,
} from '../../../entities/order';
import { useRemoteData } from '../../../shared/lib';
import { deliveryMessages as text } from '@pos/ui/locales';
import type { DeliveryFormState, OrderDeliveryInput } from './delivery.types';
export function useOrderDelivery({
  api,
  order,
  enabled,
  onUpdated,
  isExternallyBlocked,
}: OrderDeliveryInput) {
  const load = useCallback(
    async () => (enabled ? readDelivery(api, order.id) : null),
    [api, order.id, order.version, enabled],
  );
  const history = useRemoteData(load);
  const canAssign = !!history.data?.canAssign;
  const loadCouriers = useCallback(
    async () => (enabled && canAssign ? readDeliveryCouriers(api, order.id) : null),
    [api, order.id, order.version, enabled, canAssign],
  );
  const couriers = useRemoteData(loadCouriers);
  const [form, setForm] = useState<DeliveryFormState>({
    status: 'ASSIGNED',
    courierUserId: '',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const attempt = useRef<DeliveryCommand | null>(null);
  const pending = useRef(false);
  const unknown = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function patchForm(patch: Partial<DeliveryFormState>) {
    if (!pending.current && !unknown.current) setForm((current) => ({ ...current, ...patch }));
  }
  async function submit(status: DeliveryCommand['status']) {
    if (pending.current || stale || isExternallyBlocked?.()) return;
    setError('');
    setNotice('');
    if (!attempt.current) {
      const parsed = deliveryCommandSchema.safeParse({
        version: order.version,
        requestKey: crypto.randomUUID(),
        status,
        ...(status === 'ASSIGNED' ? { courierUserId: form.courierUserId } : {}),
        ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Date invalide');
        return;
      }
      attempt.current = parsed.data;
    }
    pending.current = true;
    setBusy(true);
    try {
      const response = await updateDelivery(api, order.id, attempt.current);
      if (!mounted.current) return;
      attempt.current = null;
      unknown.current = false;
      setUncertain(false);
      setStale(false);
      setNotice(text.saved);
      setForm({ status: 'ASSIGNED', courierUserId: '', reason: '' });
      onUpdated(response.order);
    } catch (error) {
      if (!mounted.current) return;
      const response = axios.isAxiosError(error) ? error.response : undefined;
      const definitiveConflict =
        response?.status === 409 &&
        typeof response.data?.error === 'string' &&
        ['REQUEST_REJECTED', 'DATA_CONFLICT'].includes(response.data?.code);
      // A local API conflict is returned only after the idempotency lookup or rollback.
      // A proxy error or revoked access cannot resolve an earlier unknown outcome.
      unknown.current =
        !definitiveConflict && (unknown.current || !response || response.status >= 500);
      setUncertain(unknown.current);
      setStale(definitiveConflict);
      if (!unknown.current) attempt.current = null;
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh() {
    if (pending.current || unknown.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const current = await readOrder(api, order.id);
      if (!mounted.current) return;
      onUpdated(current);
      await Promise.all([history.refresh(), couriers.refresh()]);
      setStale(false);
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function moreHistory() {
    const cursor = history.data?.nextCursor;
    if (cursor)
      await history.append(
        () => readDelivery(api, order.id, cursor),
        (current, page) => ({
          ...page,
          operations: [...(current?.operations ?? []), ...page.operations],
        }),
      );
  }
  async function moreCouriers() {
    const cursor = couriers.data?.nextCursor;
    if (cursor)
      await couriers.append(
        () => readDeliveryCouriers(api, order.id, cursor),
        (current, page) => ({
          ...page,
          couriers: [...(current?.couriers ?? []), ...page.couriers],
        }),
      );
  }
  return {
    isPending: () => pending.current || unknown.current,
    history,
    couriers,
    form,
    patchForm,
    submit,
    refresh,
    moreHistory,
    moreCouriers,
    busy,
    uncertain,
    stale,
    error,
    notice,
    locked: busy || uncertain,
  };
}
