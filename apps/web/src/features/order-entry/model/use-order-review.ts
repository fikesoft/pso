import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { useCashCommandRecovery } from '../../../entities/cash-command';
import { useOwnShiftSelection } from '../../../entities/cash-shift';
import { readOrder } from '../../../entities/order';
import { useOrderSelectionLive } from './use-order-selection-live';
import { useOrderCommands } from './use-order-commands';
import type { OrderReviewInput } from './order-review.types';
export function useOrderReview(input: OrderReviewInput) {
  const { api, organizationId, actorUserId, locationId, can } = input;
  const scopeKey = `${organizationId}:${actorUserId}:${locationId}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const latest = useRef(input);
  latest.current = input;
  const [selected, setSelected] = useState<Order | null>(null);
  const [opening, setOpening] = useState(false),
    [openError, setOpenError] = useState('');
  const openingRef = useRef(false),
    epoch = useRef(0);
  const detailGuard = useRef<(() => boolean) | null>(null);
  const canRead = can('orders.read'),
    canCreate = can('orders.create');
  const canCollect = can('payments.collect'),
    canRefund = can('payments.refund');
  const selection = useOrderSelectionLive({
    api,
    locationId,
    selected,
    setSelected,
    enabled: canRead,
  });
  const activeSelection = useRef({ selected, blocked: selection.blocked });
  activeSelection.current = { selected, blocked: selection.blocked };
  const notify = useCallback(async () => {
    await latest.current.onUpdated?.();
  }, []);
  const updated = useCallback(
    (order: Order) => {
      if (!activeSelection.current.blocked)
        setSelected((current) =>
          current?.id === order.id && current.version <= order.version ? order : current,
        );
      void notify().catch(() => {});
    },
    [notify],
  );
  const externalBlocked = useCallback(() => !!latest.current.isExternallyBlocked?.(), []);
  const commands = useOrderCommands({
    api,
    selected,
    onUpdated: updated,
    isExternallyBlocked: externalBlocked,
  });
  const shift = useOwnShiftSelection({
    api,
    locationId,
    actorUserId,
    enabled:
      canRead && (canCollect || canRefund) && can('cash.registers.read') && can('cash.shifts.read'),
  });
  const financial = useCashCommandRecovery({
    api,
    organizationId,
    actorUserId,
    locationId,
    channel: 'FINANCIAL',
    canResolve: (command) => canRead && (command.kind === 'REFUND' ? canRefund : canCollect),
    onResolved: async (command) => {
      await notify();
      await shift.refresh();
      if ('orderId' in command && activeSelection.current.selected?.id === command.orderId)
        await selection.refresh();
    },
  });
  useEffect(() => {
    epoch.current++;
    openingRef.current = false;
    setOpening(false);
    setOpenError('');
    setSelected(null);
    return () => {
      epoch.current++;
    };
  }, [organizationId, actorUserId, locationId]);
  function isLocked() {
    return (
      openingRef.current ||
      commands.isPending() ||
      !!commands.uncertainAction ||
      commands.staleAction ||
      financial.blocked ||
      !!detailGuard.current?.()
    );
  }
  function open(order: Order) {
    if (!canRead || isLocked() || externalBlocked()) return;
    commands.prepareSelection(order.id);
    setSelected(order);
    setOpenError('');
  }
  async function openById(id: string) {
    if (!canRead || isLocked() || externalBlocked()) return;
    const revision = ++epoch.current;
    openingRef.current = true;
    setOpening(true);
    setOpenError('');
    try {
      const order = await readOrder(api, id);
      if (
        revision !== epoch.current ||
        activeScope.current !== scopeKey ||
        !latest.current.can('orders.read') ||
        order.locationId !== locationId
      )
        return;
      commands.prepareSelection(order.id);
      setSelected(order);
    } catch (failure) {
      if (revision === epoch.current) setOpenError(errorMessage(failure));
    } finally {
      if (revision === epoch.current) {
        openingRef.current = false;
        setOpening(false);
      }
    }
  }
  const attachDetailGuard = useCallback((guard: (() => boolean) | null) => {
    detailGuard.current = guard;
  }, []);
  return {
    api,
    organizationId,
    actorUserId,
    locationId,
    selected,
    setSelected,
    selection,
    shift,
    financial,
    updated,
    canRead,
    canCreate,
    canCollect,
    canRefund,
    canCancel: can('orders.cancel'),
    canComplete: can('orders.complete'),
    ...commands,
    open,
    openById,
    opening,
    openError,
    externalBlocked,
    isLocked,
    attachDetailGuard,
  };
}
