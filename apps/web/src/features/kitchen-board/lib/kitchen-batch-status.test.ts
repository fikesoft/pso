import { expect, it } from 'vitest';
import type { KitchenStatus, KitchenTicketBatch } from '@pos/contracts';
import { kitchenBatchStatus } from './kitchen-batch-status';

it('stația cu mai multe etape are o singură stare agregată, independent de ordinea loturilor', () => {
  for (const [statuses, expected] of [
    [['QUEUED', 'QUEUED'], 'QUEUED'],
    [['QUEUED', 'PREPARING'], 'PREPARING'],
    [['READY', 'QUEUED'], 'PARTIALLY_READY'],
    [['PREPARING', 'PARTIALLY_READY'], 'PARTIALLY_READY'],
    [['READY', 'READY'], 'READY'],
    [['CANCELLED', 'CANCELLED'], 'CANCELLED'],
  ] as Array<[KitchenStatus[], KitchenStatus]>) {
    const batches = statuses.map((status) => ({ status }) as KitchenTicketBatch);
    expect(kitchenBatchStatus(batches)).toBe(expected);
    expect(kitchenBatchStatus(batches.reverse())).toBe(expected);
  }
});
