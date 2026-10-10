import type { Order } from '@pos/contracts';
import type { OrderInput } from '../../../entities/order';
import type { OrderDraftState } from '../model/order-entry.types';
export function draftFromOrder(order: Order | null): OrderDraftState {
  return {
    ...(order?.tableVisitId ? { tableVisitId: order.tableVisitId } : {}),
    serviceType: order?.serviceType ?? 'DINE_IN',
    tableLabel: order?.tableLabel ?? '',
    notes: order?.notes ?? '',
    customer: order ? order.customer : null,
    customerEdited: false,
    customerRef: order ? order.customerRef : null,
    customerRefEdited: false,
    deliveryAddress: order ? order.deliveryAddress : null,
    addressRef: order ? order.addressRef : null,
    items:
      order?.items.map((item) => ({
        clientId: item.id,
        id: item.id,
        productId: item.productId,
        name: item.productName,
        price: item.unitPrice,
        taxRateSnapshot: item.taxRateSnapshot,
        quantity: item.quantity,
        courseNumber: item.courseNumber,
        note: item.note ?? '',
        modifierGroups: item.modifierGroups,
      })) ?? [],
  };
}
export function draftInput(draft: OrderDraftState): OrderInput {
  return {
    serviceType: draft.serviceType,
    ...(draft.serviceType === 'DINE_IN' ? { tableLabel: draft.tableLabel } : {}),
    notes: draft.notes,
    ...(draft.customerEdited && draft.customer !== undefined
      ? { customer: draft.customer }
      : draft.customerRefEdited && draft.customerRef !== undefined
        ? { customerRef: draft.customerRef }
        : {}),
    ...(draft.deliveryAddressEdited && draft.deliveryAddress !== undefined
      ? { deliveryAddress: draft.deliveryAddress }
      : draft.addressRefEdited && draft.addressRef !== undefined
        ? { addressRef: draft.addressRef }
        : {}),
    items: draft.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      productId: item.productId,
      quantity: item.quantity,
      ...(item.courseNumber !== undefined ? { courseNumber: item.courseNumber } : {}),
      note: item.note,
      ...(!item.id ? { modifiers: item.modifiers ?? [] } : {}),
      ...(!item.id && item.sourceUpsellOfferId
        ? { sourceUpsellOfferId: item.sourceUpsellOfferId }
        : {}),
    })),
  };
}
