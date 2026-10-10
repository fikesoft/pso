import type { KitchenTicketBatch, KitchenStatus } from '@pos/contracts';

export function kitchenBatchStatus(batches: readonly KitchenTicketBatch[]): KitchenStatus {
  if (!batches.length) return 'QUEUED';
  if (batches.every((batch) => batch.status === 'CANCELLED')) return 'CANCELLED';
  if (batches.every((batch) => batch.status === 'READY')) return 'READY';
  if (batches.some((batch) => batch.status === 'READY' || batch.status === 'PARTIALLY_READY'))
    return 'PARTIALLY_READY';
  return batches.some((batch) => batch.status === 'PREPARING') ? 'PREPARING' : 'QUEUED';
}
