import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from './support/harness';
import type { OrderSearchFixture } from './order-search.types';

export async function verifySearchDates(f: OrderSearchFixture) {
  const template = await f.create();
  const scope = { organizationId: f.a.company.organization.id };
  const stored = await db.withTenantTransaction(db.runtime, scope, async (tx) => ({
    order: await tx.order.findUniqueOrThrow({ where: { id: template.id } }),
    item: await tx.orderItem.findFirstOrThrow({ where: { orderId: template.id } }),
  }));
  for (const [day, start, end, hours] of [
    ['2026-03-29', '2026-03-28T22:00:00.000Z', '2026-03-29T21:00:00.000Z', 23],
    ['2025-10-26', '2025-10-25T21:00:00.000Z', '2025-10-26T22:00:00.000Z', 25],
  ] as const) {
    expect((Date.parse(end) - Date.parse(start)) / 3600000).toBe(hours);
    const ids: string[] = [];
    for (const timestamp of [
      Date.parse(start) - 1,
      Date.parse(start),
      Date.parse(end) - 1,
      Date.parse(end),
    ]) {
      const id = randomUUID();
      await db.withTenantTransaction(db.runtime, scope, async (tx) => {
        const latest = await tx.order.aggregate({
          where: { locationId: f.a.location.id },
          _max: { number: true },
        });
        await tx.order.create({
          data: {
            ...stored.order,
            id,
            number: latest._max.number! + 1,
            clientRequestId: randomUUID(),
            createdAt: new Date(timestamp),
          },
        });
        await tx.orderItem.create({ data: { ...stored.item, id: randomUUID(), orderId: id } });
      });
      ids.push(id);
    }
    const page = await f.search({ createdFrom: day, createdTo: day });
    expect(page.timezone).toBe('Europe/Chisinau');
    expect(page.orders.map((order: { id: string }) => order.id).sort()).toEqual(
      ids.slice(1, 3).sort(),
    );
  }
}
