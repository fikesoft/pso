import type { CustomerAddressDto, Order, ServiceType } from '@pos/contracts';
import type { OrderDraftState } from '../model/order-entry.types';
export function clearDraftAddress(draft: OrderDraftState): OrderDraftState {
  if (draft.deliveryAddress === undefined) return draft;
  return {
    ...draft,
    deliveryAddress: null,
    deliveryAddressEdited: true,
    addressRef: null,
    addressRefEdited: false,
    addressInvalid: false,
    addressCleared: !!draft.deliveryAddress || !!draft.addressRef,
  };
}
export function changeDraftService(draft: OrderDraftState, serviceType: ServiceType) {
  const next =
    draft.serviceType === 'DELIVERY' && serviceType !== 'DELIVERY'
      ? clearDraftAddress(draft)
      : draft;
  return { ...next, serviceType };
}
export function clearLinkedDraftAddress(draft: OrderDraftState) {
  return draft.addressRef ? clearDraftAddress(draft) : draft;
}
export function selectDraftAddress(
  draft: OrderDraftState,
  address: CustomerAddressDto,
): OrderDraftState {
  if (
    draft.serviceType !== 'DELIVERY' ||
    draft.customerRef?.id !== address.customerId ||
    address.status !== 'ACTIVE'
  )
    return draft;
  return {
    ...draft,
    deliveryAddress: { address: address.address, instructions: address.instructions },
    deliveryAddressEdited: false,
    addressRef: { id: address.id, version: address.version },
    addressRefEdited: true,
    addressInvalid: false,
    addressCleared: false,
  };
}
export function detachDraftAddress(draft: OrderDraftState, order: Order | null): OrderDraftState {
  const manual = !order || !!draft.addressRefEdited;
  return {
    ...draft,
    addressRef: null,
    addressRefEdited: !manual,
    deliveryAddressEdited: manual,
    addressInvalid: false,
  };
}
