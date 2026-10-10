import { clearLinkedDraftAddress } from './draft-address';
import type { Order } from '@pos/contracts';
import type { OrderDraftState } from '../model/order-entry.types';
export function detachDraftCustomer(draft: OrderDraftState, order: Order | null): OrderDraftState {
  const manualSnapshot = !order || !!draft.customerRefEdited;
  return {
    ...clearLinkedDraftAddress(draft),
    customerRef: null,
    customerRefEdited: !manualSnapshot,
    customerEdited: manualSnapshot,
  };
}
