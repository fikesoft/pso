import type { CatalogProduct } from '@pos/contracts';
import type { previewProductModifiers } from '../../../entities/modifier';
import type { DraftLine } from '../model/order-entry.types';
export function newDraftLine(
  product: CatalogProduct,
  preview: ReturnType<typeof previewProductModifiers>,
  offerId?: string,
): DraftLine {
  return {
    clientId: crypto.randomUUID(),
    productId: product.id,
    name: product.name,
    price: preview.unitPrice,
    quantity: '1',
    courseNumber: 0,
    note: '',
    modifiers: preview.selections,
    modifierGroups: preview.snapshots,
    ...(offerId ? { sourceUpsellOfferId: offerId } : {}),
  };
}
