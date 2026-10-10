import { versionedMutationFailure } from '../../../shared/lib';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { operationalMessages as text } from '@pos/ui/locales';
import { executeOrderCommand, readOrder } from '../../../entities/order';
import type {
  OrderCommandAction,
  OrderCommandsInput,
  PendingOrderCommand,
} from './order-command.types';

export function useOrderCommands({
  api,
  selected,
  onUpdated,
  isExternallyBlocked,
}: OrderCommandsInput) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const commands = useRef(new Map<string, PendingOrderCommand>());
  const staleOrders = useRef(new Set<string>());
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const selectedCommand = selected ? commands.current.get(selected.id) : undefined;
  const uncertainAction = selectedCommand?.uncertain ? selectedCommand.action : null;

  async function act(action: OrderCommandAction = 'send') {
    if (
      !selected ||
      pending.current ||
      staleOrders.current.has(selected.id) ||
      isExternallyBlocked?.()
    )
      return;
    const existing = commands.current.get(selected.id);
    if (existing && existing.action !== action) return;
    const command = existing ?? {
      action,
      body: {
        version: selected.version,
        requestKey: crypto.randomUUID(),
        ...(action === 'cancel' && cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
      },
      uncertain: false,
    };
    commands.current.set(selected.id, command);
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const order = await executeOrderCommand(api, selected.id, command.action, command.body);
      if (!mounted.current) return;
      commands.current.delete(selected.id);
      setConfirmCancel(false);
      setCancelReason('');
      setNotice(
        action === 'send'
          ? text.kitchenSent
          : action === 'confirm'
            ? text.orderConfirmed
            : action === 'complete'
              ? text.orderCompleted
              : text.orderCancelled,
      );
      onUpdated(order);
    } catch (error) {
      if (!mounted.current) return;
      setError(errorMessage(error));
      const failure = versionedMutationFailure(error, command.uncertain);
      if (failure.stale) staleOrders.current.add(selected.id);
      const unknown = failure.uncertain;
      if (unknown) command.uncertain = true;
      else commands.current.delete(selected.id);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reloadSelected() {
    if (!selected || pending.current || commands.current.get(selected.id)?.uncertain) return;
    pending.current = true;
    setBusy(true);
    try {
      const order = await readOrder(api, selected.id);
      if (!mounted.current) return;
      commands.current.delete(selected.id);
      staleOrders.current.delete(selected.id);
      setError('');
      setConfirmCancel(false);
      onUpdated(order);
    } catch (error) {
      if (!mounted.current) return;
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function prepareSelection(id: string) {
    const command = commands.current.get(id);
    setError('');
    setCancelReason(command?.body.reason ?? '');
    setConfirmCancel(command?.action === 'cancel');
  }
  return {
    isPending: () => pending.current,
    act,
    reloadSelected,
    prepareSelection,
    error,
    setError,
    notice,
    setNotice,
    busy,
    uncertainAction,
    staleAction: !!selected && staleOrders.current.has(selected.id),
    cancelReason,
    setCancelReason,
    confirmCancel,
    setConfirmCancel,
  };
}
