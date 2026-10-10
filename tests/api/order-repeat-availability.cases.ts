import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { OrderRepeatFixture } from './order-repeat.types';

export async function verifyRepeatAvailability(f: OrderRepeatFixture) {
  const products = await Promise.all(Array.from({ length: 4 }, () => f.makeProduct()));
  const order = await f.create({
    items: products.map((product) => ({ productId: product.id, quantity: '1' })),
  });
  await f.confirm(order.id);
  await f.a.primary.expect(`/catalog/products/${products[0].id}`, 'PATCH', {
    version: products[0].version,
    status: 'ARCHIVED',
  });
  await f.a.primary.expect(
    `/catalog/products/${products[1].id}/locations/${f.a.location.id}`,
    'PUT',
    { version: products[1].locationVersion, price: '10', enabled: false },
  );
  await f.a.primary.expect('/catalog/menu-schedules', 'POST', {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    name: 'Program trecut',
    eventName: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startMinute: 0,
    endMinute: 1440,
    startsOn: '2000-01-01',
    endsOn: '2000-01-02',
    productIds: [products[2].id],
  });
  const result = await f.preview(order.id);
  expect(result).toMatchObject({ canCreate: false, amountAllowed: null, estimatedTotal: null });
  for (const [index, code] of [
    'PRODUCT_UNAVAILABLE',
    'PRODUCT_DISABLED',
    'OUTSIDE_SCHEDULE',
  ].entries()) {
    const line = result.lines.find(
      (entry: { productId: string }) => entry.productId === products[index].id,
    );
    expect(line.candidate).toBeNull();
    expect(line.issues).toContainEqual(expect.objectContaining({ code, blocking: true }));
  }
  expect(result.products.map((product: { id: string }) => product.id)).not.toContain(
    products[0].id,
  );
  const target = await f.preview(order.id, f.a.primary, f.otherLocation.id);
  expect(
    target.lines.find((line: { productId: string }) => line.productId === products[3].id).issues,
  ).toContainEqual(expect.objectContaining({ code: 'LOCATION_UNCONFIGURED', blocking: true }));
  const active = result.lines.find(
    (line: { productId: string }) => line.productId === products[3].id,
  );
  expect(active.candidate).toMatchObject({ productId: products[3].id, quantity: '1.000' });
}
