import type { orderResponse } from '../../../entities/order';
import type { ActiveOrderReason } from '@pos/contracts';

export interface ActiveOrderContext {
  organizationId: string;
  locationId: string;
  userId: string;
}
export interface ActiveOrderCandidate {
  id: string;
  number: number;
  activeReasons: ActiveOrderReason[];
}

export type ActiveOrderRow = Awaited<ReturnType<typeof orderResponse>> & {
  activeReasons: ActiveOrderReason[];
};
