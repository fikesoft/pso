import type {
  CatalogProduct,
  ModifierGroupSnapshotDto,
  OrderRepeatPreviewLine,
} from '@pos/contracts';
import { resolveProductModifiers } from '../../../entities/catalog-modifiers';
import type { StoredOrderItem } from '../../../entities/order';
import { decimalString, decimalUnits, lineAmount } from '../../../shared/lib/money';
import { repeatModifierSelections } from './repeat-modifiers';
export function repeatLine(
  item: StoredOrderItem,
  groups: ModifierGroupSnapshotDto[],
  product: CatalogProduct | undefined,
): OrderRepeatPreviewLine {
  const line: OrderRepeatPreviewLine = {
    sourceItemId: item.id,
    productId: item.productId,
    historical: {
      productName: item.productName,
      productSku: item.productSku,
      unitPrice: item.unitPrice.toFixed(4),
      quantity: item.quantity.toFixed(3),
      ...(item.courseNumber ? { courseNumber: item.courseNumber } : {}),
      note: item.note,
      modifierGroups: groups,
    },
    candidate: null,
    currentUnitPrice: null,
    currentLineTotal: null,
    issues: [],
  };
  if (!product) {
    line.issues.push({ code: 'PRODUCT_UNAVAILABLE', blocking: true });
    return line;
  }
  if (product.price === null) line.issues.push({ code: 'LOCATION_UNCONFIGURED', blocking: true });
  else if (!product.enabled) line.issues.push({ code: 'PRODUCT_DISABLED', blocking: true });
  if (product.scheduleAvailability?.available === false)
    line.issues.push({ code: 'OUTSIDE_SCHEDULE', blocking: true });
  const modifiers = repeatModifierSelections(groups, product.modifierGroups);
  line.issues.push(...modifiers.issues);
  if (
    product.name !== item.productName ||
    product.sku !== item.productSku ||
    product.taxRate !== (item.taxRateSnapshot?.toFixed(4) ?? null)
  )
    line.issues.push({ code: 'CONFIGURATION_CHANGED', blocking: false });
  if (line.issues.some((issue) => issue.blocking)) return line;
  const quote = resolveProductModifiers(product.modifierGroups, modifiers.selections);
  const price = decimalString(
    decimalUnits(product.price!, 4) + decimalUnits(quote.unitExtraPrice, 4),
    4,
  );
  if (price !== item.unitPrice.toFixed(4))
    line.issues.push({ code: 'PRICE_CHANGED', blocking: false });
  line.currentUnitPrice = price;
  line.currentLineTotal = lineAmount(price, item.quantity.toFixed(3));
  line.candidate = {
    productId: item.productId,
    quantity: item.quantity.toFixed(3),
    ...(item.courseNumber ? { courseNumber: item.courseNumber } : {}),
    ...(item.note === null ? {} : { note: item.note }),
    ...(modifiers.selections.length ? { modifiers: modifiers.selections } : {}),
  };
  return line;
}
