import { useState } from 'react';
import axios from 'axios';
import { INVENTORY_COUNT_STALE } from '@pos/contracts/inventory';
import type { FormEvent } from 'react';
import { errorMessage } from '@pos/ui/api';
import { createInventoryDocument, readInventoryItem } from '../api/inventory.api';
import { useInventoryAction } from './use-inventory-action';
import type { MovementEditorProps } from './inventory.types';
export function useMovementEditor(props: MovementEditorProps) {
  const [item, setItem] = useState(props.item);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const action = useInventoryAction({
    operation: (input: Parameters<typeof createInventoryDocument>[1]) =>
      createInventoryDocument(props.api, input),
    onSaved: props.onSaved,
    isConfirmedUncommitted: (error) =>
      props.kind === 'COUNT' &&
      axios.isAxiosError(error) &&
      error.response?.status === 409 &&
      error.response.data?.code === INVENTORY_COUNT_STALE,
  });
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (item.balance === null || loading) return;
    void action.submit({
      locationId: props.locationId,
      inventoryItemId: item.id,
      kind: props.kind,
      quantity,
      ...(props.kind === 'COUNT' ? { expectedQuantity: item.balance } : {}),
      reason,
      requestKey: crypto.randomUUID(),
    });
  }
  async function reload() {
    if (action.locked || loading) return;
    setLoading(true);
    try {
      setItem(await readInventoryItem(props.api, item.id, props.locationId));
      action.resetError();
    } catch (error) {
      action.setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }
  return { item, quantity, setQuantity, reason, setReason, loading, action, save, reload };
}
