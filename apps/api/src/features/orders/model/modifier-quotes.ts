import type { TenantTransaction } from '@pos/db';
import {
  loadProductModifierConfigs,
  resolveProductModifiers,
} from '../../../entities/catalog-modifiers';
import type { ModifierQuote, OrderItemInput } from '../../../entities/order';

export async function orderModifierQuotes(
  tx: TenantTransaction,
  inputs: readonly OrderItemInput[],
): Promise<Map<number, ModifierQuote>> {
  const configs = await loadProductModifierConfigs(
    tx,
    inputs.filter((item) => !item.id).map((item) => item.productId),
  );
  const quotes = new Map<number, ModifierQuote>();
  inputs.forEach((item, position) => {
    if (item.id) return;
    quotes.set(
      position,
      resolveProductModifiers(configs.get(item.productId) ?? [], item.modifiers),
    );
  });
  return quotes;
}
