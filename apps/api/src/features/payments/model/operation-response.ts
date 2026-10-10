import type { PaymentOperationRecord, PaymentStatus } from '@pos/contracts';
import type { StoredPaymentOperation } from './payments.types';

export function operationResponse(operation: StoredPaymentOperation): PaymentOperationRecord {
  return {
    id: operation.id,
    kind: operation.kind as 'COLLECT' | 'REFUND',
    orderVersion: operation.orderVersion,
    amount: operation.amount.toFixed(2),
    fromStatus: operation.fromStatus as PaymentStatus,
    toStatus: operation.toStatus as PaymentStatus,
    reason: operation.reason,
    actorUserId: operation.actorUserId,
    createdAt: operation.createdAt.toISOString(),
  };
}
