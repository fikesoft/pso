import type { CreateOrderInput } from '../../../entities/order';
import type { OrderDraftState, TableOrderContext } from '../model/order-entry.types';
import type { Order } from '@pos/contracts';
import { draftFromOrder, draftInput } from './draft';

export function initialOrderDraft(
  order: Order | null,
  context?: TableOrderContext,
): OrderDraftState {
  const draft = draftFromOrder(order);
  if (order || !context) return draft;
  return {
    ...draft,
    serviceType: 'DINE_IN',
    tableLabel: context.tableLabel,
    tableVisitId: context.visitId,
  };
}
export function linkedDraftInput(
  draft: OrderDraftState,
  context?: TableOrderContext,
): Omit<CreateOrderInput, 'locationId' | 'requestKey' | 'source'> {
  const input = draftInput(draft);
  if (!context) return input;
  const linked = { ...input, serviceType: 'DINE_IN' as const, tableVisitId: context.visitId };
  delete linked.tableLabel;
  return linked;
}
