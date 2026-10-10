import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { InventoryFixture } from './inventory.types';
import { db } from './support/harness';

export async function verifyInventoryCompetingCheckouts(f: InventoryFixture) {
  const sent = await f.send();
  const pending = await f.stored(sent.order.id);
  expect(pending.lines.length).toBeGreaterThan(0);
  const path = `/orders/${sent.order.id}/checkout/manual`;
  const early = await f.a.primary.call(path, 'POST', {
    version: sent.order.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  });
  expect(early.status).toBe(409);
  expect(await f.stored(sent.order.id)).toMatchObject({
    reservation: { status: 'PENDING' },
    documents: [],
    movements: [],
  });
  const ready = await f.ready(sent.order.id, sent.ticket.id);
  const cashShiftId = (await f.cashShift()).id;
  const requests = [randomUUID(), randomUUID()].map((requestKey) => ({
    version: ready.version,
    requestKey,
    method: 'CARD',
    cashShiftId,
    confirmed: true,
  }));
  const results = await Promise.all(requests.map((body) => f.a.primary.call(path, 'POST', body)));
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const winner = results.findIndex((result) => result.status === 200);
  const replay = await f.a.primary.expect(path, 'POST', requests[winner]);
  expect(replay.receipt.id).toBe(results[winner]!.data.receipt.id);
  const stock = await f.stored(sent.order.id);
  expect(stock.reservation?.status).toBe('CONSUMED');
  expect(stock.documents).toHaveLength(1);
  expect(stock.movements).toHaveLength(pending.lines.length);
  for (const line of pending.lines) {
    expect(
      stock.movements
        .find((movement) => movement.recipeComponentId === line.recipeComponentId)
        ?.quantity.toFixed(6),
    ).toBe(`-${line.quantity.toFixed(6)}`);
  }
  const effects = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => ({
      checkouts: await tx.checkout.count({ where: { orderId: sent.order.id } }),
      payments: await tx.payment.count({ where: { orderId: sent.order.id } }),
      audits: await tx.auditEvent.count({
        where: { action: 'inventory.consumption', targetId: stock.documents[0]!.id },
      }),
    }),
  );
  expect(effects).toEqual({ checkouts: 1, payments: 1, audits: 1 });
}
