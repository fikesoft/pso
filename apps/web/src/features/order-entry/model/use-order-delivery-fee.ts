import { useEffect, useRef, useState } from 'react';
import type { OrderDeliveryFeeQuote } from '@pos/contracts';
import { orderDeliveryFeePreviewSchema } from '@pos/contracts/delivery-zones';
import { errorMessage } from '@pos/ui/api';
import { previewOrderDeliveryFee } from '../../../entities/order';
import { useDeliveryFeeCommand } from './use-delivery-fee-command';
import type { DeliveryFeeInput } from './delivery-fee.types';
export function useOrderDeliveryFee(input: DeliveryFeeInput) {
  const { model, isBlocked } = input,
    order = model.selected!;
  const command = useDeliveryFeeCommand(input);
  const [latitude, setLatitude] = useState(''),
    [longitude, setLongitude] = useState('');
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [quote, setQuote] = useState<OrderDeliveryFeeQuote | null>(null);
  const pending = useRef(false),
    mounted = useRef(false),
    version = useRef(order.version);
  version.current = order.version;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentQuote = quote?.version === order.version ? quote : null;
  function change(field: 'latitude' | 'longitude', value: string) {
    if (pending.current || command.locked || isBlocked()) return;
    (field === 'latitude' ? setLatitude : setLongitude)(value);
    setQuote(null);
    setConfirmed(false);
    setError('');
  }
  async function preview() {
    if (
      pending.current ||
      command.locked ||
      command.stale ||
      isBlocked() ||
      !model.canCreate ||
      !model.canRead
    )
      return;
    setQuote(null);
    setConfirmed(false);
    setError('');
    const parsed = orderDeliveryFeePreviewSchema.safeParse({
      version: order.version,
      destination: {
        latitude: latitude.trim() ? Number(latitude) : NaN,
        longitude: longitude.trim() ? Number(longitude) : NaN,
      },
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Destinație invalidă.');
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const result = await previewOrderDeliveryFee(model.api, order.id, parsed.data);
      if (mounted.current && version.current === parsed.data.version) setQuote(result);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function apply() {
    if (!confirmed || currentQuote?.result.status !== 'AVAILABLE' || pending.current || isBlocked())
      return;
    const rate = currentQuote.result;
    await command.send({
      version: currentQuote.version,
      destination: { latitude: Number(latitude), longitude: Number(longitude) },
      requestKey: crypto.randomUUID(),
      confirmed: true,
      zoneId: rate.zoneId,
      zoneVersion: rate.zoneVersion,
      subtotal: rate.subtotal,
      fee: rate.fee,
      total: rate.total,
    });
    setQuote(null);
    setConfirmed(false);
  }
  async function refresh() {
    if (pending.current || command.locked || isBlocked()) return;
    setQuote(null);
    setConfirmed(false);
    await model.selection.refresh();
    command.refreshed();
  }
  return {
    order,
    command,
    latitude,
    longitude,
    change,
    confirmed,
    setConfirmed,
    quote: currentQuote,
    preview,
    apply,
    refresh,
    busy,
    error,
    enabled:
      model.canRead &&
      model.canCreate &&
      order.status === 'DRAFT' &&
      order.serviceType === 'DELIVERY',
    locked: busy || command.locked,
    isPending: () => pending.current || command.isPending(),
  };
}
