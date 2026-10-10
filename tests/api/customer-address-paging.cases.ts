import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CustomerAddressFixture } from './customer-address.types';

export async function verifyAddressPaging(f: CustomerAddressFixture) {
  const actor = await f.loginAddress();
  const customer = (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;
  const addresses = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      actor.expect(
        f.path(customer.id),
        'POST',
        f.addressBody({ address: `Strada paginare ${index}` }),
      ),
    ),
  );
  const expected = addresses.map((value) => value.address.id).sort();
  const path = `${f.listPath(customer.id)}&limit=2`;
  const response = await actor.call(path);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const first = response.data;
  expect(first.addresses.map((value: { id: string }) => value.id)).toEqual(expected.slice(0, 2));
  expect(first.nextCursor).toBeTruthy();
  expect(first.nextCursor).not.toMatch(/^[\da-f-]{36}$/);
  expect(first.nextCursor).not.toContain('Strada');
  await actor.expect(`${f.path(customer.id)}/${expected[1]}/archive`, 'POST', {
    locationId: f.a.location.id,
    version: 1,
    requestKey: randomUUID(),
  });
  const next = await actor.expect(`${path}&cursor=${encodeURIComponent(first.nextCursor)}`);
  expect(next.addresses.map((value: { id: string }) => value.id)).toEqual(expected.slice(2, 4));
  const last = await actor.expect(`${path}&cursor=${encodeURIComponent(next.nextCursor)}`);
  expect(last.addresses.map((value: { id: string }) => value.id)).toEqual(expected.slice(4));
  expect(last.nextCursor).toBeNull();
  const cursor = encodeURIComponent(first.nextCursor);
  const foreign = await f.b.primary.call(
    `${f.listPath(f.foreignCustomer.id, f.b.location.id)}&cursor=${cursor}`,
  );
  expect(foreign.status).toBe(400);
  expect((await actor.call(`${f.listPath(f.secondCustomer.id)}&cursor=${cursor}`)).status).toBe(
    400,
  );
  expect(
    (await actor.call(`${f.listPath(customer.id, f.otherLocation.id)}&cursor=${cursor}`)).status,
  ).toBe(400);
  expect(
    (await (await f.loginAddress(f.otherManager)).call(`${path}&cursor=${cursor}`)).status,
  ).toBe(400);
  expect((await actor.call(`${path}&cursor=${cursor}x`)).status).toBe(400);
  expect((await actor.call(`${path}&cursor=${expected[0]}`)).status).toBe(400);
  expect((await actor.call(`${f.listPath(customer.id)}&limit=101`)).status).toBe(400);
}
