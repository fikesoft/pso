import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCustomerAddresses } from './api/customer-address-setup';
import type { CustomerAddressFixture } from './api/customer-address.types';
import { closeOperations } from './api/operations-setup';
import { verifyAddressResolution } from './api/customer-address-resolution.cases';
import { verifyAddressPaging } from './api/customer-address-paging.cases';
import {
  verifyAddressOrderSnapshots,
  verifyWebsiteAddress,
} from './api/customer-address-orders.cases';
import { verifyAddressScopes, verifyAddressRevocation } from './api/customer-address-access.cases';
import { noSecrets } from './api/support/harness';

let f: CustomerAddressFixture;
beforeAll(async () => {
  f = await prepareCustomerAddresses();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('creates canonical saved addresses once per key while allowing intentional duplicate addresses', async () => {
  const actor = await f.loginAddress();
  const body = f.addressBody({
    label: '  Acasă  ',
    address: '  Strada  Ștefan 12  ',
    instructions: '  ',
  });
  const accepted = await Promise.all(
    Array.from({ length: 3 }, () => actor.expect(f.path(), 'POST', body)),
  );
  expect(new Set(accepted.map((value) => value.address.id)).size).toBe(1);
  expect(accepted[0].address).toMatchObject({
    customerId: f.customer.id,
    version: 1,
    status: 'ACTIVE',
    label: 'Acasă',
    address: 'Strada  Ștefan 12',
    instructions: null,
  });
  expect(Object.keys(accepted[0].address).sort()).toEqual([
    'address',
    'customerId',
    'id',
    'instructions',
    'label',
    'status',
    'version',
  ]);
  expect(
    await actor.expect(f.path(), 'POST', {
      ...body,
      label: 'Acasă',
      address: 'Strada  Ștefan 12',
      instructions: null,
    }),
  ).toEqual(accepted[0]);
  expect((await actor.call(f.path(), 'POST', { ...body, address: 'Altă stradă' })).status).toBe(
    409,
  );
  const duplicate = await actor.expect(f.path(), 'POST', { ...body, requestKey: randomUUID() });
  expect(duplicate.address.id).not.toBe(accepted[0].address.id);
  const collision = f.addressBody();
  const races = await Promise.all([
    actor.call(f.path(), 'POST', collision),
    actor.call(f.path(), 'POST', { ...collision, label: 'Birou' }),
  ]);
  expect(races.map((value) => value.status).sort()).toEqual([200, 409]);
  const mismatch = f.addressBody();
  expect(
    (await actor.call(f.path(), 'POST', mismatch, { 'Idempotency-Key': randomUUID() })).status,
  ).toBe(400);
  const created = await actor.call(f.path(), 'POST', mismatch, {
    'Idempotency-Key': mismatch.requestKey,
  });
  expect(created.status).toBe(200);
  expect(created.headers.get('cache-control')).toContain('no-store');
  noSecrets(created.data);
});

it('retires absent attempts and arbitrates concurrent creation versus resolution without key resurrection', async () => {
  await verifyAddressResolution(f);
});

it('paginates active addresses with authenticated scope-bound cursors across archived anchors', async () => {
  await verifyAddressPaging(f);
});

it('archives once with exact replay and preserves current archived creation and resolution results', async () => {
  const actor = await f.loginAddress();
  const body = f.addressBody();
  const { address } = await actor.expect(f.path(), 'POST', body);
  const archive = {
    locationId: body.locationId,
    version: address.version,
    requestKey: randomUUID(),
  };
  const path = `${f.path()}/${address.id}/archive`;
  expect(
    (await actor.call(path, 'POST', archive, { 'Idempotency-Key': randomUUID() })).status,
  ).toBe(400);
  const values = await Promise.all([
    actor.expect(path, 'POST', archive),
    actor.expect(path, 'POST', archive),
  ]);
  expect(values[0]).toEqual(values[1]);
  expect(values[0].address).toMatchObject({ ...address, status: 'ARCHIVED', version: 2 });
  expect((await actor.call(path, 'POST', { ...archive, requestKey: randomUUID() })).status).toBe(
    409,
  );
  expect(await actor.expect(f.path(), 'POST', body)).toEqual(values[0]);
  expect(
    await actor.expect(`${f.path()}/creation-resolution`, 'POST', {
      locationId: body.locationId,
      requestKey: body.requestKey,
    }),
  ).toEqual({ status: 'CREATED', address: values[0].address });
  expect(
    (await actor.expect(f.listPath())).addresses.map((value: { id: string }) => value.id),
  ).not.toContain(address.id);
});

it('uses matching versioned address references and explicit clear or detach while retaining authorized history', async () => {
  await verifyAddressOrderSnapshots(f);
});

it('captures manual and accepted website delivery addresses without adding anything to the customer address book', async () => {
  await verifyWebsiteAddress(f);
});

it('requires organization customer read and independent address management with current tenant and location scope', async () => {
  await verifyAddressScopes(f);
});

it('rechecks actor binding and DENY on address and linked-order replay while historical order snapshots remain readable', async () => {
  await verifyAddressRevocation(f);
});
