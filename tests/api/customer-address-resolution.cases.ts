import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CustomerAddressFixture } from './customer-address.types';

export async function verifyAddressResolution(f: CustomerAddressFixture) {
  const actor = await f.loginAddress();
  const body = f.addressBody();
  const resolution = { locationId: body.locationId, requestKey: body.requestKey };
  const path = `${f.path()}/creation-resolution`;
  expect(
    (await actor.call(path, 'POST', resolution, { 'Idempotency-Key': randomUUID() })).status,
  ).toBe(400);
  const retired = await actor.expect(path, 'POST', resolution);
  expect(retired).toEqual({ status: 'RETIRED', customerId: f.customer.id, ...resolution });
  expect(await actor.expect(path, 'POST', resolution)).toEqual(retired);
  for (const late of [body, { ...body, address: 'Conținut întârziat diferit' }]) {
    const response = await actor.call(f.path(), 'POST', late);
    expect(response.status).toBe(409);
    expect(response.data.code).toBe('CUSTOMER_ADDRESS_CREATION_RETIRED');
  }
  await actor.expect(f.path(), 'POST', { ...body, requestKey: randomUUID() });
  expect(await actor.expect(path, 'POST', resolution)).toEqual(retired);
  for (let index = 0; index < 4; index++) {
    const competing = f.addressBody();
    const resolve = { locationId: competing.locationId, requestKey: competing.requestKey };
    const [create, result] = await Promise.all([
      actor.call(f.path(), 'POST', competing),
      actor.call(path, 'POST', resolve),
    ]);
    expect(result.status).toBe(200);
    if (result.data.status === 'CREATED') {
      expect(create.status).toBe(200);
      expect(result.data.address.id).toBe(create.data.address.id);
    } else {
      expect(result.data.status).toBe('RETIRED');
      expect(create.status).toBe(409);
      expect(create.data.code).toBe('CUSTOMER_ADDRESS_CREATION_RETIRED');
    }
    expect(await actor.expect(path, 'POST', resolve)).toEqual(result.data);
  }
  const live = f.addressBody();
  const created = await actor.expect(f.path(), 'POST', live);
  const anotherActor = await f.loginAddress(f.otherManager);
  expect((await anotherActor.call(f.path(), 'POST', live)).status).toBe(409);
  expect(
    (
      await anotherActor.call(path, 'POST', {
        locationId: live.locationId,
        requestKey: live.requestKey,
      })
    ).status,
  ).toBe(409);
  const otherLocation = await actor.expect(f.path(), 'POST', {
    ...live,
    locationId: f.otherLocation.id,
  });
  const otherCustomer = await actor.expect(f.path(f.secondCustomer.id), 'POST', live);
  expect(
    new Set([created.address.id, otherLocation.address.id, otherCustomer.address.id]).size,
  ).toBe(3);
}
