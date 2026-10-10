import type { OrderResponsibilityCommandIdentity } from '@pos/contracts/order-responsibilities';
import type { ResponsibilityAttempt } from '../model/responsibility-management.types';
export function responsibilityAttemptIdentity({
  orderId,
  body,
}: ResponsibilityAttempt): OrderResponsibilityCommandIdentity {
  const base = { orderId, locationId: body.locationId, requestKey: body.requestKey };
  switch (body.kind) {
    case 'ASSIGN':
      return { ...base, kind: body.kind, targetShiftId: body.targetShiftId };
    case 'PREPARE_HANDOFF':
      return { ...base, kind: body.kind, sourceShiftId: body.sourceShiftId };
    case 'ACCEPT_HANDOFF':
      return {
        ...base,
        kind: body.kind,
        targetShiftId: body.targetShiftId,
        handoffEventId: body.handoffEventId,
      };
  }
}
