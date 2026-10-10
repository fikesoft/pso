import { useState } from 'react';
import type { InventoryItem } from '@pos/contracts';
import { SERVICE_TYPES } from '@pos/contracts/orders';
import { PURPOSES_BY_KIND } from '../config/inventory.constants';
import type { RecipeLine } from './inventory.types';

export function useRecipeLines(items: readonly InventoryItem[], maximum: number) {
  const [lines, setLines] = useState<RecipeLine[]>([]);
  function addLine() {
    if (lines.length >= maximum) return;
    const item = items.find(
      (item) => item.status === 'ACTIVE' && !lines.some((line) => line.inventoryItemId === item.id),
    );
    setLines((current) => [
      ...current,
      {
        clientId: crypto.randomUUID(),
        inventoryItemId: item?.id ?? '',
        purpose: item ? PURPOSES_BY_KIND[item.kind][0] : 'MAIN',
        quantityPerUnit: '',
        serviceTypes: [...SERVICE_TYPES],
      },
    ]);
  }
  function patchLine(id: string, patch: Partial<RecipeLine>) {
    setLines((current) =>
      current.map((line) => (line.clientId === id ? { ...line, ...patch } : line)),
    );
  }
  function changeItem(id: string, itemId: string) {
    const item = items.find((item) => item.id === itemId);
    patchLine(id, {
      inventoryItemId: itemId,
      ...(item
        ? { purpose: PURPOSES_BY_KIND[item.kind][0], itemName: item.name, unit: item.unit }
        : {}),
    });
  }
  return {
    lines,
    setLines,
    addLine,
    patchLine,
    changeItem,
    removeLine: (id: string) =>
      setLines((current) => current.filter((line) => line.clientId !== id)),
  };
}
