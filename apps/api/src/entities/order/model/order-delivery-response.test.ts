import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import type { StoredOrder } from './order.types';
import { orderResponse } from './order-response';

vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));

describe('istoricul livrării în răspunsul comenzii', () => {
  it('păstrează necunoscut rezultatul istoric inclusiv pentru comenzi încheiate', async () => {
    const tx = {
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
      checkout: { findFirst: vi.fn().mockResolvedValue(null) },
      packingSession: { findFirst: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn().mockResolvedValue([{ status: 'UNPAID' }]),
    } as unknown as TenantTransaction;
    for (const status of ['CONFIRMED', 'COMPLETED']) {
      const stored = {
        id: 'historical-order',
        status,
        serviceType: 'DELIVERY',
        kitchenStatus: 'READY',
        deliveryStatus: null,
        deliveryCourierId: null,
        deliveryCourierName: null,
        total: new Prisma.Decimal('10'),
        deliveryFee: new Prisma.Decimal('0'),
        deliveryFeeCommandId: null,
      } as StoredOrder;
      const response = await orderResponse(tx, stored);
      expect(response).not.toHaveProperty('customer');
      expect(response.deliveryStatus).toBeNull();
      expect(response.deliveryCourierId).toBeNull();
      expect(response.deliveryCourierName).toBeNull();
    }
  });
});
