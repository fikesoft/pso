import type { TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import { decimalString, decimalUnits, lineAmount, totalAmount } from '../../../shared/lib/money';
import type {
  ModifierQuote,
  OrderItemInput,
  PreparedOrderItem,
  StoredOrderItem,
} from './order.types';
import { createOrderItemModifierSnapshots } from './order-snapshots';

export async function prepareOrderItems(
  tx: TenantTransaction,
  locationId: string,
  inputs: readonly OrderItemInput[],
  modifierQuotes: ReadonlyMap<number, ModifierQuote>,
  existing: readonly StoredOrderItem[] = [],
  upsellOffers: ReadonlyMap<number, string> = new Map(),
) {
  const retainedIds = inputs.flatMap((item) => (item.id ? [item.id] : []));
  assert(new Set(retainedIds).size === retainedIds.length, 400, 'Poziție de comandă duplicată');
  const productIds = inputs.filter((item) => !item.id).map((item) => item.productId);
  const [products, availability] = await Promise.all([
    tx.product.findMany({ where: { id: { in: productIds } } }),
    tx.locationProduct.findMany({ where: { locationId, productId: { in: productIds } } }),
  ]);
  const items: PreparedOrderItem[] = inputs.map((input, position) => {
    const previous = input.id ? existing.find((item) => item.id === input.id) : undefined;
    if (!input.id && input.sourceUpsellOfferId)
      assert(
        upsellOffers.get(position) === input.sourceUpsellOfferId,
        400,
        'Recomandare nevalidată.',
      );
    if (input.id) {
      assert(input.modifiers === undefined, 400, 'Modificatorii cer o linie nouă.');
      assert(input.sourceUpsellOfferId === undefined, 400, 'Atribuirea recomandării este fixă.');
      assert(
        previous && previous.productId === input.productId,
        400,
        'Poziție de comandă invalidă',
      );
    }
    const product = products.find((item) => item.id === input.productId);
    const local = availability.find((item) => item.productId === input.productId);
    assert(previous || product, 404, 'Produsul nu există');
    assert(
      previous || (product?.status === 'ACTIVE' && local?.enabled),
      409,
      'Produsul nu este disponibil în această locație. Reîncărcați catalogul.',
    );
    const basePrice = previous?.baseUnitPrice ?? local!.price;
    const resolved = previous ? null : modifierQuotes.get(position);
    if (!previous && !resolved) throw new Error('Modifier quote missing for new order line');
    const price = previous
      ? previous.unitPrice
      : decimalString(
          decimalUnits(String(basePrice), 4) + decimalUnits(resolved!.unitExtraPrice, 4),
          4,
        );
    return {
      ...(previous ? { id: previous.id } : {}),
      ...(previous?.sourceUpsellOfferId || upsellOffers.has(position)
        ? { sourceUpsellOfferId: previous?.sourceUpsellOfferId ?? upsellOffers.get(position)! }
        : {}),
      productId: input.productId,
      courseNumber: input.courseNumber ?? previous?.courseNumber ?? 0,
      position,
      productName: previous?.productName ?? product!.name,
      productSku: previous?.productSku ?? product!.sku,
      unitPrice: price,
      taxRateSnapshot: previous ? previous.taxRateSnapshot : product!.taxRate,
      baseUnitPrice: basePrice,
      quantity: input.quantity,
      lineTotal: lineAmount(String(price), input.quantity),
      note: input.note ?? null,
      modifierGroups: resolved?.snapshots ?? [],
    };
  });
  return { items, total: totalAmount(items.map((item) => item.lineTotal)) };
}

export async function replaceDraftItems(
  tx: TenantTransaction,
  orderId: string,
  organizationId: string,
  locationId: string,
  items: readonly PreparedOrderItem[],
) {
  // Identity and snapshots survive edit; only DRAFT lines may be removed/replaced.
  const ids = items.flatMap((item) => (item.id ? [item.id] : []));
  await tx.orderItem.deleteMany({ where: { orderId, id: { notIn: ids } } });
  for (const item of items) {
    if (item.id) {
      const { modifierGroups: _snapshots, ...metadata } = item;
      await tx.orderItem.update({ where: { id: item.id }, data: metadata });
    } else {
      const { modifierGroups, ...metadata } = item;
      const created = await tx.orderItem.create({
        data: { ...metadata, orderId, organizationId, locationId },
      });
      await createOrderItemModifierSnapshots(
        tx,
        organizationId,
        locationId,
        created.id,
        modifierGroups,
      );
    }
  }
}
