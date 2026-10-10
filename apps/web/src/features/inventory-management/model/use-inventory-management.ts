import { useCallback, useState } from 'react';
import { useRemoteData } from '../../../shared/lib';
import { readInventoryItems } from '../api/inventory.api';
import type { InventoryDialog, InventoryManagementProps, InventoryView } from './inventory.types';
export function useInventoryManagement(props: InventoryManagementProps) {
  const [view, setView] = useState<InventoryView>(
    !props.locationId && props.canManageRecipes ? 'recipes' : 'stock',
  );
  const [dialog, setDialog] = useState<InventoryDialog | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(
    () => readInventoryItems(props.api, props.locationId),
    [props.api, props.locationId],
  );
  const items = useRemoteData(load);
  async function moreItems() {
    const cursor = items.data?.nextCursor;
    if (cursor)
      await items.append(
        () => readInventoryItems(props.api, props.locationId, cursor),
        (current, next) => ({ ...next, items: [...current.items, ...next.items] }),
      );
  }
  function saved(message: string) {
    setDialog(null);
    setNotice(message);
    void items.refresh();
  }
  return { ...props, view, setView, dialog, setDialog, notice, setNotice, items, moreItems, saved };
}
